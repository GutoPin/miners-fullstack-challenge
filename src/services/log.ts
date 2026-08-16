/**
 * Log estructurado: una línea JSON por suceso (`docs/ARQUITECTURA.md` §7).
 *
 * Es JSON y no texto libre porque el log solo sirve si se puede buscar: en Vercel se filtra
 * por `requestId` y aparecen todas las líneas de esa misma petición. Se registran los
 * rechazos, las excepciones autorizadas y los cierres de turno; no las lecturas.
 */
export interface Traza {
  /** Identificador de la petición. Se repite en la respuesta como cabecera `x-request-id`. */
  requestId: string;
  /** Qué se intentó hacer, en el vocabulario del negocio: `assignment.create`. */
  event: string;
}

type Campos = Traza & { level?: 'info' | 'warn' | 'error' } & Record<string, unknown>;

export function logJson(fields: Campos): void {
  const linea = JSON.stringify({ level: 'info', at: new Date().toISOString(), ...fields });

  // Solo lo inesperado va a stderr: así una alerta sobre stderr no se dispara con los
  // rechazos de negocio, que son funcionamiento normal.
  if (fields.level === 'error') console.error(linea);
  else console.info(linea);
}
