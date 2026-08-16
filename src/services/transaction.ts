/**
 * Transacción `Serializable` con un reintento.
 *
 * Con este aislamiento, dos escrituras que compiten por lo mismo no terminan siempre en
 * violación de unicidad: PostgreSQL puede abortar una con un fallo de serialización
 * (P2034) *antes* de que el índice único llegue a dispararse. Ese error no es del usuario
 * y no se le muestra: se reintenta una vez.
 *
 * El reintento casi siempre mejora el mensaje. En el segundo intento el ganador ya está
 * visible, así que la validación del dominio explica el conflicto en lenguaje de negocio
 * ("CAM-001 ya está asignado a Juan Pérez en este turno") en vez de pedir que reintente.
 */
import { Prisma } from '../db/generated/client';
import { prisma } from '../db/prisma';
import { ServiceError } from './errors';

/** "Transaction failed due to a write conflict or a deadlock". */
const CONFLICTO_DE_ESCRITURA = 'P2034';

export async function serializable<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(fn, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (!esConflictoDeEscritura(error)) throw error;
  }

  // Un solo reintento, no un bucle: si vuelve a chocar, el problema no es la carrera.
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
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === CONFLICTO_DE_ESCRITURA
  );
}
