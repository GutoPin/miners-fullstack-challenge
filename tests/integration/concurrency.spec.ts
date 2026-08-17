/**
 * Two supervisors assigning the same equipment to the same shift at the same time.
 *
 * It does not assert that a transaction exists; it asserts the observable outcome — exactly
 * one assignment lands and the database never ends up inconsistent.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/src/db/prisma';
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
let equipmentId: string;

beforeAll(async () => {
  const [usuario, tipo] = await Promise.all([crearUsuario(m, 'SUPERVISOR'), crearTipo(m, 500)]);
  userId = usuario.id;
  typeId = tipo.id;

  const equipo = await crearEquipo(m, tipo.id, { currentHours: 0, nextMaintenanceHours: 5000 });
  equipmentId = equipo.id;
});

afterAll(async () => {
  await limpiar(m);
  await prisma.$disconnect();
});

/** the loser may come from the domain rule or from the unique index; both are valid */
function rechazaPorCupoTomado(reason: unknown): boolean {
  if (!(reason instanceof ServiceError)) return false;

  return (
    reason.code === 'EQUIPMENT_ALREADY_ASSIGNED' ||
    reason.violations.some((v) => v.code === 'EQUIPMENT_ALREADY_ASSIGNED')
  );
}

describe('concurrencia sobre el mismo cupo', () => {
  it('dos supervisores asignando el mismo equipo al mismo turno: solo uno entra', async () => {
    const turno = await crearTurno(10);
    const [opA, opB] = await Promise.all([crearOperador(m, '-A'), crearOperador(m, '-B')]);
    await Promise.all([certificar(opA.id, typeId), certificar(opB.id, typeId)]);

    const resultados = await Promise.allSettled([
      createAssignment({ shiftId: turno.id, equipmentId, operatorId: opA.id, userId }),
      createAssignment({ shiftId: turno.id, equipmentId, operatorId: opB.id, userId }),
    ]);

    const ok = resultados.filter((r) => r.status === 'fulfilled');
    const err = resultados.filter((r) => r.status === 'rejected');

    expect(ok).toHaveLength(1);
    expect(err).toHaveLength(1);
    expect(rechazaPorCupoTomado((err[0] as PromiseRejectedResult).reason)).toBe(true);

    const vigentes = await prisma.assignment.count({
      where: { shiftId: turno.id, equipmentId, status: { not: 'CANCELLED' } },
    });
    expect(vigentes).toBe(1);
  });

  it('resiste 20 intentos simultáneos sobre el mismo cupo', async () => {
    const turno = await crearTurno(11);
    const operadores = await Promise.all(
      Array.from({ length: 20 }, (_, i) => crearOperador(m, `-${i}`)),
    );
    await Promise.all(operadores.map((o) => certificar(o.id, typeId)));

    const resultados = await Promise.allSettled(
      operadores.map((o) =>
        createAssignment({ shiftId: turno.id, equipmentId, operatorId: o.id, userId }),
      ),
    );

    const ok = resultados.filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(1);

    const vigentes = await prisma.assignment.count({
      where: { shiftId: turno.id, equipmentId, status: { not: 'CANCELLED' } },
    });
    expect(vigentes).toBe(1);
  }, 30_000);

  it('el mismo operador tampoco entra dos veces en el turno', async () => {
    const turno = await crearTurno(12);
    const operador = await crearOperador(m, '-DUP');
    await certificar(operador.id, typeId);

    const otroEquipo = await crearEquipo(`${m}X`, typeId, {
      currentHours: 0,
      nextMaintenanceHours: 5000,
    });

    const resultados = await Promise.allSettled([
      createAssignment({ shiftId: turno.id, equipmentId, operatorId: operador.id, userId }),
      createAssignment({
        shiftId: turno.id,
        equipmentId: otroEquipo.id,
        operatorId: operador.id,
        userId,
      }),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const vigentes = await prisma.assignment.count({
      where: { shiftId: turno.id, operatorId: operador.id, status: { not: 'CANCELLED' } },
    });
    expect(vigentes).toBe(1);
  });
});
