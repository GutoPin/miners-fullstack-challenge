/**
 * Piezas compartidas por los route handlers. No es un endpoint: Next solo enruta
 * los archivos `route.ts`.
 */
import type { ZodType } from 'zod';

import { ServiceError, toErrorResponse } from '@/src/services/errors';

// Las guardas viven en `src/auth`: las usan también las Server Actions de las páginas.
export { requireRole, requireSession } from '@/src/auth';

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
