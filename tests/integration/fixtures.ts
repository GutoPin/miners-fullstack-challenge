/**
 * Isolated data for the integration tests.
 *
 * Each test builds its own scenario behind a unique prefix and deletes it afterwards, so it
 * can run against a seeded database, or next to another test, without collisions.
 */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/src/db/prisma';
import type { Journey } from '@/src/domain/types';
import { shiftWindow, toDateColumn } from '@/src/services/dates';

export function marca(): string {
  return randomUUID().slice(0, 8).toUpperCase();
}

/**
 * Shifts are `UNIQUE(date, journey)`, so two files — or a file and the seed — cannot share a
 * date. Each file takes its own date range, far ahead of anything the seed uses.
 */
const BASE_DIAS = 400 + Math.floor(Math.random() * 20_000);

/** operational date N days from today */
export function fecha(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** date inside the range reserved for this test file */
function fechaDeTurno(offsetDays: number): string {
  return fecha(BASE_DIAS + offsetDays);
}

const turnosCreados: string[] = [];

export async function crearUsuario(m: string, role: 'SUPERVISOR' | 'PLANNER' | 'VIEWER' = 'PLANNER') {
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${m}@test.local`,
      name: `Usuario ${m}`,
      passwordHash: 'no-se-usa-en-estos-tests',
      role,
    },
  });
}

export async function crearTipo(m: string, maintenanceIntervalHours = 250) {
  return prisma.equipmentType.create({
    data: { code: `T-${m}`, name: `Tipo ${m}`, maintenanceIntervalHours },
  });
}

export async function crearEquipo(
  m: string,
  typeId: string,
  opts: { currentHours: number; nextMaintenanceHours: number; status?: 'AVAILABLE' | 'BLOCKED' } = {
    currentHours: 0,
    nextMaintenanceHours: 250,
  },
) {
  const equipo = await prisma.equipment.create({
    data: {
      code: `EQ-${m}`,
      typeId,
      currentHours: opts.currentHours,
      nextMaintenanceHours: opts.nextMaintenanceHours,
      status: opts.status ?? 'AVAILABLE',
    },
  });

  // like the seed: hours are born with their entry, so the ledger invariant always holds
  if (opts.currentHours > 0) {
    await prisma.hourmeterEntry.create({
      data: {
        equipmentId: equipo.id,
        source: 'INITIAL_LOAD',
        hoursBefore: 0,
        hoursDelta: opts.currentHours,
        hoursAfter: opts.currentHours,
      },
    });
  }

  return equipo;
}

export async function crearOperador(m: string, sufijo = '') {
  return prisma.operator.create({
    data: {
      code: `OP-${m}${sufijo}`,
      fullName: `Operador ${m}${sufijo}`,
      document: `${m}${sufijo}`.padEnd(10, '0'),
    },
  });
}

/**
 * Validity is counted inside this file's date range, not from today: the test shifts live
 * hundreds of days ahead, where a certification "180 days from now" would already be
 * expired. Rule 9 evaluates against the shift date.
 */
export async function certificar(operatorId: string, equipmentTypeId: string, diasVigencia = 180) {
  return prisma.certification.create({
    data: {
      operatorId,
      equipmentTypeId,
      issuedAt: toDateColumn(fecha(-30)),
      expiresAt: toDateColumn(fechaDeTurno(diasVigencia)),
    },
  });
}

export async function crearTurno(offsetDias: number, journey: Journey = 'DAY', plannedHours = 12) {
  const date = fechaDeTurno(offsetDias);

  const turno = await prisma.shift.create({
    data: {
      date: toDateColumn(date),
      journey,
      plannedHours,
      ...shiftWindow(date, journey, plannedHours),
    },
  });

  turnosCreados.push(turno.id);

  return turno;
}

/** deletes everything a scenario created, in foreign key order */
export async function limpiar(m: string) {
  const equipos = await prisma.equipment.findMany({ where: { code: { contains: m } }, select: { id: true } });
  const operadores = await prisma.operator.findMany({ where: { code: { contains: m } }, select: { id: true } });
  const equipmentId = { in: equipos.map((e) => e.id) };
  const operatorId = { in: operadores.map((o) => o.id) };

  const asignaciones = await prisma.assignment.findMany({
    where: { OR: [{ equipmentId }, { operatorId }] },
    select: { id: true, shiftId: true },
  });
  const assignmentId = { in: asignaciones.map((a) => a.id) };

  await prisma.alert.deleteMany({ where: { OR: [{ equipmentId }, { assignmentId }] } });
  await prisma.assignmentOverride.deleteMany({ where: { assignmentId } });
  await prisma.hourmeterEntry.deleteMany({ where: { equipmentId } });
  await prisma.maintenanceRecord.deleteMany({ where: { equipmentId } });
  await prisma.assignment.deleteMany({ where: { id: assignmentId } });
  await prisma.shift.deleteMany({ where: { id: { in: turnosCreados } } });
  await prisma.certification.deleteMany({ where: { operatorId } });
  await prisma.equipment.deleteMany({ where: { id: equipmentId } });
  await prisma.operator.deleteMany({ where: { id: operatorId } });
  await prisma.equipmentType.deleteMany({ where: { code: { contains: m } } });
  await prisma.user.deleteMany({ where: { email: { contains: m } } });
}
