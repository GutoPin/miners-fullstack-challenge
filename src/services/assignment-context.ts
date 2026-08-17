/**
 * Builds the snapshot the rule engine consumes, and evaluates it.
 *
 * Two callers share it: the real creation, inside the transaction and over locked rows, and
 * the UI preview, a plain read. Deliberately the same function — if preview and creation
 * ever diverged, the preview would be lying.
 */
import type { Prisma } from '../db/generated/client';
import { validateAssignment } from '../domain/rules/assignment-rules';
import type { Violation } from '../domain/rules/violation';
import type { AssignmentContext } from '../domain/types';
import { toIsoDate, toOperationalDate } from './dates';
import { ServiceError } from './errors';

export interface AssignmentQuery {
  shiftId: string;
  operatorId: string;
  equipmentId: string;
}

export async function buildAssignmentContext(
  db: Prisma.TransactionClient,
  input: AssignmentQuery,
): Promise<{
  context: AssignmentContext;
  equipmentCode: string;
  operatorName: string;
  shiftPlannedHours: number;
}> {
  const [equipment, shift, operator, vigentes] = await Promise.all([
    db.equipment.findUnique({ where: { id: input.equipmentId }, include: { type: true } }),
    db.shift.findUnique({ where: { id: input.shiftId } }),
    db.operator.findUnique({
      where: { id: input.operatorId },
      include: { certifications: true },
    }),
    db.assignment.findMany({
      where: { shiftId: input.shiftId, status: { in: ['ACTIVE', 'AT_RISK'] } },
      include: { operator: true, equipment: true },
    }),
  ]);

  if (!equipment) {
    throw new ServiceError({
      code: 'EQUIPMENT_NOT_FOUND',
      message: `No existe el equipo solicitado (${input.equipmentId}).`,
      status: 404,
    });
  }

  if (!shift) {
    throw new ServiceError({
      code: 'SHIFT_NOT_FOUND',
      message: `No existe el turno solicitado (${input.shiftId}).`,
      status: 404,
    });
  }

  if (!operator) {
    throw new ServiceError({
      code: 'OPERATOR_NOT_FOUND',
      message: `No existe el operador solicitado (${input.operatorId}).`,
      status: 404,
    });
  }

  return {
    equipmentCode: equipment.code,
    operatorName: operator.fullName,
    shiftPlannedHours: Number(shift.plannedHours),
    context: {
      shift: {
        id: shift.id,
        date: toIsoDate(shift.date),
        endDate: toOperationalDate(shift.endsAt),
        journey: shift.journey,
        status: shift.status,
        plannedHours: Number(shift.plannedHours),
      },
      equipment: {
        id: equipment.id,
        code: equipment.code,
        typeId: equipment.typeId,
        typeName: equipment.type.name,
        status: equipment.status,
        currentHours: Number(equipment.currentHours),
        nextMaintenanceHours: Number(equipment.nextMaintenanceHours),
      },
      operator: {
        id: operator.id,
        fullName: operator.fullName,
        active: operator.active,
      },
      certifications: operator.certifications.map((c) => ({
        equipmentTypeId: c.equipmentTypeId,
        issuedAt: toIsoDate(c.issuedAt),
        expiresAt: toIsoDate(c.expiresAt),
      })),
      activeAssignments: vigentes.map((a) => ({
        id: a.id,
        operatorId: a.operatorId,
        operatorName: a.operator.fullName,
        equipmentId: a.equipmentId,
        equipmentCode: a.equipment.code,
      })),
    },
  };
}

/** preview: says what would happen without writing; the real check runs again on submit */
export async function previewAssignment(
  db: Prisma.TransactionClient,
  input: AssignmentQuery,
): Promise<{ violations: Violation[] }> {
  const { context } = await buildAssignmentContext(db, input);

  return { violations: validateAssignment(context) };
}
