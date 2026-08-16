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
 * Traduce la violación de unicidad de la base (P2002) al rechazo de negocio que
 * corresponde. Es la tercera capa de la defensa contra concurrencia
 * (`docs/ARQUITECTURA.md` §5): dos requests simultáneos pasan la validación, uno inserta
 * y el otro llega aquí.
 *
 * `meta.target` puede venir como el nombre del índice o como la lista de columnas según
 * el motor, así que se busca la palabra dentro del texto en vez de comparar formas.
 */
export function uniqueViolationToServiceError(
  error: unknown,
  labels: { equipmentCode: string; operatorName: string },
): ServiceError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return null;
  }

  const target = String(error.meta?.target ?? '');

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
