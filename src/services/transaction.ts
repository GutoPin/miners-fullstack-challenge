/**
 * `Serializable` transaction with a single retry.
 *
 * Under this isolation level two competing writes do not always end in a unique violation:
 * PostgreSQL may abort one with a serialization failure (P2034) before the index fires.
 * That is not the user's error, so it is retried once — and the retry also improves the
 * message, because by then the winner is visible and domain validation can explain the
 * conflict in business terms instead of asking to try again.
 */
import { Prisma } from '../db/generated/client';
import { prisma } from '../db/prisma';
import { ServiceError } from './errors';

/** "Transaction failed due to a write conflict or a deadlock" */
const CONFLICTO_DE_ESCRITURA = 'P2034';

export async function serializable<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(fn, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (!esConflictoDeEscritura(error)) throw error;
  }

  // one retry, not a loop: a second clash is not a race any more
  try {
    return await prisma.$transaction(fn, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (!esConflictoDeEscritura(error)) throw error;

    throw new ServiceError({
      code: 'WRITE_CONFLICT',
      message:
        'Otro usuario está modificando los mismos datos en este momento. Espere unos segundos y vuelva a intentarlo.',
      status: 409,
    });
  }
}

function esConflictoDeEscritura(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === CONFLICTO_DE_ESCRITURA;
  }

  // under heavy contention the driver reports it first as DriverAdapterError:
  // TransactionWriteConflict — same event (SQLSTATE 40001), same response, not a 500
  const texto = error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  return /TransactionWriteConflict|could not serialize|deadlock detected|40001/i.test(texto);
}
