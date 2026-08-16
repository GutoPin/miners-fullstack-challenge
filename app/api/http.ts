/**
 * Piezas compartidas por los route handlers. No es un endpoint: Next solo enruta
 * los archivos `route.ts`.
 */
import { randomUUID } from 'node:crypto';

import type { ZodType } from 'zod';

import { ServiceError, toErrorResponse } from '@/src/services/errors';
import type { Traza } from '@/src/services/log';

// Las guardas viven en `src/auth`: las usan también las Server Actions de las páginas.
export { requireRole, requireSession } from '@/src/auth';
export { logJson } from '@/src/services/log';

/**
 * Traza de la petición. Si la plataforma ya asignó un identificador se reutiliza —así el
 * log de la app y el de Vercel hablan del mismo suceso— y si no, se genera aquí.
 */
export function traza(request: Request, event: string): Traza {
  const id =
    request.headers.get('x-request-id') ?? request.headers.get('x-vercel-id') ?? randomUUID();

  return { requestId: id, event };
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

/**
 * Única salida de error del API. Devuelve el `requestId` en la cabecera para que quien
 * reporte un fallo pueda citarlo y se encuentre la línea exacta en los logs.
 */
export function errorResponse(error: unknown, contexto: Traza & { userId?: string }): Response {
  const { status, body } = toErrorResponse(error, contexto);

  return Response.json(body, { status, headers: { 'x-request-id': contexto.requestId } });
}
