/**
 * The only timezone arithmetic in the project: stored in UTC, shift date is a pure `date`,
 * displayed in `America/Lima`.
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import type { IsoDate, Journey } from '../domain/types';

export const TIMEZONE = 'America/Lima';

/** `@db.Date` columns come back as UTC midnight; converting to local would lose a day */
export function toIsoDate(value: Date): IsoDate {
  return value.toISOString().slice(0, 10);
}

/** real instants: which calendar day they fall on depends on the operation's timezone */
export function toOperationalDate(value: Date): IsoDate {
  return formatInTimeZone(value, TIMEZONE, 'yyyy-MM-dd');
}

/**
 * '2026-08-18' → '18/08/2026'. Takes an already converted date instead of a `Date` on
 * purpose: formatting a `@db.Date` in Lima would show the previous day.
 */
export function formatIsoDate(value: IsoDate): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

/** pure date column: '2026-08-18' → UTC midnight, no day shift */
export function toDateColumn(value: IsoDate): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** real shift window from its operational date: day starts 07:00, night 19:00, Lima time */
export function shiftWindow(
  date: IsoDate,
  journey: Journey,
  plannedHours: number,
): { startsAt: Date; endsAt: Date } {
  const inicio = journey === 'DAY' ? '07:00:00' : '19:00:00';
  const startsAt = fromZonedTime(`${date}T${inicio}`, TIMEZONE);

  return { startsAt, endsAt: new Date(startsAt.getTime() + plannedHours * 3_600_000) };
}
