/**
 * Risk that appears on already scheduled assignments.
 *
 * When equipment is blocked its future assignments are not cancelled: they turn `AT_RISK`
 * with a critical alert and a person decides. These run inside the transaction that caused
 * the state change, never in a separate job — a job may repair, not decide.
 */
import type { Prisma } from '../db/generated/client';
import { validateAssignment } from '../domain/rules/assignment-rules';
import { formatIsoDate, toIsoDate, toOperationalDate } from './dates';

/** riskReason prefix: marks which assignments a maintenance can later recover */
export const RIESGO_POR_BLOQUEO = 'Equipo bloqueado por mantenimiento';

/** same mechanism for the other cause, a certification that stops covering */
export const RIESGO_POR_CERTIFICACION = 'Certificación sin cobertura';

/** flags the equipment's assignments in planned shifts after `after`, one alert each */
export async function flagFutureAssignmentsAtRisk(
  tx: Prisma.TransactionClient,
  equipmentId: string,
  after: Date,
): Promise<number> {
  const afectadas = await tx.assignment.findMany({
    where: {
      equipmentId,
      status: 'ACTIVE',
      shift: { status: 'PLANNED', date: { gt: after } },
    },
    include: { shift: true, operator: true, equipment: true },
  });

  if (afectadas.length === 0) return 0;

  const riskReason = `${RIESGO_POR_BLOQUEO} el ${formatIsoDate(toIsoDate(after))}`;

  await tx.assignment.updateMany({
    where: { id: { in: afectadas.map((a) => a.id) } },
    data: { status: 'AT_RISK', riskReason },
  });

  await tx.alert.createMany({
    data: afectadas.map((a) => ({
      type: 'ASSIGNMENT_AT_RISK' as const,
      severity: 'CRITICAL' as const,
      equipmentId,
      assignmentId: a.id,
      message: `${a.equipment.code} quedó bloqueado por mantenimiento: la asignación de ${a.operator.fullName} en el turno del ${formatIsoDate(toIsoDate(a.shift.date))} (${a.shift.journey === 'DAY' ? 'DÍA' : 'NOCHE'}) está en riesgo. Reasigne el equipo o cancele la asignación.`,
    })),
  });

  return afectadas.length;
}

/**
 * Returns to `ACTIVE` the assignments this equipment put at risk, and resolves their alerts.
 * Two cases stay out on purpose: forced ones, which must remain marked, and those at risk
 * for a different reason, which a maintenance does not fix.
 */
export async function clearEquipmentRisk(
  tx: Prisma.TransactionClient,
  equipmentId: string,
): Promise<number> {
  const recuperables = await tx.assignment.findMany({
    where: {
      equipmentId,
      status: 'AT_RISK',
      riskReason: { startsWith: RIESGO_POR_BLOQUEO },
      override: { is: null },
      shift: { status: 'PLANNED' },
    },
    select: { id: true },
  });

  const ids = recuperables.map((a) => a.id);
  const resolvedAt = new Date();

  if (ids.length > 0) {
    await tx.assignment.updateMany({
      where: { id: { in: ids } },
      data: { status: 'ACTIVE', riskReason: null },
    });

    await tx.alert.updateMany({
      where: { assignmentId: { in: ids }, type: 'ASSIGNMENT_AT_RISK', resolvedAt: null },
      data: { resolvedAt },
    });
  }

  // no longer about to cross its threshold, so the projection alert stops applying
  await tx.alert.updateMany({
    where: { equipmentId, type: 'MAINTENANCE_DUE_SOON', resolvedAt: null },
    data: { resolvedAt },
  });

  return ids.length;
}

/**
 * Recomputes risk on an operator's future shifts when their certifications change, so the
 * alert appears the day the problem is created and not the day of the shift. Works both
 * ways: flags what lost coverage and recovers what a renewal covered again.
 */
export async function recalculateOperatorRisk(
  tx: Prisma.TransactionClient,
  operatorId: string,
  today: Date = new Date(),
): Promise<{ atRisk: number; recovered: number }> {
  const operator = await tx.operator.findUnique({
    where: { id: operatorId },
    include: { certifications: true },
  });

  if (!operator) return { atRisk: 0, recovered: 0 };

  const desde = new Date(`${toOperationalDate(today)}T00:00:00.000Z`);

  const futuras = await tx.assignment.findMany({
    where: {
      operatorId,
      status: { in: ['ACTIVE', 'AT_RISK'] },
      shift: { status: 'PLANNED', date: { gte: desde } },
    },
    include: { shift: true, equipment: { include: { type: true } }, override: true },
  });

  const certifications = operator.certifications.map((c) => ({
    equipmentTypeId: c.equipmentTypeId,
    issuedAt: toIsoDate(c.issuedAt),
    expiresAt: toIsoDate(c.expiresAt),
  }));

  let atRisk = 0;
  const recuperadas: string[] = [];

  for (const a of futuras) {
    // same engine that validates creation; no activeAssignments because only certification
    // rules matter here and uniqueness is already guaranteed by the database
    const violations = validateAssignment({
      shift: {
        id: a.shift.id,
        date: toIsoDate(a.shift.date),
        endDate: toOperationalDate(a.shift.endsAt),
        journey: a.shift.journey,
        status: a.shift.status,
        plannedHours: Number(a.shift.plannedHours),
      },
      equipment: {
        id: a.equipment.id,
        code: a.equipment.code,
        typeId: a.equipment.typeId,
        typeName: a.equipment.type.name,
        status: a.equipment.status,
        currentHours: Number(a.equipment.currentHours),
        nextMaintenanceHours: Number(a.equipment.nextMaintenanceHours),
      },
      operator: { id: operator.id, fullName: operator.fullName, active: operator.active },
      certifications,
      activeAssignments: [],
    });

    // expiring mid-shift is a warning, not a risk: allowed and reported
    const sinCobertura = violations.some(
      (v) => v.code === 'CERTIFICATION_EXPIRED' || v.code === 'OPERATOR_NOT_CERTIFIED',
    );

    const fecha = formatIsoDate(toIsoDate(a.shift.date));

    if (sinCobertura && a.status === 'ACTIVE') {
      await tx.assignment.update({
        where: { id: a.id },
        data: {
          status: 'AT_RISK',
          riskReason: `${RIESGO_POR_CERTIFICACION}: ${operator.fullName} no tiene certificación vigente de ${a.equipment.type.name} para el turno del ${fecha}`,
        },
      });

      await tx.alert.create({
        data: {
          type: 'CERT_EXPIRING_BEFORE_SHIFT',
          severity: 'CRITICAL',
          equipmentId: a.equipmentId,
          assignmentId: a.id,
          message: `${operator.fullName} no tendrá certificación vigente de ${a.equipment.type.name} en el turno del ${fecha}. Renueve la certificación o reasigne el operador.`,
        },
      });

      atRisk += 1;
      continue;
    }

    // a forced assignment was born AT_RISK and stays that way
    const recuperable =
      !sinCobertura &&
      a.status === 'AT_RISK' &&
      a.override === null &&
      a.riskReason?.startsWith(RIESGO_POR_CERTIFICACION);

    if (recuperable) recuperadas.push(a.id);
  }

  if (recuperadas.length > 0) {
    await tx.assignment.updateMany({
      where: { id: { in: recuperadas } },
      data: { status: 'ACTIVE', riskReason: null },
    });

    await tx.alert.updateMany({
      where: {
        assignmentId: { in: recuperadas },
        type: 'CERT_EXPIRING_BEFORE_SHIFT',
        resolvedAt: null,
      },
      data: { resolvedAt: new Date() },
    });
  }

  return { atRisk, recovered: recuperadas.length };
}
