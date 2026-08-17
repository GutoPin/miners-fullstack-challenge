/**
 * Seven-day maintenance projection (rule 12).
 *
 * Current state is not enough: the threshold can be crossed mid-week, so the upcoming
 * shifts are simulated one by one in chronological order.
 */
import type { EquipmentSnapshot, IsoDate, Journey, PlannedUsage } from './types';

export type ProjectionResult =
  /** already past its threshold: blocked right now */
  | { status: 'ALREADY_BLOCKED'; hoursRemaining: 0 }
  /** crosses the threshold inside the projected window */
  | {
      status: 'WILL_CROSS';
      crossesOn: IsoDate;
      crossesInShift: Journey;
      /** hour of the shift at which it crosses */
      hoursIntoShift: number;
      projectedHours: number;
      hoursRemaining: number;
    }
  /** does not reach the threshold with every scheduled shift */
  | {
      status: 'SAFE';
      projectedHours: number;
      hoursRemaining: number;
    };
// hoursRemaining means the same in all three branches: threshold − current hourmeter

export function projectMaintenance(
  equipment: EquipmentSnapshot,
  upcoming: PlannedUsage[],
): ProjectionResult {
  let hours = equipment.currentHours;
  const threshold = equipment.nextMaintenanceHours;

  if (hours >= threshold) return { status: 'ALREADY_BLOCKED', hoursRemaining: 0 };

  for (const shift of enOrden(upcoming)) {
    const before = hours;
    hours += shift.plannedHours;

    if (hours >= threshold) {
      return {
        status: 'WILL_CROSS',
        crossesOn: shift.date,
        crossesInShift: shift.journey,
        hoursIntoShift: threshold - before,
        projectedHours: hours,
        hoursRemaining: threshold - equipment.currentHours,
      };
    }
  }

  return {
    status: 'SAFE',
    projectedHours: hours,
    hoursRemaining: threshold - equipment.currentHours,
  };
}

/** only work that will actually happen, chronologically: night runs after day of the same date */
function enOrden(upcoming: PlannedUsage[]): PlannedUsage[] {
  return upcoming
    .filter(
      (u) =>
        u.shiftStatus === 'PLANNED' &&
        (u.assignmentStatus === 'ACTIVE' || u.assignmentStatus === 'AT_RISK'),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || orden(a.journey) - orden(b.journey));
}

const orden = (journey: Journey): number => (journey === 'DAY' ? 0 : 1);
