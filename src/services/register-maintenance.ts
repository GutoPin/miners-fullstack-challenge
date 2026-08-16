/**
 * Registrar un mantenimiento (regla 3).
 *
 * Libera el equipo, deja historial y calcula el próximo umbral con la política anclada de
 * `docs/MODELO-DATOS.md` §4. Todo en una transacción: liberar sin registrar el asiento del
 * horómetro dejaría la bitácora mintiendo.
 */
import { prisma } from '../db/prisma';
import { nextThreshold } from '../domain/maintenance-policy';
import { ServiceError } from './errors';
import { clearEquipmentRisk } from './recalculate-risk';

export interface RegisterMaintenanceInput {
  equipmentId: string;
  userId: string;
  /** Horómetro real leído en el taller al hacer el servicio. */
  hoursAtService: number;
  responsible: string;
  performedAt?: Date;
  notes?: string;
}

export async function registerMaintenance(input: RegisterMaintenanceInput) {
  return prisma.$transaction(
    async (tx) => {
      const bloqueado = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "equipment" WHERE "id" = ${input.equipmentId} FOR UPDATE`;

      if (bloqueado.length === 0) {
        throw new ServiceError({
          code: 'EQUIPMENT_NOT_FOUND',
          message: `No existe el equipo solicitado (${input.equipmentId}).`,
          status: 404,
        });
      }

      const equipment = await tx.equipment.findUniqueOrThrow({
        where: { id: input.equipmentId },
        include: { type: true },
      });

      const responsible = input.responsible.trim();
      if (responsible.length === 0) {
        throw new ServiceError({
          code: 'RESPONSIBLE_REQUIRED',
          message: 'Indique quién ejecutó el mantenimiento: la regla 3 exige dejar responsable en el historial.',
          status: 400,
        });
      }

      const currentHours = Number(equipment.currentHours);

      // Un horómetro no retrocede. Si la lectura del taller es menor que el saldo, el error
      // está en el dato y hay que corregirlo, no absorberlo en silencio.
      if (input.hoursAtService < currentHours) {
        throw new ServiceError({
          code: 'HOURMETER_CANNOT_DECREASE',
          message: `${equipment.code} tiene ${currentHours} h registradas y usted informó ${input.hoursAtService} h. El horómetro no puede retroceder: verifique la lectura.`,
          status: 400,
        });
      }

      const interval = equipment.maintenanceIntervalOverride ?? equipment.type.maintenanceIntervalHours;
      const previousThreshold = Number(equipment.nextMaintenanceHours);
      const { next, overdue, reAnchored } = nextThreshold(
        previousThreshold,
        input.hoursAtService,
        interval,
      );

      const performedAt = input.performedAt ?? new Date();

      const maintenance = await tx.maintenanceRecord.create({
        data: {
          equipmentId: equipment.id,
          performedAt,
          hoursAtService: input.hoursAtService,
          thresholdHours: previousThreshold,
          overdueHours: overdue,
          nextThresholdHours: next,
          responsible,
          notes: input.notes?.trim() || null,
          registeredById: input.userId,
        },
      });

      // Si la lectura del taller no coincide con el saldo, la diferencia también es un
      // movimiento del horómetro y necesita su asiento (para eso existe el origen
      // MAINTENANCE en el ledger).
      const delta = input.hoursAtService - currentHours;
      if (delta > 0) {
        await tx.hourmeterEntry.create({
          data: {
            equipmentId: equipment.id,
            source: 'MAINTENANCE',
            referenceId: maintenance.id,
            hoursBefore: currentHours,
            hoursDelta: delta,
            hoursAfter: input.hoursAtService,
            note: 'Ajuste por lectura de horómetro al ingresar a taller',
            createdById: input.userId,
          },
        });
      }

      // Un equipo dado de baja no se reactiva registrando un servicio: eso se decide en su
      // ficha. El mantenimiento solo libera lo que el mantenimiento bloqueó.
      const status = equipment.status === 'OUT_OF_SERVICE' ? 'OUT_OF_SERVICE' : 'AVAILABLE';

      const actualizado = await tx.equipment.updateMany({
        where: { id: equipment.id, version: equipment.version },
        data: {
          currentHours: input.hoursAtService,
          nextMaintenanceHours: next,
          status,
          version: { increment: 1 },
        },
      });

      if (actualizado.count === 0) {
        throw new ServiceError({
          code: 'CONCURRENT_UPDATE',
          message: `${equipment.code} cambió mientras se registraba el mantenimiento. Vuelva a intentarlo.`,
          status: 409,
        });
      }

      const recuperadas = await clearEquipmentRisk(tx, equipment.id);

      return {
        maintenance,
        previousThreshold,
        nextThreshold: next,
        overdue,
        reAnchored,
        recoveredAssignments: recuperadas,
      };
    },
    { isolationLevel: 'Serializable' },
  );
}
