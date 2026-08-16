/**
 * Crear una asignación (`docs/ARQUITECTURA.md` §4).
 *
 * Todo ocurre dentro de una transacción `Serializable` y sobre la fila del equipo
 * bloqueada con `FOR UPDATE`: entre validar y escribir, nadie cambia el estado del equipo.
 * La garantía final igual la da el índice único de la base (§5).
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
  /** Usuario que crea la asignación; si viene `override`, debe ser SUPERVISOR. */
  userId: string;
  /** Por defecto, las horas planificadas del turno. */
  plannedHours?: number;
  override?: { reason: string };
}

const MOTIVO_MINIMO = 15;

export async function createAssignment(input: CreateAssignmentInput) {
  return serializable(async (tx) => {
    // 1. Bloqueo pesimista de la fila del equipo. Serializa las validaciones de dos
    //    supervisores sobre el mismo equipo: el segundo espera aquí y lee el estado ya
    //    actualizado, en vez de concluir "está disponible" con datos viejos.
    const bloqueado = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "equipment" WHERE "id" = ${input.equipmentId} FOR UPDATE`;

    if (bloqueado.length === 0) {
      throw new ServiceError({
        code: 'EQUIPMENT_NOT_FOUND',
        message: `No existe el equipo solicitado (${input.equipmentId}).`,
        status: 404,
      });
    }

    // 2. Snapshot: todo lo que las reglas necesitan, leído bajo el mismo bloqueo y con la
    //    misma función que alimenta la validación previa de la interfaz.
    const { context, equipmentCode, operatorName, shiftPlannedHours } =
      await buildAssignmentContext(tx, input);

    // 3. Dominio puro: devuelve TODAS las violaciones (regla 11).
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

    // 4. Insertar. El índice único es la última línea de defensa: si dos requests
    //    llegaron juntos, uno entra y el otro cae en el catch de abajo.
    try {
      const assignment = await tx.assignment.create({
        data: {
          shiftId: input.shiftId,
          operatorId: input.operatorId,
          equipmentId: input.equipmentId,
          plannedHours: input.plannedHours ?? shiftPlannedHours,
          createdById: input.userId,
          // Forzada no es normal, y se ve así en toda la aplicación (DECISIONES §2.2).
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
            // El snapshot de las violaciones salvadas es JSON plano: aunque mañana
            // cambien las reglas, el registro conserva qué se saltó ese día.
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

/** Solo un SUPERVISOR fuerza una asignación, y con un motivo que sirva para auditar. */
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
