/** UI labels and formats, in one place so every screen renders a status the same way. */
import type { AssignmentStatus, EquipmentStatus, Journey, ShiftStatus } from '../domain/types';
import { toOperationalDate } from '../services/dates';

export type Tono = 'ok' | 'aviso' | 'bloqueo' | 'taller' | 'neutro';

/** color never travels alone: there is always a label next to it */
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

const semana = new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: 'UTC' });

/** 'lun' from an operational date; formatted in UTC because the string is already local */
export function diaSemana(value: string): string {
  return semana.format(new Date(`${value}T00:00:00.000Z`)).replace('.', '');
}

/**
 * Whole days between today and a `@db.Date`; negative means past. "Today" is the calendar
 * day in Lima, not the server's local midnight: the process runs in UTC and `TZ` cannot be
 * set on Vercel, so trusting the server clock would shift an expiry by a day.
 */
export function diasHasta(value: Date, hoy = new Date()): number {
  const dia = 24 * 60 * 60 * 1000;
  const hoyEnLima = new Date(`${toOperationalDate(hoy)}T00:00:00.000Z`);

  return Math.round((value.getTime() - hoyEnLima.getTime()) / dia);
}
