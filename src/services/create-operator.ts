/**
 * Register an operator with the equipment types they are certified for.
 *
 * Operator and certifications go in one transaction: an operator recorded without the
 * certifications the form declared would be rejected by rule 3 on his first assignment, and
 * whoever registered him would have no way of telling that half the write landed.
 */
import { Prisma } from '../db/generated/client';
import { prisma } from '../db/prisma';
import type { IsoDate } from '../domain/types';
import { formatIsoDate, toDateColumn } from './dates';
import { ServiceError } from './errors';

export interface CertificationInput {
  equipmentTypeId: string;
  issuedAt: IsoDate;
  expiresAt: IsoDate;
  documentRef?: string;
}

export interface CreateOperatorInput {
  code: string;
  fullName: string;
  document: string;
  certifications: CertificationInput[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** shared by creation and by adding a certification later */
export function validarCertificacion(c: CertificationInput): void {
  if (!ISO.test(c.issuedAt) || !ISO.test(c.expiresAt)) {
    throw new ServiceError({
      code: 'INVALID_CERTIFICATION_DATE',
      message: 'Las fechas de la certificación deben tener el formato AAAA-MM-DD.',
      status: 400,
    });
  }

  // strings in this format compare like dates, which is why the column is a pure `date`
  if (c.expiresAt <= c.issuedAt) {
    throw new ServiceError({
      code: 'INVALID_CERTIFICATION_RANGE',
      message: `La certificación vence el ${formatIsoDate(c.expiresAt)}, antes o el mismo día de su emisión (${formatIsoDate(c.issuedAt)}). Corrija las fechas.`,
      status: 400,
    });
  }
}

export async function createOperator(input: CreateOperatorInput) {
  const code = input.code.trim().toUpperCase();
  const fullName = input.fullName.trim();
  const document = input.document.trim();

  if (!code || !fullName || !document) {
    throw new ServiceError({
      code: 'INCOMPLETE_OPERATOR',
      message: 'El código, el nombre completo y el documento son obligatorios.',
      status: 400,
    });
  }

  const tipos = new Set(input.certifications.map((c) => c.equipmentTypeId));
  if (tipos.size !== input.certifications.length) {
    throw new ServiceError({
      code: 'DUPLICATE_CERTIFICATION',
      message: 'Hay dos certificaciones para el mismo tipo de equipo. Deje una sola por tipo.',
      status: 400,
    });
  }

  input.certifications.forEach(validarCertificacion);

  try {
    return await prisma.$transaction((tx) =>
      tx.operator.create({
        data: {
          code,
          fullName,
          document,
          certifications: {
            create: input.certifications.map((c) => ({
              equipmentTypeId: c.equipmentTypeId,
              issuedAt: toDateColumn(c.issuedAt),
              expiresAt: toDateColumn(c.expiresAt),
              documentRef: c.documentRef?.trim() || null,
            })),
          },
        },
      }),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // the index says which column clashed; the message has to name it to be actionable
      const campo = String(error.meta?.target ?? '').includes('document') ? 'documento' : 'código';
      const valor = campo === 'documento' ? document : code;

      throw new ServiceError({
        code: 'OPERATOR_ALREADY_EXISTS',
        message: `Ya existe un operador con el ${campo} ${valor}. Los ${campo}s no se repiten: verifique si el operador ya está registrado.`,
        status: 409,
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new ServiceError({
        code: 'UNKNOWN_EQUIPMENT_TYPE',
        message: 'Una de las certificaciones apunta a un tipo de equipo que no existe.',
        status: 400,
      });
    }

    throw error;
  }
}
