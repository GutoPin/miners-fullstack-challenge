/**
 * Cancelar una asignación.
 *
 * Es una de las tres salidas que `DECISIONES.md` §2.1 exige para una asignación en riesgo
 * (reasignar, cancelar o forzar). Cancelar **libera el cupo** poniendo `activeSlot` en
 * `NULL`: el índice único deja de contarla y el histórico se conserva, que es exactamente
 * para lo que existe esa columna.
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

    // El pasado no se edita: un turno cerrado ya sumó horas al horómetro y cancelar una
    // asignación después sería falsear historia.
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

    // Las alertas de una asignación cancelada dejan de tener sentido.
    await tx.alert.updateMany({
      where: { assignmentId: assignment.id, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });

    return cancelada;
  });
}
