/**
 * Cancel an assignment.
 *
 * Frees the slot by setting `activeSlot` to `NULL`: the unique index stops counting it
 * while the row is kept for history, which is exactly what that column is for.
 */
import { prisma } from '../db/prisma';
import { ServiceError } from './errors';

export interface CancelAssignmentInput {
  assignmentId: string;
  reason?: string;
}

export async function cancelAssignment(input: CancelAssignmentInput) {
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.assignment.findUnique({
      where: { id: input.assignmentId },
      include: { shift: true, equipment: true, operator: true },
    });

    if (!assignment) {
      throw new ServiceError({
        code: 'ASSIGNMENT_NOT_FOUND',
        message: `No existe la asignación solicitada (${input.assignmentId}).`,
        status: 404,
      });
    }

    // the past is not edited: a closed shift already moved the hourmeter
    if (assignment.shift.status !== 'PLANNED') {
      throw new ServiceError({
        code: 'SHIFT_NOT_PLANNED',
        message: `No se puede cancelar la asignación de ${assignment.operator.fullName}: su turno ya está ${assignment.shift.status === 'CLOSED' ? 'cerrado' : 'cancelado'}.`,
        status: 409,
      });
    }

    if (assignment.status === 'CANCELLED') {
      throw new ServiceError({
        code: 'ASSIGNMENT_ALREADY_CANCELLED',
        message: `La asignación de ${assignment.operator.fullName} en ${assignment.equipment.code} ya estaba cancelada.`,
        status: 409,
      });
    }

    const cancelada = await tx.assignment.update({
      where: { id: assignment.id },
      data: {
        status: 'CANCELLED',
        activeSlot: null,
        riskReason: input.reason?.trim() || assignment.riskReason,
      },
    });

    // alerts on a cancelled assignment no longer mean anything
    await tx.alert.updateMany({
      where: { assignmentId: assignment.id, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });

    return cancelada;
  });
}
