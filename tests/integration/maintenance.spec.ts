import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/src/db/prisma';
import { closeShift } from '@/src/services/close-shift';
import { createAssignment } from '@/src/services/create-assignment';
import { registerMaintenance } from '@/src/services/register-maintenance';
import {
  certificar,
  crearEquipo,
  crearOperador,
  crearTipo,
  crearTurno,
  crearUsuario,
  limpiar,
  marca,
} from './fixtures';

const m = marca();

let userId: string;
let typeId: string;
let equipmentId: string;
let operatorId: string;

beforeAll(async () => {
  const [usuario, tipo] = await Promise.all([crearUsuario(m), crearTipo(m, 250)]);
  userId = usuario.id;
  typeId = tipo.id;

  const equipo = await crearEquipo(m, tipo.id, { currentHours: 240, nextMaintenanceHours: 250 });
  const operador = await crearOperador(m);
  await certificar(operador.id, tipo.id);

  equipmentId = equipo.id;
  operatorId = operador.id;
});

afterAll(async () => {
  await limpiar(m);
  await prisma.$disconnect();
});

describe('registerMaintenance', () => {
  it('bloquea al cruzar el umbral y deja las asignaciones futuras en riesgo', async () => {
    const hoy = await crearTurno(0, 'DAY', 10);
    await createAssignment({ shiftId: hoy.id, equipmentId, operatorId, userId, plannedHours: 10 });

    // Un turno futuro del mismo equipo, todavía sano.
    const futuro = await crearTurno(3);
    const operadorB = await crearOperador(m, '-B');
    await certificar(operadorB.id, typeId);
    const { assignment: futura } = await createAssignment({
      shiftId: futuro.id,
      equipmentId,
      operatorId: operadorB.id,
      userId,
    });
    expect(futura.status).toBe('ACTIVE');

    const cierre = await closeShift({ shiftId: hoy.id, userId });
    expect(cierre.blockedEquipment).toHaveLength(1);
    expect(cierre.assignmentsAtRisk).toBe(1);

    const enRiesgo = await prisma.assignment.findUniqueOrThrow({ where: { id: futura.id } });
    expect(enRiesgo.status).toBe('AT_RISK');
    expect(enRiesgo.riskReason).toContain('Equipo bloqueado por mantenimiento');
  });

  it('registrar mantenimiento libera el equipo y ancla el próximo umbral', async () => {
    const antes = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
    expect(antes.status).toBe('BLOCKED');
    expect(Number(antes.currentHours)).toBe(250);

    // Entra al taller con 30 h de atraso: el siguiente umbral es 500 (250 + 250), no 530.
    const resultado = await registerMaintenance({
      equipmentId,
      userId,
      hoursAtService: 280,
      responsible: 'Taller central · Téc. de prueba',
      notes: 'Servicio de 250 h con atraso.',
    });

    expect(resultado.previousThreshold).toBe(250);
    expect(resultado.nextThreshold).toBe(500);
    expect(resultado.overdue).toBe(30);
    expect(resultado.reAnchored).toBe(false);

    const despues = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
    expect(despues.status).toBe('AVAILABLE');
    expect(Number(despues.nextMaintenanceHours)).toBe(500);
    expect(Number(despues.currentHours)).toBe(280);
  });

  it('la diferencia entre el saldo y la lectura del taller deja su asiento', async () => {
    // El equipo estaba en 250 h y el taller informó 280: 30 h que también son movimiento.
    const ajuste = await prisma.hourmeterEntry.findFirst({
      where: { equipmentId, source: 'MAINTENANCE' },
      orderBy: { createdAt: 'desc' },
    });

    expect(ajuste).not.toBeNull();
    expect(Number(ajuste?.hoursBefore)).toBe(250);
    expect(Number(ajuste?.hoursDelta)).toBe(30);
    expect(Number(ajuste?.hoursAfter)).toBe(280);
  });

  it('devuelve a ACTIVE las asignaciones que estaban EN RIESGO por ese bloqueo', async () => {
    const recuperadas = await prisma.assignment.findMany({
      where: { equipmentId, shift: { status: 'PLANNED' } },
    });

    expect(recuperadas.length).toBeGreaterThan(0);
    for (const a of recuperadas) {
      expect(a.status).toBe('ACTIVE');
      expect(a.riskReason).toBeNull();
    }

    const abiertas = await prisma.alert.count({
      where: { equipmentId, type: 'ASSIGNMENT_AT_RISK', resolvedAt: null },
    });
    expect(abiertas).toBe(0);
  });

  it('guarda responsable, observaciones y horómetro al momento (regla 3)', async () => {
    const registro = await prisma.maintenanceRecord.findFirstOrThrow({
      where: { equipmentId },
      orderBy: { createdAt: 'desc' },
    });

    expect(registro.responsible).toBe('Taller central · Téc. de prueba');
    expect(registro.notes).toBe('Servicio de 250 h con atraso.');
    expect(Number(registro.hoursAtService)).toBe(280);
    expect(Number(registro.thresholdHours)).toBe(250);
    expect(Number(registro.overdueHours)).toBe(30);
    expect(Number(registro.nextThresholdHours)).toBe(500);
    expect(registro.registeredById).toBe(userId);
  });

  it('el horómetro no retrocede', async () => {
    await expect(
      registerMaintenance({
        equipmentId,
        userId,
        hoursAtService: 100,
        responsible: 'Taller central',
      }),
    ).rejects.toMatchObject({ code: 'HOURMETER_CANNOT_DECREASE' });
  });
});
