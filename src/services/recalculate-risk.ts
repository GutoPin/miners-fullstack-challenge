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
import { formatIsoDate, toIsoDate } from './dates';

/**
 * Prefijo del `riskReason` escrito por un bloqueo de equipo. Sirve para reconocer después
 * cuáles asignaciones puede recuperar el mantenimiento y cuáles quedaron en riesgo por
 * otro motivo (certificación vencida, excepción forzada), que ese mantenimiento no arregla.
 */
export const RIESGO_POR_BLOQUEO = 'Equipo bloqueado por mantenimiento';

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
