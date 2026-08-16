/**
 * Cerrar un turno (regla 10, `docs/REGLAS-NEGOCIO.md` §3).
 *
 * Una sola transacción hace todo: asiento en el ledger, saldo del horómetro, recálculo del
 * estado del equipo y riesgo de las asignaciones futuras. Si algo falla, no queda un
 * horómetro movido sin su asiento.
 */
import { Prisma } from '../db/generated/client';
import { formatIsoDate, toIsoDate } from './dates';
import { ServiceError } from './errors';
import { flagFutureAssignmentsAtRisk } from './recalculate-risk';
import { serializable } from './transaction';

export interface CloseShiftInput {
  shiftId: string;
  userId: string;
  /** Horas realmente trabajadas, por `assignmentId`. Sin dato, se asumen las planificadas. */
  actualHours?: Record<string, number>;
  /** Justificación del desvío, por `assignmentId`. Obligatoria si el desvío es grande. */
  notes?: Record<string, string>;
}

/** Desvío a partir del cual la nota deja de ser opcional (REGLAS-NEGOCIO §3). */
const DESVIO_HORAS = 2;
const DESVIO_RELATIVO = 0.25;

export async function closeShift(input: CloseShiftInput) {
  return serializable(async (tx) => {
    const shift = await tx.shift.findUnique({
      where: { id: input.shiftId },
      include: { assignments: { include: { equipment: true, operator: true } } },
    });

    if (!shift) {
      throw new ServiceError({
        code: 'SHIFT_NOT_FOUND',
        message: `No existe el turno solicitado (${input.shiftId}).`,
        status: 404,
      });
    }

    // El cierre es idempotente: un turno cerrado no se vuelve a cerrar ni vuelve a sumar
    // horas al horómetro.
    if (shift.status !== 'PLANNED') {
      throw new ServiceError({
        code: 'SHIFT_NOT_PLANNED',
        message: `El turno del ${formatIsoDate(toIsoDate(shift.date))} (${journeyLabel(shift.journey)}) ya está ${shift.status === 'CLOSED' ? 'cerrado' : 'cancelado'}: no se puede volver a cerrar.`,
        status: 409,
      });
    }

    // Una asignación en riesgo no se cierra con horas: hay que reasignar el equipo o
    // cancelarla antes (DECISIONES §2.1). El sistema no decide por la operación.
    const enRiesgo = shift.assignments.filter((a) => a.status === 'AT_RISK');
    if (enRiesgo.length > 0) {
      const detalle = enRiesgo
        .map((a) => `${a.equipment.code} · ${a.operator.fullName} (${a.riskReason ?? 'en riesgo'})`)
        .join('; ');

      throw new ServiceError({
        code: 'ASSIGNMENT_AT_RISK_UNRESOLVED',
        message: `El turno tiene ${enRiesgo.length} ${enRiesgo.length === 1 ? 'asignación en riesgo' : 'asignaciones en riesgo'} sin resolver: ${detalle}. Reasigne el equipo o cancele la asignación antes de cerrar el turno.`,
        status: 409,
      });
    }

    const computables = shift.assignments.filter((a) => a.status === 'ACTIVE');
    const conocidas = new Set(shift.assignments.map((a) => a.id));

    for (const id of Object.keys(input.actualHours ?? {})) {
      if (!conocidas.has(id)) {
        throw new ServiceError({
          code: 'UNKNOWN_ASSIGNMENT',
          message: `La asignación ${id} no pertenece a este turno; revise las horas enviadas.`,
          status: 400,
        });
      }
    }

    // 1. Validar horas y notas antes de escribir nada: si el cierre se cae a la mitad,
    //    el mensaje debe llegar antes de haber movido ningún horómetro.
    const cierres = computables.map((assignment) => {
      const planned = Number(assignment.plannedHours);
      const hours = input.actualHours?.[assignment.id] ?? planned;
      const note = input.notes?.[assignment.id]?.trim();

      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
        throw new ServiceError({
          code: 'INVALID_ACTUAL_HOURS',
          message: `Las horas de ${assignment.operator.fullName} en ${assignment.equipment.code} deben estar entre 0 y 24; se recibió ${hours}.`,
          status: 400,
        });
      }

      const variance = hours - planned;
      const grande =
        Math.abs(variance) > DESVIO_HORAS ||
        (planned > 0 && Math.abs(variance) / planned > DESVIO_RELATIVO);

      if (grande && !note) {
        throw new ServiceError({
          code: 'VARIANCE_NOTE_REQUIRED',
          message: `${assignment.equipment.code} se planificó en ${planned} h y se cierra con ${hours} h (${variance > 0 ? '+' : ''}${variance} h). Escriba el motivo del desvío para poder cerrar el turno.`,
          status: 400,
        });
      }

      return { assignment, hours, note };
    });

    // 2. Bloquear todos los equipos del turno de una vez y en orden determinista: dos
    //    cierres simultáneos que compartan equipos se serializan en vez de trabarse
    //    esperándose mutuamente.
    const equipmentIds = [...new Set(cierres.map((c) => c.assignment.equipmentId))].sort();

    if (equipmentIds.length > 0) {
      await tx.$queryRaw`
        SELECT "id" FROM "equipment"
        WHERE "id" IN (${Prisma.join(equipmentIds)})
        ORDER BY "id" FOR UPDATE`;
    }

    const equipos = new Map(
      (await tx.equipment.findMany({ where: { id: { in: equipmentIds } } })).map((e) => [
        e.id,
        e,
      ]),
    );

    const bloqueados: string[] = [];
    let enRiesgoNuevas = 0;

    for (const { assignment, hours, note } of cierres) {
      const equipment = equipos.get(assignment.equipmentId);

      if (!equipment) {
        throw new ServiceError({
          code: 'EQUIPMENT_NOT_FOUND',
          message: `No existe el equipo de la asignación ${assignment.id}.`,
          status: 404,
        });
      }

      const before = Number(equipment.currentHours);
      const after = before + hours;

      // Nada toca el horómetro sin escribir su asiento, en la misma transacción.
      await tx.hourmeterEntry.create({
        data: {
          equipmentId: equipment.id,
          source: 'SHIFT_CLOSE',
          referenceId: assignment.id,
          hoursBefore: before,
          hoursDelta: hours,
          hoursAfter: after,
          createdById: input.userId,
        },
      });

      // Regla 10 disparando la regla 2: cruzar el umbral bloquea al equipo, aquí mismo.
      const cruzaUmbral = after >= Number(equipment.nextMaintenanceHours);
      const status = cruzaUmbral ? 'BLOCKED' : equipment.status;

      const actualizado = await tx.equipment.updateMany({
        where: { id: equipment.id, version: equipment.version },
        data: { currentHours: after, status, version: { increment: 1 } },
      });

      if (actualizado.count === 0) {
        throw new ServiceError({
          code: 'CONCURRENT_UPDATE',
          message: `El horómetro de ${equipment.code} cambió mientras se cerraba el turno. Vuelva a intentarlo.`,
          status: 409,
        });
      }

      if (status === 'BLOCKED' && equipment.status !== 'BLOCKED') {
        bloqueados.push(equipment.code);

        await tx.alert.create({
          data: {
            type: 'MAINTENANCE_DUE_SOON',
            severity: 'CRITICAL',
            equipmentId: equipment.id,
            message: `${equipment.code} llegó a ${after} h y superó su umbral de ${Number(equipment.nextMaintenanceHours)} h: quedó BLOQUEADO. Registre el mantenimiento para liberarlo.`,
          },
        });

        enRiesgoNuevas += await flagFutureAssignmentsAtRisk(tx, equipment.id, shift.date);
      }

      await tx.assignment.update({
        where: { id: assignment.id },
        data: { actualHours: hours, varianceNote: note ?? null, status: 'COMPLETED' },
      });
    }

    await tx.shift.update({
      where: { id: shift.id },
      data: { status: 'CLOSED', closedAt: new Date(), closedById: input.userId },
    });

    return {
      closedAssignments: cierres.length,
      blockedEquipment: bloqueados,
      assignmentsAtRisk: enRiesgoNuevas,
    };
  });
}

function journeyLabel(journey: 'DAY' | 'NIGHT'): string {
  return journey === 'DAY' ? 'DÍA' : 'NOCHE';
}
