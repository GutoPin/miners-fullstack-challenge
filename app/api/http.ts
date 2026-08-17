/** Shared pieces for the route handlers. Not an endpoint: Next only routes `route.ts`. */
import { randomUUID } from 'node:crypto';

import type { ZodType } from 'zod';

import { ServiceError, toErrorResponse } from '@/src/services/errors';
import type { Traza } from '@/src/services/log';

// the guards live in src/auth: the pages' server actions use them too
export { requireRole, requireSession } from '@/src/auth';
export { logJson } from '@/src/services/log';

/** reuses the platform's request id when there is one, so both logs name the same event */
export function traza(request: Request, event: string): Traza {
  const id =
    request.headers.get('x-request-id') ?? request.headers.get('x-vercel-id') ?? randomUUID();

  return { requestId: id, event };
}

/** zod validation with an actionable message, never a bare "validation error" */
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

/** the API's only error exit; returns the requestId so a report can be traced to its line */
export function errorResponse(error: unknown, contexto: Traza & { userId?: string }): Response {
  const { status, body } = toErrorResponse(error, contexto);

  return Response.json(body, { status, headers: { 'x-request-id': contexto.requestId } });
}
