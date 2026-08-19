/**
 * Register a piece of equipment with the hourmeter it arrives with.
 *
 * A machine rarely enters the system at zero hours, so the first threshold is not simply its
 * interval: it is the first multiple of the interval still ahead of the reading. That is the
 * same arithmetic `nextThreshold` already does when a service arrives past a whole cycle, so
 * it is reused instead of written twice.
 */
import { Prisma } from '../db/generated/client';
import { prisma } from '../db/prisma';
import { nextThreshold } from '../domain/maintenance-policy';
import { ServiceError } from './errors';

export interface CreateEquipmentInput {
  code: string;
  typeId: string;
  currentHours: number;
  /** null inherits the interval from the type */
  maintenanceIntervalOverride?: number | null;
  createdById: string;
}

export async function createEquipment(input: CreateEquipmentInput) {
  const code = input.code.trim().toUpperCase();

  if (!code) {
    throw new ServiceError({
      code: 'INCOMPLETE_EQUIPMENT',
      message: 'El código del equipo es obligatorio.',
      status: 400,
    });
  }

  if (!(input.currentHours >= 0) || input.currentHours > 1_000_000) {
    throw new ServiceError({
      code: 'INVALID_HOURMETER',
      message: `El horómetro inicial debe ser un número entre 0 y 1 000 000; se recibió ${input.currentHours}.`,
      status: 400,
    });
  }

  const override = input.maintenanceIntervalOverride ?? null;
  if (override !== null && !(override > 0)) {
    throw new ServiceError({
      code: 'INVALID_INTERVAL',
      message: `El intervalo propio debe ser mayor que cero; se recibió ${override}.`,
      status: 400,
    });
  }

  const tipo = await prisma.equipmentType.findUnique({ where: { id: input.typeId } });

  if (!tipo) {
    throw new ServiceError({
      code: 'UNKNOWN_EQUIPMENT_TYPE',
      message: 'El tipo de equipo indicado no existe.',
      status: 400,
    });
  }

  const intervalo = override ?? tipo.maintenanceIntervalHours;
  // anchor at zero and let the policy walk forward to the first threshold above the reading
  const umbral = nextThreshold(0, input.currentHours, intervalo).next;

  try {
    return await prisma.$transaction(async (tx) => {
      const equipo = await tx.equipment.create({
        data: {
          code,
          typeId: input.typeId,
          currentHours: input.currentHours,
          nextMaintenanceHours: umbral,
          maintenanceIntervalOverride: override,
          status: 'AVAILABLE',
        },
      });

      // nothing sets an hourmeter without its ledger entry, not even the opening balance
      await tx.hourmeterEntry.create({
        data: {
          equipmentId: equipo.id,
          source: 'INITIAL_LOAD',
          hoursBefore: 0,
          hoursDelta: input.currentHours,
          hoursAfter: input.currentHours,
          note: `Alta de ${code} con horómetro declarado. Primer umbral en ${umbral} h.`,
          createdById: input.createdById,
        },
      });

      return equipo;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ServiceError({
        code: 'EQUIPMENT_ALREADY_EXISTS',
        message: `Ya existe un equipo con el código ${code}. Verifique si la unidad ya está registrada.`,
        status: 409,
      });
    }

    throw error;
  }
}
