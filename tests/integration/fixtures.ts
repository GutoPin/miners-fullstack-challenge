/**
 * Datos aislados para los tests de integración.
 *
 * Cada test crea su propio escenario con un prefijo único y lo borra al terminar, así puede
 * correr contra una base que ya tiene el seed —o en paralelo con otro test— sin pisarse.
 */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/src/db/prisma';
import type { Journey } from '@/src/domain/types';
import { shiftWindow, toDateColumn } from '@/src/services/dates';

export function marca(): string {
  return randomUUID().slice(0, 8).toUpperCase();
}

/**
 * Los turnos tienen `UNIQUE(date, journey)`, así que dos ficheros de test —o un test y el
 * seed— no pueden usar la misma fecha. Cada fichero corre en su propio worker de Vitest y
 * se lleva un rango de fechas propio, muy por delante de lo que usa el seed.
 */
const BASE_DIAS = 400 + Math.floor(Math.random() * 20_000);

/** Fecha operativa a N días de hoy, en formato ISO. */
export function fecha(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Fecha dentro del rango reservado para este fichero de test. */
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

  // Igual que el seed: si nace con horas, nacen con su asiento. Así el invariante
  // "suma del ledger == horómetro" se puede comprobar sin excepciones.
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
 * La vigencia se cuenta **dentro del rango de fechas de este fichero**, no desde hoy: los
 * turnos de prueba viven cientos de días en el futuro y una certificación "a 180 días de
 * hoy" ya estaría vencida para ellos. La regla 9 evalúa contra la fecha del turno.
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

/**
 * Borra todo lo que creó un escenario. El orden respeta las claves foráneas: primero lo
 * que apunta, después lo apuntado.
 */
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
