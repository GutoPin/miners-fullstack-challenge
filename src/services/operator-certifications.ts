/**
 * What an operator is allowed to drive, over time.
 *
 * Granting adds a row; the rule engine already takes the one with the latest `expiresAt` for
 * each type, so a renewal is just another row and the history stays readable. Revoking does
 * **not** delete anything: it brings every still-valid certification of that type back to
 * yesterday. The operator fails rule 3 from now on, past shifts keep the dates that were true
 * when they were validated, and the register still answers when he stopped being qualified.
 */
import { prisma } from '../db/prisma';
import type { IsoDate } from '../domain/types';
import { validarCertificacion, type CertificationInput } from './create-operator';
import { toDateColumn, toOperationalDate } from './dates';
import { ServiceError } from './errors';

export async function grantCertification(
  operatorId: string,
  input: CertificationInput,
): Promise<void> {
  validarCertificacion(input);

  const [operador, tipo] = await Promise.all([
    prisma.operator.findUnique({ where: { id: operatorId } }),
    prisma.equipmentType.findUnique({ where: { id: input.equipmentTypeId } }),
  ]);

  if (!operador || !tipo) {
    throw new ServiceError({
      code: 'UNKNOWN_OPERATOR_OR_TYPE',
      message: 'El operador o el tipo de equipo indicado no existe.',
      status: 404,
    });
  }

  await prisma.certification.create({
    data: {
      operatorId,
      equipmentTypeId: input.equipmentTypeId,
      issuedAt: toDateColumn(input.issuedAt),
      expiresAt: toDateColumn(input.expiresAt),
      documentRef: input.documentRef?.trim() || null,
    },
  });
}

export async function revokeCertification(
  operatorId: string,
  equipmentTypeId: string,
  hoy: IsoDate = toOperationalDate(new Date()),
): Promise<number> {
  const ayer = new Date(`${hoy}T00:00:00.000Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);

  // only the ones still standing: an already expired certification must keep its own date
  const { count } = await prisma.certification.updateMany({
    where: { operatorId, equipmentTypeId, expiresAt: { gt: ayer } },
    data: { expiresAt: ayer },
  });

  if (count === 0) {
    throw new ServiceError({
      code: 'NOTHING_TO_REVOKE',
      message: 'Este operador no tiene ninguna certificación vigente de ese tipo de equipo.',
      status: 409,
    });
  }

  return count;
}

/**
 * Deactivating does not touch existing assignments: rule 3 is evaluated when the assignment is
 * created, and rewriting the past to match today's roster would falsify what was validated.
 */
export async function setOperatorActive(operatorId: string, active: boolean): Promise<void> {
  const operador = await prisma.operator.findUnique({ where: { id: operatorId } });

  if (!operador) {
    throw new ServiceError({
      code: 'UNKNOWN_OPERATOR',
      message: 'El operador indicado no existe.',
      status: 404,
    });
  }

  await prisma.operator.update({ where: { id: operatorId }, data: { active } });
}
