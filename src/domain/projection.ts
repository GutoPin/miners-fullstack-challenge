/**
 * Proyección de mantenimiento a 7 días (regla 12).
 *
 * No se resuelve mirando el estado actual: hay que simular el futuro turno a turno,
 * porque el umbral puede cruzarse a mitad de la semana y el orden de los turnos importa.
 */
import type { EquipmentSnapshot, IsoDate, Journey, PlannedUsage } from './types';

export type ProjectionResult =
  /** Ya superó su umbral: está (o debería estar) bloqueado ahora mismo. */
  | { status: 'ALREADY_BLOCKED'; hoursRemaining: 0 }
  /** Cruza el umbral dentro de la ventana proyectada. */
  | {
      status: 'WILL_CROSS';
      crossesOn: IsoDate;
      crossesInShift: Journey;
      /** Hora del turno en la que cruza: permite decidir si conviene acortarlo. */
      hoursIntoShift: number;
      projectedHours: number;
      /** Horas de operación que le quedan desde su horómetro actual. */
      hoursRemaining: number;
    }
  /** Con todos los turnos programados no llega al umbral. */
  | {
      status: 'SAFE';
      projectedHours: number;
      /** Horas de operación que le quedan desde su horómetro actual. */
      hoursRemaining: number;
    };
// `hoursRemaining` significa lo mismo en las tres ramas: umbral − horómetro actual, la
// columna "Faltan" de /proyeccion. El margen que sobra tras la semana se deduce de
// `projectedHours` y no necesita un campo que cambie de significado según el estado.

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
        hoursIntoShift: threshold - before, // en qué hora del turno cruza
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

/**
 * Solo cuenta el trabajo que realmente va a ocurrir, en orden cronológico: el turno
 * NOCHE del día D se opera después del turno DÍA del mismo D.
 */
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
