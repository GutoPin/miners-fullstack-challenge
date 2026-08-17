/**
 * API client for the browser forms.
 *
 * The UI calls the same endpoints `curl` would, so the rules have no second implementation.
 * Errors are returned rather than thrown: a rejection with violations is not an exception,
 * it is the expected answer and it has to be drawn.
 */
import type { Violation } from '../domain/rules/violation';

export interface ApiError {
  code: string;
  message: string;
  canBeOverridden?: boolean;
  violations: Violation[];
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export async function postJson<T>(url: string, body?: unknown): Promise<ApiResult<T>> {
  let res: Response;

  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    // without this a dropped connection leaves the button stuck on "sending"
    return {
      ok: false,
      error: {
        code: 'OFFLINE',
        message:
          'No hay conexión con el servidor. La operación no se ejecutó: revise la red y vuelva a enviarla.',
        violations: [],
      },
    };
  }

  const payload: unknown = await res.json().catch(() => null);

  if (res.ok) return { ok: true, data: payload as T };

  const error = (payload as { error?: ApiError } | null)?.error;

  return {
    ok: false,
    error: error ?? {
      code: 'NETWORK_ERROR',
      message: `No se pudo completar la operación (HTTP ${res.status}). Reintente en unos segundos.`,
      violations: [],
    },
  };
}
