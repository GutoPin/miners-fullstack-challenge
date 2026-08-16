/**
 * Datos de ejemplo (`docs/TESTS.md` §4).
 *
 * El enunciado exige como mínimo: un equipo a punto de alcanzar su mantenimiento, un
 * operador con certificación vencida y un turno que al cerrarse dispare un bloqueo. Están
 * los tres, con **fechas relativas a hoy** para que la demo siga siendo válida cuando la
 * abran tres días después.
 *
 * Es idempotente: borra lo operativo y hace `upsert` de los catálogos por código, así que
 * se puede correr las veces que haga falta y siempre deja el mismo escenario.
 */
// El seed corre fuera de Next, y la CLI de Prisma 7 no carga `.env` por su cuenta.
import 'dotenv/config';

import bcrypt from 'bcryptjs';

import { prisma } from '../src/db/prisma';
import { recalculateOperatorRisk } from '../src/services/recalculate-risk';

/** Fecha operativa (columna `date`, sin hora) a N días de hoy. */
function fecha(offsetDays: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

function iso(offsetDays: number): string {
  return fecha(offsetDays).toISOString().slice(0, 10);
}

/**
 * Instantes reales del turno en hora de Lima (UTC-5), que es lo que usa la regla de
 * certificación que vence a mitad de turno: DÍA 07:00–19:00, NOCHE 19:00–07:00 del día
 * siguiente.
 */
function horario(offsetDays: number, journey: 'DAY' | 'NIGHT') {
  return journey === 'DAY'
    ? { startsAt: new Date(`${iso(offsetDays)}T12:00:00.000Z`), endsAt: new Date(`${iso(offsetDays + 1)}T00:00:00.000Z`) }
    : { startsAt: new Date(`${iso(offsetDays + 1)}T00:00:00.000Z`), endsAt: new Date(`${iso(offsetDays + 1)}T12:00:00.000Z`) };
}

async function main() {
  // ── 1. Limpiar lo operativo (los catálogos se actualizan con upsert) ──
  await prisma.alert.deleteMany();
  await prisma.assignmentOverride.deleteMany();
  await prisma.hourmeterEntry.deleteMany();
  await prisma.maintenanceRecord.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.certification.deleteMany();

  // ── 2. Usuarios (las credenciales van al README) ──
  const usuarios = [
    { email: 'supervisor@mineops.pe', name: 'Sofía Ramos', role: 'SUPERVISOR' as const, password: 'supervisor123' },
    { email: 'planner@mineops.pe', name: 'Diego Salas', role: 'PLANNER' as const, password: 'planner123' },
    { email: 'viewer@mineops.pe', name: 'Ana Torres', role: 'VIEWER' as const, password: 'viewer123' },
  ];

  const [supervisor, planner] = await Promise.all(
    usuarios.map((u) =>
      prisma.user.upsert({
        where: { email: u.email },
        update: { name: u.name, role: u.role, passwordHash: bcrypt.hashSync(u.password, 10) },
        create: { email: u.email, name: u.name, role: u.role, passwordHash: bcrypt.hashSync(u.password, 10) },
      }),
    ),
  );

  // ── 3. Tipos de equipo ──
  const tipos = await Promise.all(
    [
      { code: 'CAM', name: 'Camión de acarreo', maintenanceIntervalHours: 250 },
      { code: 'EXC', name: 'Excavadora', maintenanceIntervalHours: 500 },
      { code: 'PER', name: 'Perforadora', maintenanceIntervalHours: 300 },
    ].map((t) => prisma.equipmentType.upsert({ where: { code: t.code }, update: t, create: t })),
  );

  const tipo = Object.fromEntries(tipos.map((t) => [t.code, t]));

  // ── 4. Equipos ──
  const equipos = await Promise.all(
    [
      { code: 'CAM-001', typeId: tipo.CAM.id, currentHours: 180, nextMaintenanceHours: 250, status: 'AVAILABLE' as const },
      // A 12 h del umbral: cerrar el turno de hoy lo bloquea (caso borde exigido).
      { code: 'CAM-002', typeId: tipo.CAM.id, currentHours: 738, nextMaintenanceHours: 750, status: 'AVAILABLE' as const },
      { code: 'CAM-003', typeId: tipo.CAM.id, currentHours: 1253, nextMaintenanceHours: 1250, status: 'BLOCKED' as const },
      { code: 'EXC-001', typeId: tipo.EXC.id, currentHours: 1180.5, nextMaintenanceHours: 1250, status: 'AVAILABLE' as const },
      { code: 'EXC-002', typeId: tipo.EXC.id, currentHours: 420, nextMaintenanceHours: 500, status: 'IN_MAINTENANCE' as const },
      { code: 'PER-001', typeId: tipo.PER.id, currentHours: 402, nextMaintenanceHours: 500, status: 'AVAILABLE' as const },
    ].map((e) =>
      prisma.equipment.upsert({
        where: { code: e.code },
        // El update repone el escenario: re-sembrar deja el mismo estado siempre.
        update: { ...e, version: 0 },
        create: e,
      }),
    ),
  );

  const equipo = Object.fromEntries(equipos.map((e) => [e.code, e]));

  // ── 5. Operadores y certificaciones ──
  const operadores = await Promise.all(
    [
      { code: 'OP-001', fullName: 'Juan Pérez', document: '40111222' },
      { code: 'OP-002', fullName: 'María Flores', document: '40222333' },
      { code: 'OP-003', fullName: 'Carlos Huamán', document: '40333444' },
      { code: 'OP-004', fullName: 'Rosa Quispe', document: '40444555' },
      { code: 'OP-005', fullName: 'Luis Mamani', document: '40555666' },
      { code: 'OP-006', fullName: 'Ana Ccahua', document: '40666777' },
    ].map((o) => prisma.operator.upsert({ where: { code: o.code }, update: o, create: o })),
  );

  const operador = Object.fromEntries(operadores.map((o) => [o.code, o]));

  await prisma.certification.createMany({
    data: [
      { operatorId: operador['OP-001'].id, equipmentTypeId: tipo.CAM.id, issuedAt: fecha(-500), expiresAt: fecha(180) },
      { operatorId: operador['OP-001'].id, equipmentTypeId: tipo.EXC.id, issuedAt: fecha(-400), expiresAt: fecha(200) },
      { operatorId: operador['OP-002'].id, equipmentTypeId: tipo.CAM.id, issuedAt: fecha(-300), expiresAt: fecha(90) },
      { operatorId: operador['OP-002'].id, equipmentTypeId: tipo.EXC.id, issuedAt: fecha(-300), expiresAt: fecha(120) },
      { operatorId: operador['OP-003'].id, equipmentTypeId: tipo.PER.id, issuedAt: fecha(-200), expiresAt: fecha(300) },
      // Vencida ayer: rechazo por regla 9.
      { operatorId: operador['OP-004'].id, equipmentTypeId: tipo.EXC.id, issuedAt: fecha(-400), expiresAt: fecha(-1) },
      // Vence en 3 días y tiene turno en 5: queda EN RIESGO (decisión abierta 5).
      { operatorId: operador['OP-005'].id, equipmentTypeId: tipo.CAM.id, issuedAt: fecha(-360), expiresAt: fecha(3) },
      // OP-006 Ana Ccahua no tiene ninguna: OPERATOR_NOT_CERTIFIED.
    ],
  });

  // ── 6. Turno de ayer, ya cerrado: deja historial y asientos en el ledger ──
  const ayer = await prisma.shift.create({
    data: {
      date: fecha(-1),
      journey: 'DAY',
      plannedHours: 12,
      ...horario(-1, 'DAY'),
      status: 'CLOSED',
      closedAt: new Date(),
      closedById: planner.id,
      assignments: {
        create: [
          { equipmentId: equipo['CAM-001'].id, operatorId: operador['OP-001'].id, plannedHours: 12, actualHours: 12, status: 'COMPLETED', createdById: planner.id },
          {
            equipmentId: equipo['PER-001'].id,
            operatorId: operador['OP-003'].id,
            plannedHours: 12,
            actualHours: 9,
            varianceNote: 'Frente detenido 3 h por voladura programada.',
            status: 'COMPLETED',
            createdById: planner.id,
          },
        ],
      },
    },
    include: { assignments: true },
  });

  // El ledger tiene que cuadrar con el saldo: carga inicial + lo que sumó el turno cerrado.
  const cerradoPorEquipo = new Map(ayer.assignments.map((a) => [a.equipmentId, Number(a.actualHours)]));

  for (const e of equipos) {
    const delCierre = cerradoPorEquipo.get(e.id) ?? 0;
    const inicial = Number(e.currentHours) - delCierre;

    await prisma.hourmeterEntry.create({
      data: {
        equipmentId: e.id,
        source: 'INITIAL_LOAD',
        hoursBefore: 0,
        hoursDelta: inicial,
        hoursAfter: inicial,
        note: 'Carga inicial del horómetro al implantar el sistema',
      },
    });

    if (delCierre > 0) {
      const asignacion = ayer.assignments.find((a) => a.equipmentId === e.id);

      await prisma.hourmeterEntry.create({
        data: {
          equipmentId: e.id,
          source: 'SHIFT_CLOSE',
          referenceId: asignacion?.id,
          hoursBefore: inicial,
          hoursDelta: delCierre,
          hoursAfter: Number(e.currentHours),
          createdById: planner.id,
        },
      });
    }
  }

  // ── 7. Mantenimiento histórico con 30 h de atraso: muestra el umbral anclado ──
  // EXC-001 debía servirse a las 750 h y entró al taller a las 780. El siguiente umbral
  // quedó en 1.250 (750 + 500), no en 1.280: el atraso no corre la ventana.
  await prisma.maintenanceRecord.create({
    data: {
      equipmentId: equipo['EXC-001'].id,
      performedAt: fecha(-45),
      hoursAtService: 780,
      thresholdHours: 750,
      overdueHours: 30,
      nextThresholdHours: 1250,
      responsible: 'Taller central · Téc. Miguel Ayala',
      notes: 'Servicio de 750 h ejecutado con 30 h de atraso por falta de repuesto.',
      registeredById: planner.id,
    },
  });

  // ── 8. Turnos programados ──
  // Hoy DÍA: cerrarlo lleva CAM-002 de 738 a 750 h y dispara su bloqueo (regla 10 → 2).
  await prisma.shift.create({
    data: {
      date: fecha(0),
      journey: 'DAY',
      plannedHours: 12,
      ...horario(0, 'DAY'),
      assignments: {
        create: [
          { equipmentId: equipo['CAM-002'].id, operatorId: operador['OP-001'].id, plannedHours: 12, createdById: planner.id },
        ],
      },
    },
  });

  await prisma.shift.create({
    data: {
      date: fecha(0),
      journey: 'NIGHT',
      plannedHours: 12,
      ...horario(0, 'NIGHT'),
      assignments: {
        create: [
          { equipmentId: equipo['EXC-001'].id, operatorId: operador['OP-002'].id, plannedHours: 12, createdById: planner.id },
        ],
      },
    },
  });

  // EXC-001 acumula 12 h por turno: cruza su umbral de 1.250 h dentro de la semana, que es
  // lo que tiene que detectar la proyección sin mirar el estado actual (regla 12).
  for (let dia = 1; dia <= 6; dia += 1) {
    await prisma.shift.create({
      data: {
        date: fecha(dia),
        journey: 'DAY',
        plannedHours: 12,
        ...horario(dia, 'DAY'),
        assignments: {
          create: [
            { equipmentId: equipo['EXC-001'].id, operatorId: operador['OP-002'].id, plannedHours: 12, createdById: planner.id },
            // CAM-002 ya está comprometido pasado mañana: cuando el cierre de hoy lo
            // bloquee, esta asignación tiene que quedar EN RIESGO, no cancelarse sola.
            ...(dia === 2
              ? [{ equipmentId: equipo['CAM-002'].id, operatorId: operador['OP-001'].id, plannedHours: 12, createdById: planner.id }]
              : []),
            // A los 5 días, Luis Mamani ya no tendrá certificación vigente de camión.
            ...(dia === 5
              ? [{ equipmentId: equipo['CAM-001'].id, operatorId: operador['OP-005'].id, plannedHours: 12, createdById: planner.id }]
              : []),
          ],
        },
      },
    });
  }

  // ── 9. El riesgo lo calcula el mismo servicio que usa la aplicación, no el seed ──
  const riesgo = await recalculateOperatorRisk(prisma, operador['OP-005'].id);

  console.info(
    JSON.stringify({
      seed: 'ok',
      supervisor: supervisor.email,
      equipos: equipos.length,
      operadores: operadores.length,
      asignacionesEnRiesgo: riesgo.atRisk,
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
