/**
 * Register a maintenance service (rule 3).
 *
 * Releases the equipment, records history and computes the next threshold with the anchored
 * policy. One transaction: releasing without the ledger entry would leave the log lying.
 */
import { nextThreshold } from '../domain/maintenance-policy';
import { ServiceError } from './errors';
import { clearEquipmentRisk } from './recalculate-risk';
import { serializable } from './transaction';

export interface RegisterMaintenanceInput {
  equipmentId: string;
  userId: string;
  /** hourmeter read at the workshop during the service */
  hoursAtService: number;
  responsible: string;
  performedAt?: Date;
  notes?: string;
}

export async function registerMaintenance(input: RegisterMaintenanceInput) {
  return serializable(async (tx) => {
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

    // an hourmeter never goes backwards: a lower reading is bad data, not a value to absorb
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

    // the gap between balance and workshop reading is movement too, so it gets its entry
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

    // a retired unit is not revived by a service: maintenance only releases what it blocked
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
  });
}
