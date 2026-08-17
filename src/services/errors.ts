/**
 * Service layer errors.
 *
 * The API error shape `{ error: { code, message, violations[] } }` is born here and
 * nowhere else; route handlers only serialize what comes out.
 */
import { Prisma } from '../db/generated/client';
import type { Violation } from '../domain/rules/violation';
import { logJson, type Traza } from './log';

export class ServiceError extends Error {
  readonly code: string;
  readonly status: number;
  readonly violations: Violation[];
  /** assignment rejections only: whether a SUPERVISOR could authorize the exception */
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

/** translates any error into the API response and logs it; internals never reach the user */
export function toErrorResponse(
  error: unknown,
  traza: Traza & { userId?: string },
): {
  status: number;
  body: ReturnType<ServiceError['toResponse']>;
} {
  if (error instanceof ServiceError) {
    // a business rejection is not a failure: warn level, with its code, so it can be counted
    logJson({
      ...traza,
      level: 'warn',
      outcome: 'rejected',
      code: error.code,
      status: error.status,
      violations: error.violations.map((v) => v.code),
    });

    return { status: error.status, body: error.toResponse() };
  }

  logJson({
    ...traza,
    level: 'error',
    outcome: 'failed',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: `Ocurrió un error inesperado al procesar la solicitud. Vuelva a intentarlo; si persiste, reporte la referencia ${traza.requestId}.`,
        canBeOverridden: undefined,
        violations: [],
      },
    },
  };
}

/**
 * Turns a unique violation (P2002) into the matching business rejection: the third layer
 * of the concurrency defence, reached when two requests pass validation and one inserts
 * first.
 *
 * Both `meta.target` and the message are searched because with the Prisma 7 driver adapter
 * `meta.target` comes back empty and the column names only appear in the error text.
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
