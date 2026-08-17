/**
 * Structured logging: one JSON line per event.
 *
 * JSON rather than free text because a log is only useful if it can be searched: filtering
 * by `requestId` in Vercel brings back every line of that request. Rejections, authorized
 * overrides and shift closes are logged; reads are not.
 */
export interface Traza {
  /** request identifier, also returned as the `x-request-id` header */
  requestId: string;
  /** what was attempted, in business terms: `assignment.create` */
  event: string;
}

type Campos = Traza & { level?: 'info' | 'warn' | 'error' } & Record<string, unknown>;

export function logJson(fields: Campos): void {
  const linea = JSON.stringify({ level: 'info', at: new Date().toISOString(), ...fields });

  // only unexpected failures go to stderr, so alerts on it ignore business rejections
  if (fields.level === 'error') console.error(linea);
  else console.info(linea);
}
