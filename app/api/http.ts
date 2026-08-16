/**
 * Piezas compartidas por los route handlers. No es un endpoint: Next solo enruta
 * los archivos `route.ts`.
 */
import type { ZodType } from 'zod';

import { ServiceError, toErrorResponse } from '@/src/services/errors';

/**
 * Identidad del que hace la llamada.
 *
 * Hasta que entre Auth.js (día 4 del plan) viaja en la cabecera `x-user-id`, para poder
 * probar los endpoints con `curl`. Cuando llegue la sesión, cambia solo esta función: el
 * contrato del cuerpo de las peticiones no se mueve.
 */
export function requireUserId(request: Request): string {
  const userId = request.headers.get('x-user-id');

  if (!userId) {
    throw new ServiceError({
      code: 'UNAUTHENTICATED',
      message: 'Falta identificar al usuario que ejecuta la acción (cabecera x-user-id).',
      status: 401,
    });
  }

  return userId;
}

/** Valida el cuerpo con Zod y devuelve un error accionable, nunca "error de validación". */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);

  if (!result.success) {
    const detalle = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'cuerpo'}: ${issue.message}`)
      .join('; ');

    throw new ServiceError({
      code: 'INVALID_REQUEST',
      message: `La solicitud tiene datos inválidos — ${detalle}.`,
      status: 400,
    });
  }

  return result.data;
}

export function errorResponse(error: unknown): Response {
  const { status, body } = toErrorResponse(error);
  return Response.json(body, { status });
}
