/**
 * Errores de la capa de servicios.
 *
 * Un solo lugar donde nace la forma de error del API (`docs/ARQUITECTURA.md` §7):
 * `{ error: { code, message, violations[] } }`. Los route handlers solo eligen el
 * código HTTP y serializan; no arman mensajes.
 */
import { Prisma } from '../db/generated/client';
import type { Violation } from '../domain/rules/violation';

export class ServiceError extends Error {
  readonly code: string;
  readonly status: number;
  readonly violations: Violation[];
  /** Solo en rechazos de asignación: si un SUPERVISOR podría autorizar la excepción. */
  readonly canBeOverridden?: boolean;

  constructor(params: {
    code: string;
    message: string;
    status?: number;
    violations?: Violation[];
    canBeOverridden?: boolean;
  }) {
    super(params.message);
    this.name = 'ServiceError';
    this.code = params.code;
    this.status = params.status ?? 409;
    this.violations = params.violations ?? [];
    this.canBeOverridden = params.canBeOverridden;
  }

  toResponse() {
    return {
      error: {
        code: this.code,
        message: this.message,
        canBeOverridden: this.canBeOverridden,
        violations: this.violations,
      },
    };
  }
}

/**
 * Traduce cualquier error a la respuesta del API. Los route handlers solo serializan lo
 * que sale de aquí: un error inesperado nunca debe filtrar su mensaje interno al usuario.
 */
export function toErrorResponse(error: unknown): {
  status: number;
  body: ReturnType<ServiceError['toResponse']>;
} {
  if (error instanceof ServiceError) {
    return { status: error.status, body: error.toResponse() };
  }

  // Un error inesperado no se muestra al usuario, pero tampoco se pierde: queda en los
  // logs del servidor como JSON, que es donde hay que ir a buscarlo.
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'unhandled_error',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );

  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Ocurrió un error inesperado al procesar la solicitud. Intente nuevamente.',
        canBeOverridden: undefined,
        violations: [],
      },
    },
  };
}

/**
 * Traduce la violación de unicidad de la base (P2002) al rechazo de negocio que
 * corresponde. Es la tercera capa de la defensa contra concurrencia
 * (`docs/ARQUITECTURA.md` §5): dos requests simultáneos pasan la validación, uno inserta
 * y el otro llega aquí.
 *
 * Qué índice se violó se averigua mirando `meta.target` **y** el mensaje: con el driver
 * adapter de Prisma 7, `meta.target` llega vacío y los nombres de las columnas solo
 * aparecen en el texto del error ("Unique constraint failed on the fields: …"). Se busca la
 * palabra dentro de ambos, así funciona tanto si viene el nombre del índice como si viene
 * la lista de columnas.
 */
export function uniqueViolationToServiceError(
  error: unknown,
  labels: { equipmentCode: string; operatorName: string },
): ServiceError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return null;
  }

  const target = `${String(error.meta?.target ?? '')} ${error.message}`.toLowerCase();

  if (target.includes('equipment')) {
    return new ServiceError({
      code: 'EQUIPMENT_ALREADY_ASSIGNED',
      message: `Otro usuario acaba de tomar ${labels.equipmentCode} para este turno. Actualice la pantalla y elija otro equipo.`,
      status: 409,
    });
  }

  if (target.includes('operator')) {
    return new ServiceError({
      code: 'OPERATOR_ALREADY_ASSIGNED',
      message: `Otro usuario acaba de asignar a ${labels.operatorName} en este turno. Actualice la pantalla y elija otro operador.`,
      status: 409,
    });
  }

  return null;
}
