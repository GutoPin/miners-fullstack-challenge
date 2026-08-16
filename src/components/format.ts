/**
 * Textos y formatos de la interfaz. Un solo lugar para que "AT_RISK" se lea igual en las
 * cinco pantallas y para que las horas se escriban siempre con el mismo formato.
 */
import type { AssignmentStatus, EquipmentStatus, Journey, ShiftStatus } from '../domain/types';
import { toOperationalDate } from '../services/dates';

export type Tono = 'ok' | 'aviso' | 'bloqueo' | 'taller' | 'neutro';

/** Estados de `docs/UI.md` §3. El color nunca va solo: siempre hay texto. */
export const ESTADO_EQUIPO: Record<EquipmentStatus, { label: string; tono: Tono }> = {
  AVAILABLE: { label: 'Disponible', tono: 'ok' },
  BLOCKED: { label: 'Bloqueado', tono: 'bloqueo' },
  IN_MAINTENANCE: { label: 'En mantenimiento', tono: 'taller' },
  OUT_OF_SERVICE: { label: 'Fuera de servicio', tono: 'neutro' },
};

export const ESTADO_ASIGNACION: Record<AssignmentStatus, { label: string; tono: Tono }> = {
  ACTIVE: { label: 'Activa', tono: 'ok' },
  AT_RISK: { label: 'En riesgo', tono: 'aviso' },
  CANCELLED: { label: 'Cancelada', tono: 'neutro' },
  COMPLETED: { label: 'Completada', tono: 'neutro' },
};

export const ESTADO_TURNO: Record<ShiftStatus, { label: string; tono: Tono }> = {
  PLANNED: { label: 'Planificado', tono: 'ok' },
  CLOSED: { label: 'Cerrado', tono: 'neutro' },
  CANCELLED: { label: 'Cancelado', tono: 'neutro' },
};

export const JORNADA: Record<Journey, string> = { DAY: 'Día', NIGHT: 'Noche' };

const horas = new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatHoras(value: number | { toString(): string }): string {
  return horas.format(Number(value));
}

/**
 * Días entre hoy y una fecha `@db.Date`, en días completos. Negativo = ya pasó.
 *
 * "Hoy" es el día de calendario en Lima, no la medianoche local del servidor: en Vercel el
 * proceso corre en UTC y `TZ` es una variable reservada que no se puede definir, así que
 * depender del reloj del servidor haría que un vencimiento se viera un día corrido.
 */
export function diasHasta(value: Date, hoy = new Date()): number {
  const dia = 24 * 60 * 60 * 1000;
  const hoyEnLima = new Date(`${toOperationalDate(hoy)}T00:00:00.000Z`);

  return Math.round((value.getTime() - hoyEnLima.getTime()) / dia);
}
