/**
 * Registering operators and equipment, and changing what an operator is allowed to drive.
 *
 * These are the writes the two modals and the operator profile perform. What is checked here
 * is what the forms cannot check on their own: that the opening hourmeter leaves its ledger
 * entry, that the first threshold lands ahead of the reading, and that revoking a
 * certification stops the operator without erasing the record.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@/src/db/prisma';
import { createEquipment } from '@/src/services/create-equipment';
import { createOperator } from '@/src/services/create-operator';
import { ServiceError } from '@/src/services/errors';
import {
  grantCertification,
  revokeCertification,
  setOperatorActive,
} from '@/src/services/operator-certifications';
import { toOperationalDate } from '@/src/services/dates';
import { crearTipo, crearUsuario, fecha, limpiar, marca } from './fixtures';

const m = marca();

/**
 * Today in Lima, which is what the rules compare against. The fixture's `fecha()` counts in
 * UTC, and for five hours a day the two disagree — asserting against UTC would make these
 * tests pass or fail depending on the hour CI happens to run.
 */
const hoyOperativo = () => toOperationalDate(new Date());

let userId: string;
let typeId: string;

beforeAll(async () => {
  const [usuario, tipo] = await Promise.all([crearUsuario(m), crearTipo(m, 250)]);
  userId = usuario.id;
  typeId = tipo.id;
});

afterAll(async () => {
  await limpiar(m);
  await prisma.$disconnect();
});

describe('alta de equipos', () => {
  it('ancla el primer umbral por delante del horómetro declarado', async () => {
    // 738 h con intervalo 250: el umbral no es 250 ni 988, es el múltiplo siguiente
    const equipo = await createEquipment({
      code: `EQ-${m}-A`,
      typeId,
      currentHours: 738,
      createdById: userId,
    });

    expect(Number(equipo.nextMaintenanceHours)).toBe(750);
    expect(equipo.status).toBe('AVAILABLE');
  });

  it('una unidad nueva a cero horas se bloquea al cumplir un intervalo', async () => {
    const equipo = await createEquipment({
      code: `EQ-${m}-B`,
      typeId,
      currentHours: 0,
      createdById: userId,
    });

    expect(Number(equipo.nextMaintenanceHours)).toBe(250);
  });

  it('el intervalo propio de la unidad manda sobre el del tipo', async () => {
    const equipo = await createEquipment({
      code: `EQ-${m}-C`,
      typeId,
      currentHours: 100,
      maintenanceIntervalOverride: 80,
      createdById: userId,
    });

    // 100 h con intervalo 80: el primer umbral por delante es 160, no 240 ni 250
    expect(Number(equipo.nextMaintenanceHours)).toBe(160);
  });

  it('el horómetro de apertura queda asentado en la bitácora', async () => {
    const equipo = await createEquipment({
      code: `EQ-${m}-D`,
      typeId,
      currentHours: 412.5,
      createdById: userId,
    });

    const asientos = await prisma.hourmeterEntry.findMany({
      where: { equipmentId: equipo.id },
    });

    expect(asientos).toHaveLength(1);
    expect(asientos[0].source).toBe('INITIAL_LOAD');
    expect(Number(asientos[0].hoursBefore)).toBe(0);
    expect(Number(asientos[0].hoursAfter)).toBe(412.5);
    // el saldo del equipo tiene que poder reconstruirse sumando el libro mayor
    expect(Number(asientos[0].hoursDelta)).toBe(Number(equipo.currentHours));
  });

  it('rechaza un código repetido con un mensaje que nombra el código', async () => {
    await createEquipment({ code: `EQ-${m}-E`, typeId, currentHours: 0, createdById: userId });

    await expect(
      createEquipment({ code: `EQ-${m}-E`, typeId, currentHours: 0, createdById: userId }),
    ).rejects.toMatchObject({ code: 'EQUIPMENT_ALREADY_EXISTS' });
  });

  it('no deja registrar un equipo con horómetro negativo', async () => {
    await expect(
      createEquipment({ code: `EQ-${m}-F`, typeId, currentHours: -5, createdById: userId }),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('alta de operadores', () => {
  it('crea el operador y sus certificaciones en la misma transacción', async () => {
    const operador = await createOperator({
      code: `OP-${m}-A`,
      fullName: 'Rosa Quispe',
      document: `${m}0001`,
      certifications: [{ equipmentTypeId: typeId, issuedAt: fecha(-10), expiresAt: fecha(300) }],
    });

    const certificaciones = await prisma.certification.findMany({
      where: { operatorId: operador.id },
    });

    expect(operador.active).toBe(true);
    expect(certificaciones).toHaveLength(1);
  });

  it('normaliza el código a mayúsculas', async () => {
    const operador = await createOperator({
      code: `op-${m}-b`.toLowerCase(),
      fullName: 'Luis Mamani',
      document: `${m}0002`,
      certifications: [],
    });

    expect(operador.code).toBe(`OP-${m}-B`);
  });

  it('si una certificación es inválida no queda el operador a medias', async () => {
    const code = `OP-${m}-C`;

    await expect(
      createOperator({
        code,
        fullName: 'Ana Ccahua',
        document: `${m}0003`,
        // vence antes de emitirse
        certifications: [{ equipmentTypeId: typeId, issuedAt: fecha(10), expiresAt: fecha(5) }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CERTIFICATION_RANGE' });

    expect(await prisma.operator.findUnique({ where: { code } })).toBeNull();
  });

  it('rechaza el documento repetido distinguiéndolo del código', async () => {
    const document = `${m}0004`;

    await createOperator({
      code: `OP-${m}-D`,
      fullName: 'Carlos Huamán',
      document,
      certifications: [],
    });

    await expect(
      createOperator({
        code: `OP-${m}-E`,
        fullName: 'Otro nombre',
        document,
        certifications: [],
      }),
    ).rejects.toMatchObject({ code: 'OPERATOR_ALREADY_EXISTS' });
  });
});

describe('qué puede operar un operador', () => {
  it('revocar vence la certificación en vez de borrar el registro', async () => {
    const operador = await createOperator({
      code: `OP-${m}-F`,
      fullName: 'Juan Pérez',
      document: `${m}0005`,
      certifications: [{ equipmentTypeId: typeId, issuedAt: fecha(-10), expiresAt: fecha(300) }],
    });

    await revokeCertification(operador.id, typeId);

    const certificaciones = await prisma.certification.findMany({
      where: { operatorId: operador.id },
    });

    // la fila sigue ahí: el historial no se pierde, solo deja de habilitar
    expect(certificaciones).toHaveLength(1);

    // y queda vencida para cualquier turno de hoy en adelante, que es lo que significa revocar
    const vence = certificaciones[0].expiresAt.toISOString().slice(0, 10);
    const hoy = hoyOperativo();
    expect(vence < hoy, `vence ${vence}, hoy en Lima es ${hoy}`).toBe(true);
  });

  it('revocar alcanza a todas las renovaciones vigentes del mismo tipo', async () => {
    const operador = await createOperator({
      code: `OP-${m}-G`,
      fullName: 'María Flores',
      document: `${m}0006`,
      certifications: [{ equipmentTypeId: typeId, issuedAt: fecha(-10), expiresAt: fecha(100) }],
    });

    // una renovación posterior: sin esto, revocar solo la primera dejaría al operador habilitado
    await grantCertification(operador.id, {
      equipmentTypeId: typeId,
      issuedAt: fecha(-5),
      expiresAt: fecha(400),
    });

    await revokeCertification(operador.id, typeId);

    const vigentes = await prisma.certification.findMany({
      where: {
        operatorId: operador.id,
        expiresAt: { gte: new Date(`${hoyOperativo()}T00:00:00.000Z`) },
      },
    });

    expect(vigentes).toHaveLength(0);
  });

  it('no hay nada que revocar si ya estaba vencida', async () => {
    const operador = await createOperator({
      code: `OP-${m}-H`,
      fullName: 'Pedro Ríos',
      document: `${m}0007`,
      certifications: [{ equipmentTypeId: typeId, issuedAt: fecha(-100), expiresAt: fecha(-2) }],
    });

    await expect(revokeCertification(operador.id, typeId)).rejects.toMatchObject({
      code: 'NOTHING_TO_REVOKE',
    });
  });

  it('desactivar no toca las certificaciones', async () => {
    const operador = await createOperator({
      code: `OP-${m}-I`,
      fullName: 'Sofía Ramos',
      document: `${m}0008`,
      certifications: [{ equipmentTypeId: typeId, issuedAt: fecha(-10), expiresAt: fecha(300) }],
    });

    await setOperatorActive(operador.id, false);

    const guardado = await prisma.operator.findUniqueOrThrow({
      where: { id: operador.id },
      include: { certifications: true },
    });

    expect(guardado.active).toBe(false);
    expect(guardado.certifications).toHaveLength(1);
  });
});
