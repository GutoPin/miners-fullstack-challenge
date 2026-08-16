import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/src/db/prisma';
import { closeShift } from '@/src/services/close-shift';
import { createAssignment } from '@/src/services/create-assignment';
import { ServiceError } from '@/src/services/errors';
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

/**
 * Cada caso monta su propio equipo y operador. Compartirlos haría que un test dependiera
 * de las horas que sumó el anterior, y un test que solo pasa en cierto orden no prueba nada.
 */
async function escenario(sufijo: string, horas: number, umbral: number) {
  const equipo = await crearEquipo(`${m}${sufijo}`, typeId, {
    currentHours: horas,
    nextMaintenanceHours: umbral,
  });
  const operador = await crearOperador(m, `-${sufijo}`);
  await certificar(operador.id, typeId);

  return { equipmentId: equipo.id, operatorId: operador.id, code: equipo.code };
}

beforeAll(async () => {
  const [usuario, tipo] = await Promise.all([crearUsuario(m), crearTipo(m, 250)]);
  userId = usuario.id;
  typeId = tipo.id;
});

afterAll(async () => {
  await limpiar(m);
  await prisma.$disconnect();
});

describe('closeShift', () => {
  it('suma las horas reales al horómetro y deja asiento en el ledger', async () => {
    const { equipmentId, operatorId } = await escenario('A', 100, 1000);
    const turno = await crearTurno(1);
    const { assignment } = await createAssignment({ shiftId: turno.id, equipmentId, operatorId, userId });

    await closeShift({
      shiftId: turno.id,
      userId,
      actualHours: { [assignment.id]: 10 },
      notes: { [assignment.id]: 'Parada por lluvia.' },
    });

    const equipo = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
    expect(Number(equipo.currentHours)).toBe(110);

    const asiento = await prisma.hourmeterEntry.findFirstOrThrow({
      where: { referenceId: assignment.id, source: 'SHIFT_CLOSE' },
    });
    expect(Number(asiento.hoursBefore)).toBe(100);
    expect(Number(asiento.hoursDelta)).toBe(10);
    expect(Number(asiento.hoursAfter)).toBe(110);

    // Se guardan las reales y las planificadas: el desvío es información de negocio.
    const cerrada = await prisma.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(cerrada.status).toBe('COMPLETED');
    expect(Number(cerrada.actualHours)).toBe(10);
    expect(Number(cerrada.plannedHours)).toBe(12);
  });

  it('bloquea el equipo cuando el cierre cruza el umbral (regla 10 → regla 2)', async () => {
    const { equipmentId, operatorId, code } = await escenario('B', 738, 750);
    const turno = await crearTurno(2);
    await createAssignment({ shiftId: turno.id, equipmentId, operatorId, userId });

    const resultado = await closeShift({ shiftId: turno.id, userId });

    expect(resultado.blockedEquipment).toContain(code);

    const equipo = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
    expect(equipo.status).toBe('BLOCKED');
    expect(Number(equipo.currentHours)).toBe(750);
  });

  it('marca EN_RIESGO las asignaciones futuras del equipo bloqueado', async () => {
    const { equipmentId, operatorId } = await escenario('C', 738, 750);
    const operadorFuturo = await crearOperador(m, '-C2');
    await certificar(operadorFuturo.id, typeId);

    const hoy = await crearTurno(3);
    const futuro = await crearTurno(5);

    await createAssignment({ shiftId: hoy.id, equipmentId, operatorId, userId });
    const { assignment: futura } = await createAssignment({
      shiftId: futuro.id,
      equipmentId,
      operatorId: operadorFuturo.id,
      userId,
    });
    expect(futura.status).toBe('ACTIVE');

    const resultado = await closeShift({ shiftId: hoy.id, userId });
    expect(resultado.assignmentsAtRisk).toBe(1);

    // No se cancela: queda en riesgo y con alerta, para que alguien decida (DECISIONES §2.1).
    const despues = await prisma.assignment.findUniqueOrThrow({ where: { id: futura.id } });
    expect(despues.status).toBe('AT_RISK');
    expect(despues.riskReason).toContain('Equipo bloqueado por mantenimiento');

    const alerta = await prisma.alert.findFirstOrThrow({
      where: { assignmentId: futura.id, type: 'ASSIGNMENT_AT_RISK' },
    });
    expect(alerta.severity).toBe('CRITICAL');
    expect(alerta.resolvedAt).toBeNull();
  });

  it('exige nota cuando el desvío supera 2 horas', async () => {
    const { equipmentId, operatorId } = await escenario('D', 100, 1000);
    const turno = await crearTurno(6);
    const { assignment } = await createAssignment({ shiftId: turno.id, equipmentId, operatorId, userId });

    await expect(
      closeShift({ shiftId: turno.id, userId, actualHours: { [assignment.id]: 6 } }),
    ).rejects.toMatchObject({ code: 'VARIANCE_NOTE_REQUIRED' });

    // El rechazo no dejó nada a medias: ni asiento ni horómetro movido.
    expect(await prisma.hourmeterEntry.count({ where: { referenceId: assignment.id } })).toBe(0);
    const equipo = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
    expect(Number(equipo.currentHours)).toBe(100);

    await closeShift({
      shiftId: turno.id,
      userId,
      actualHours: { [assignment.id]: 6 },
      notes: { [assignment.id]: 'Frente cerrado por voladura programada.' },
    });

    const cerrada = await prisma.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(cerrada.varianceNote).toBe('Frente cerrado por voladura programada.');
  });

  it('es idempotente: cerrar dos veces el mismo turno falla con SHIFT_NOT_PLANNED', async () => {
    const { equipmentId, operatorId } = await escenario('E', 0, 5000);
    const turno = await crearTurno(7);
    await createAssignment({ shiftId: turno.id, equipmentId, operatorId, userId });

    await closeShift({ shiftId: turno.id, userId });

    await expect(closeShift({ shiftId: turno.id, userId })).rejects.toBeInstanceOf(ServiceError);
    await expect(closeShift({ shiftId: turno.id, userId })).rejects.toMatchObject({
      code: 'SHIFT_NOT_PLANNED',
    });

    // El segundo intento no volvió a sumar horas: un solo asiento de cierre.
    const cierres = await prisma.hourmeterEntry.count({
      where: { equipmentId, source: 'SHIFT_CLOSE' },
    });
    expect(cierres).toBe(1);
  });

  it('la suma de los asientos del ledger es igual al horómetro actual', async () => {
    const { equipmentId, operatorId } = await escenario('F', 200, 5000);

    for (const dia of [8, 9, 10]) {
      const turno = await crearTurno(dia);
      await createAssignment({ shiftId: turno.id, equipmentId, operatorId, userId });
      await closeShift({ shiftId: turno.id, userId });
    }

    const equipo = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
    const asientos = await prisma.hourmeterEntry.findMany({ where: { equipmentId } });
    const suma = asientos.reduce((t, h) => t + Number(h.hoursDelta), 0);

    expect(suma).toBe(Number(equipo.currentHours));
    expect(Number(equipo.currentHours)).toBe(200 + 36);
  });
});
