/**
 * La única aritmética de zona horaria del proyecto (CLAUDE.md §8): se almacena en UTC,
 * la fecha del turno es un `date` puro y se muestra en `America/Lima`.
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import type { IsoDate, Journey } from '../domain/types';

export const TIMEZONE = 'America/Lima';

/**
 * Columnas `@db.Date` (`Shift.date`, `Certification.expiresAt`): Prisma las devuelve como
 * medianoche UTC, así que la fecha sale del propio ISO. Convertirlas a la zona local aquí
 * las correría un día hacia atrás.
 */
export function toIsoDate(value: Date): IsoDate {
  return value.toISOString().slice(0, 10);
}

/**
 * Instantes reales (`Shift.startsAt` / `endsAt`): en qué día de calendario caen depende de
 * la zona de la operación. Un turno noche que termina 07:00 en Lima es 12:00 UTC del mismo
 * día, pero uno que termina 20:00 en Lima ya es del día siguiente en UTC.
 */
export function toOperationalDate(value: Date): IsoDate {
  return formatInTimeZone(value, TIMEZONE, 'yyyy-MM-dd');
}

/**
 * Para los mensajes al usuario: '2026-08-18' → '18/08/2026'.
 *
 * Recibe la fecha ya convertida (con `toIsoDate` o `toOperationalDate`) y no un `Date`, a
 * propósito: formatear en Lima un `@db.Date`, que es medianoche UTC, mostraría el día
 * anterior. Con una sola entrada posible ese error no se puede cometer.
 */
export function formatIsoDate(value: IsoDate): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

/** La columna `date` es fecha pura: '2026-08-18' → medianoche UTC, sin correr el día. */
export function toDateColumn(value: IsoDate): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Ventana real del turno a partir de su fecha operativa: DÍA empieza 07:00 y NOCHE 19:00,
 * hora de Lima. Se guarda el instante en UTC, que es contra lo que se compara si una
 * certificación vence a mitad de turno.
 */
export function shiftWindow(
  date: IsoDate,
  journey: Journey,
  plannedHours: number,
): { startsAt: Date; endsAt: Date } {
  const inicio = journey === 'DAY' ? '07:00:00' : '19:00:00';
  const startsAt = fromZonedTime(`${date}T${inicio}`, TIMEZONE);

  return { startsAt, endsAt: new Date(startsAt.getTime() + plannedHours * 3_600_000) };
}
