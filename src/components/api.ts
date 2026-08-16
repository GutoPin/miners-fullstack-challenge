/**
 * Cliente del API para los formularios del navegador.
 *
 * La UI llama a los mismos endpoints que probaría un `curl`: no hay una segunda
 * implementación de las reglas en el cliente. Devuelve el error en vez de lanzarlo, porque
 * un rechazo con violaciones **no es una excepción**: es la respuesta esperada y hay que
 * dibujarla.
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
    // Sin esto, una conexión caída deja el botón en "Enviando…" para siempre: la promesa
    // se rechaza y el formulario nunca se entera. En faena la conexión se cae.
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
