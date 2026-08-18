/**
 * Feeds the 7-day projection view (rule 12).
 *
 * SQL only fetches rows; who crosses the threshold and when is decided by the domain
 * simulation.
 */
import { prisma } from '../db/prisma';
import { projectMaintenance, type ProjectionResult } from '../domain/projection';
import type { PlannedUsage } from '../domain/types';
import { toIsoDate, toOperationalDate } from './dates';

export interface ProjectionRow {
  equipmentId: string;
  code: string;
  typeName: string;
  status: string;
  currentHours: number;
  nextMaintenanceHours: number;
  /** scheduled shifts that fed the simulation */
  plannedShifts: number;
  /** hours those shifts commit in total, to compare against the remaining margin */
  plannedHours: number;
  projection: ProjectionResult;
}

export async function getProjection(days = 7, today = new Date()): Promise<ProjectionRow[]> {
  const desde = new Date(`${toOperationalDate(today)}T00:00:00.000Z`);
  const hasta = new Date(desde);
  hasta.setUTCDate(hasta.getUTCDate() + days);

  const equipos = await prisma.equipment.findMany({
    include: {
      type: true,
      assignments: {
        where: {
          status: { in: ['ACTIVE', 'AT_RISK'] },
          shift: { status: 'PLANNED', date: { gte: desde, lte: hasta } },
        },
        include: { shift: true },
      },
    },
    orderBy: { code: 'asc' },
  });

  const filas = equipos.map((equipment) => {
    const upcoming: PlannedUsage[] = equipment.assignments.map((a) => ({
      date: toIsoDate(a.shift.date),
      journey: a.shift.journey,
      plannedHours: Number(a.plannedHours),
      shiftStatus: a.shift.status,
      assignmentStatus: a.status,
    }));

    return {
      equipmentId: equipment.id,
      code: equipment.code,
      typeName: equipment.type.name,
      status: equipment.status,
      currentHours: Number(equipment.currentHours),
      nextMaintenanceHours: Number(equipment.nextMaintenanceHours),
      plannedShifts: upcoming.length,
      plannedHours: upcoming.reduce((total, u) => total + u.plannedHours, 0),
      projection: projectMaintenance(
        {
          id: equipment.id,
          code: equipment.code,
          typeId: equipment.typeId,
          typeName: equipment.type.name,
          status: equipment.status,
          currentHours: Number(equipment.currentHours),
          nextMaintenanceHours: Number(equipment.nextMaintenanceHours),
        },
        upcoming,
      ),
    };
  });

  // by urgency: blocked first, then whatever crosses soonest, then by remaining margin
  return filas.sort((a, b) => urgencia(a) - urgencia(b) || desempate(a, b));
}

function urgencia(row: ProjectionRow): number {
  if (row.projection.status === 'ALREADY_BLOCKED') return 0;
  return row.projection.status === 'WILL_CROSS' ? 1 : 2;
}

function desempate(a: ProjectionRow, b: ProjectionRow): number {
  if (a.projection.status === 'WILL_CROSS' && b.projection.status === 'WILL_CROSS') {
    return a.projection.crossesOn.localeCompare(b.projection.crossesOn);
  }

  return a.projection.hoursRemaining - b.projection.hoursRemaining;
}
