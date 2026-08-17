/**
 * Create an assignment.
 *
 * Runs inside a `Serializable` transaction with the equipment row locked `FOR UPDATE`, so
 * nothing changes between validating and writing. The final guarantee is still the unique
 * index in the database.
 */
import { Prisma } from '../db/generated/client';
import { canBeOverridden, validateAssignment } from '../domain/rules/assignment-rules';
import { buildAssignmentContext } from './assignment-context';
import { ServiceError, uniqueViolationToServiceError } from './errors';
import { serializable } from './transaction';

export interface CreateAssignmentInput {
  shiftId: string;
  operatorId: string;
  equipmentId: string;
  /** author of the assignment; must be a SUPERVISOR when `override` is present */
  userId: string;
  /** defaults to the shift's planned hours */
  plannedHours?: number;
  override?: { reason: string };
}

const MOTIVO_MINIMO = 15;

export async function createAssignment(input: CreateAssignmentInput) {
  return serializable(async (tx) => {
    // 1. pessimistic lock: a second supervisor waits here and reads the updated state
    const bloqueado = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "equipment" WHERE "id" = ${input.equipmentId} FOR UPDATE`;

    if (bloqueado.length === 0) {
      throw new ServiceError({
        code: 'EQUIPMENT_NOT_FOUND',
        message: `No existe el equipo solicitado (${input.equipmentId}).`,
        status: 404,
      });
    }

    // 2. snapshot, read under the same lock and built by the same function the preview uses
    const { context, equipmentCode, operatorName, shiftPlannedHours } =
      await buildAssignmentContext(tx, input);

    // 3. pure domain: returns every violation (rule 11)
    const violations = validateAssignment(context);
    const bloqueantes = violations.filter((v) => v.severity !== 'WARNING');
    const warnings = violations.filter((v) => v.severity === 'WARNING');

    let forzada = false;

    if (bloqueantes.length > 0) {
      const autorizable = canBeOverridden(violations);

      if (!input.override || !autorizable) {
        throw new ServiceError({
          code: 'ASSIGNMENT_REJECTED',
          message: `No se puede crear la asignación: ${bloqueantes.length} ${bloqueantes.length === 1 ? 'regla incumplida' : 'reglas incumplidas'}.`,
          status: 409,
          violations,
          canBeOverridden: autorizable,
        });
      }

      forzada = true;
    }

    const supervisor = forzada ? await autorizar(tx, input) : null;

    // 4. insert; the unique index is the last defence and lands in the catch below
    try {
      const assignment = await tx.assignment.create({
        data: {
          shiftId: input.shiftId,
          operatorId: input.operatorId,
          equipmentId: input.equipmentId,
          plannedHours: input.plannedHours ?? shiftPlannedHours,
          createdById: input.userId,
          // forced is not normal, and looks that way across the whole app
          status: forzada ? 'AT_RISK' : 'ACTIVE',
          riskReason: supervisor
            ? `Asignación forzada por ${supervisor.name} — ${input.override?.reason}`
            : null,
        },
      });

      if (supervisor && input.override) {
        await tx.assignmentOverride.create({
          data: {
            assignmentId: assignment.id,
            authorizedById: supervisor.id,
            reason: input.override.reason,
            // plain json snapshot: the record survives future rule changes
            violatedRules: bloqueantes as unknown as Prisma.InputJsonValue,
          },
        });

        await tx.alert.createMany({
          data: [
            {
              type: 'OVERRIDE_USED',
              severity: 'CRITICAL',
              equipmentId: input.equipmentId,
              assignmentId: assignment.id,
              message: `${supervisor.name} autorizó una excepción para asignar ${equipmentCode} a ${operatorName}: ${input.override.reason}`,
            },
          ],
        });
      }

      return { assignment, warnings, forced: forzada };
    } catch (error) {
      const conflicto = uniqueViolationToServiceError(error, { equipmentCode, operatorName });

      throw conflicto ?? error;
    }
  });
}

/** only a SUPERVISOR forces an assignment, and with a reason worth auditing */
async function autorizar(tx: Prisma.TransactionClient, input: CreateAssignmentInput) {
  const reason = input.override?.reason.trim() ?? '';

  if (reason.length < MOTIVO_MINIMO) {
    throw new ServiceError({
      code: 'OVERRIDE_REASON_TOO_SHORT',
      message: `El motivo de la excepción debe tener al menos ${MOTIVO_MINIMO} caracteres y explicar por qué se fuerza la asignación. Escribió ${reason.length}.`,
      status: 400,
    });
  }

  const user = await tx.user.findUnique({ where: { id: input.userId } });

  if (!user) {
    throw new ServiceError({
      code: 'USER_NOT_FOUND',
      message: `No existe el usuario que intenta autorizar la excepción (${input.userId}).`,
      status: 404,
    });
  }

  if (user.role !== 'SUPERVISOR') {
    throw new ServiceError({
      code: 'OVERRIDE_NOT_ALLOWED',
      message: `${user.name} tiene rol ${user.role} y no puede autorizar excepciones. Solicite la autorización a un supervisor.`,
      status: 403,
    });
  }

  return user;
}

export type CreateAssignmentResult = Awaited<ReturnType<typeof createAssignment>>;
