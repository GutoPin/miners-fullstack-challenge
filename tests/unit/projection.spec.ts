import { describe, expect, it } from 'vitest';

import { projectMaintenance } from '@/src/domain/projection';
import type { EquipmentSnapshot, PlannedUsage } from '@/src/domain/types';

/** CAM-002 del seed: 738,0 h con umbral 750,0 → le quedan 12 h de operación. */
function equipo(overrides: Partial<EquipmentSnapshot> = {}): EquipmentSnapshot {
  return {
    id: 'e2',
    code: 'CAM-002',
    typeId: 't-cam',
    typeName: 'Camión de acarreo',
    status: 'AVAILABLE',
    currentHours: 738,
    nextMaintenanceHours: 750,
    ...overrides,
  };
}

/** Turno programado con una asignación vigente: el caso normal. */
function turno(
  date: string,
  journey: 'DAY' | 'NIGHT',
  plannedHours: number,
  overrides: Partial<PlannedUsage> = {},
): PlannedUsage {
  return {
    date,
    journey,
    plannedHours,
    shiftStatus: 'PLANNED',
    assignmentStatus: 'ACTIVE',
    ...overrides,
  };
}

describe('projectMaintenance', () => {
  it('detecta el cruce del umbral en el tercer turno programado', () => {
    // 738 + 5 + 5 + 5 = 753 ≥ 750: cruza en el tercero, no antes.
    const r = projectMaintenance(equipo(), [
      turno('2026-08-18', 'DAY', 5),
      turno('2026-08-19', 'DAY', 5),
      turno('2026-08-20', 'DAY', 5),
    ]);

    expect(r).toMatchObject({
      status: 'WILL_CROSS',
      crossesOn: '2026-08-20',
      crossesInShift: 'DAY',
      projectedHours: 753,
      hoursRemaining: 12,
    });
  });

  it('indica en qué hora del turno se cruza el umbral', () => {
    // Le quedan 12 h y el turno dura 12: cruza justo al final del turno.
    const r = projectMaintenance(equipo(), [turno('2026-08-18', 'DAY', 12)]);

    expect(r).toMatchObject({ status: 'WILL_CROSS', hoursIntoShift: 12 });

    // Con 5 h ya consumidas antes, el cruce se adelanta a la hora 7 del segundo turno.
    const r2 = projectMaintenance(equipo(), [
      turno('2026-08-18', 'DAY', 5),
      turno('2026-08-19', 'DAY', 12),
    ]);

    expect(r2).toMatchObject({
      status: 'WILL_CROSS',
      crossesOn: '2026-08-19',
      hoursIntoShift: 7,
    });
  });

  it('ordena el turno NOCHE después del turno DÍA de la misma fecha', () => {
    // Llegan desordenados a propósito: el cruce ocurre en el turno DÍA, no en el NOCHE.
    const r = projectMaintenance(equipo({ currentHours: 740 }), [
      turno('2026-08-18', 'NIGHT', 12),
      turno('2026-08-18', 'DAY', 12),
    ]);

    expect(r).toMatchObject({
      status: 'WILL_CROSS',
      crossesOn: '2026-08-18',
      crossesInShift: 'DAY',
      hoursIntoShift: 10,
    });
  });

  it('devuelve ALREADY_BLOCKED si el equipo ya superó el umbral', () => {
    const r = projectMaintenance(
      equipo({ code: 'CAM-003', currentHours: 1253, nextMaintenanceHours: 1250 }),
      [turno('2026-08-18', 'DAY', 12)],
    );

    expect(r).toEqual({ status: 'ALREADY_BLOCKED', hoursRemaining: 0 });
  });

  it('devuelve SAFE si con todos los turnos de la semana no llega al umbral', () => {
    const r = projectMaintenance(equipo({ currentHours: 402, nextMaintenanceHours: 500 }), [
      turno('2026-08-18', 'DAY', 12),
      turno('2026-08-19', 'DAY', 12),
      turno('2026-08-20', 'DAY', 12),
    ]);

    // hoursRemaining es siempre umbral − horómetro actual (500 − 402), en las tres ramas:
    // es la columna "Faltan" de /proyeccion. El margen tras la semana sale de projectedHours.
    expect(r).toEqual({ status: 'SAFE', projectedHours: 438, hoursRemaining: 98 });
  });

  it('sin turnos programados el equipo está SAFE con su horómetro actual', () => {
    expect(projectMaintenance(equipo(), [])).toEqual({
      status: 'SAFE',
      projectedHours: 738,
      hoursRemaining: 12,
    });
  });

  it('ignora turnos CERRADOS y asignaciones CANCELADAS', () => {
    // Las tres horas ignoradas bastarían de sobra para cruzar el umbral.
    const r = projectMaintenance(equipo(), [
      turno('2026-08-18', 'DAY', 12, { shiftStatus: 'CLOSED' }),
      turno('2026-08-19', 'DAY', 12, { shiftStatus: 'CANCELLED' }),
      turno('2026-08-20', 'DAY', 12, { assignmentStatus: 'CANCELLED' }),
      turno('2026-08-21', 'DAY', 12, { assignmentStatus: 'COMPLETED' }),
    ]);

    expect(r).toEqual({ status: 'SAFE', projectedHours: 738, hoursRemaining: 12 });
  });

  it('cuenta las asignaciones EN RIESGO: siguen programadas mientras no se resuelvan', () => {
    const r = projectMaintenance(equipo(), [
      turno('2026-08-18', 'DAY', 12, { assignmentStatus: 'AT_RISK' }),
    ]);

    expect(r).toMatchObject({ status: 'WILL_CROSS', crossesOn: '2026-08-18' });
  });
});
