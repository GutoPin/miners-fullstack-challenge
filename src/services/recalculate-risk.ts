/**
 * Riesgo sobrevenido sobre asignaciones ya programadas (`docs/REGLAS-NEGOCIO.md` §6 y
 * `DECISIONES.md` §2.1).
 *
 * Cuando un equipo se bloquea, sus asignaciones futuras **no se cancelan**: pasan a
 * `AT_RISK` con alerta crítica y alguien decide. Ambas funciones se ejecutan dentro de la
 * transacción que produjo el cambio de estado, nunca en un job aparte: un job puede
 * reparar, no decidir.
 */
import type { Prisma } from '../db/generated/client';
import { validateAssignment } from '../domain/rules/assignment-rules';
import { formatIsoDate, toIsoDate, toOperationalDate } from './dates';

/**
 * Prefijo del `riskReason` escrito por un bloqueo de equipo. Sirve para reconocer después
 * cuáles asignaciones puede recuperar el mantenimiento y cuáles quedaron en riesgo por
 * otro motivo (certificación vencida, excepción forzada), que ese mantenimiento no arregla.
 */
export const RIESGO_POR_BLOQUEO = 'Equipo bloqueado por mantenimiento';

/** Mismo mecanismo para el otro riesgo sobrevenido: la certificación que deja de cubrir. */
export const RIESGO_POR_CERTIFICACION = 'Certificación sin cobertura';

/**
 * Marca `AT_RISK` las asignaciones del equipo en turnos planificados posteriores a `after`
 * y levanta una alerta crítica por cada una.
 */
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
 * Devuelve a `ACTIVE` las asignaciones que este equipo dejó en riesgo al bloquearse y
 * resuelve sus alertas.
 *
 * Deja fuera dos casos a propósito: las que tienen `AssignmentOverride` (nacieron forzadas
 * y deben seguir marcadas como tales) y las que quedaron en riesgo por otro motivo, que un
 * mantenimiento no resuelve.
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

  // El equipo ya no está por cruzar su umbral: la alerta de proyección deja de aplicar.
  await tx.alert.updateMany({
    where: { equipmentId, type: 'MAINTENANCE_DUE_SOON', resolvedAt: null },
    data: { resolvedAt },
  });

  return ids.length;
}

/**
 * Recalcula el riesgo de los turnos futuros de un operador cuando cambian sus
 * certificaciones (`DECISIONES.md` §2.5): la alerta tiene que aparecer el día que se genera
 * el problema, no el día del turno.
 *
 * Se llama al crear o renovar una certificación, y funciona en los dos sentidos: marca en
 * riesgo lo que quedó sin cobertura y recupera lo que una renovación volvió a cubrir.
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
    // Se reusa el mismo motor que valida la creación: si el riesgo y la validación
    // divergieran, una de las dos estaría mintiendo. Va sin `activeAssignments` porque aquí
    // solo interesan las reglas de certificación; la unicidad ya la garantiza la base.
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

    // Vencer *a mitad* del turno es WARNING, no riesgo: se permite y se avisa (§2.5).
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

    // Una asignación forzada nació AT_RISK y debe seguir marcada como tal.
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
