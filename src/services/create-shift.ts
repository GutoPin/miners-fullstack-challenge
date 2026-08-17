/**
 * Create a shift (rule 5: date + journey + duration).
 *
 * No transaction needed for a single row. Uniqueness of (date, journey) is enforced by the
 * index; this only turns the clash into a message someone can act on.
 */
import { Prisma } from '../db/generated/client';
import { prisma } from '../db/prisma';
import type { IsoDate, Journey } from '../domain/types';
import { formatIsoDate, shiftWindow, toDateColumn } from './dates';
import { ServiceError } from './errors';

export interface CreateShiftInput {
  date: IsoDate;
  journey: Journey;
  plannedHours: number;
}

export async function createShift(input: CreateShiftInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new ServiceError({
      code: 'INVALID_SHIFT_DATE',
      message: `La fecha del turno debe tener el formato AAAA-MM-DD; se recibió "${input.date}".`,
      status: 400,
    });
  }

  if (!(input.plannedHours > 0 && input.plannedHours <= 24)) {
    throw new ServiceError({
      code: 'INVALID_PLANNED_HOURS',
      message: `La duración del turno debe estar entre 0 y 24 horas; se recibió ${input.plannedHours}.`,
      status: 400,
    });
  }

  try {
    return await prisma.shift.create({
      data: {
        date: toDateColumn(input.date),
        journey: input.journey,
        plannedHours: input.plannedHours,
        ...shiftWindow(input.date, input.journey, input.plannedHours),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ServiceError({
        code: 'SHIFT_ALREADY_EXISTS',
        message: `Ya existe el turno ${input.journey === 'DAY' ? 'de día' : 'de noche'} del ${formatIsoDate(input.date)}. Solo puede haber uno de cada jornada por fecha.`,
        status: 409,
      });
    }

    throw error;
  }
}
