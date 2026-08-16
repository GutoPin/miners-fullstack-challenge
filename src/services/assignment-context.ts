/**
 * Arma el snapshot que consume el motor de reglas y lo evalúa.
 *
 * Lo usan dos caminos: la creación real (dentro de la transacción, sobre filas bloqueadas)
 * y la validación previa de la interfaz (lectura suelta, sin escribir nada). Es la misma
 * función a propósito: si la vista previa y la creación divergieran, la vista previa
 * estaría mintiendo.
 */
import type { Prisma } from '../db/generated/client';
import { validateAssignment } from '../domain/rules/assignment-rules';
import type { Violation } from '../domain/rules/violation';
import type { AssignmentContext } from '../domain/types';
import { toIsoDate, toOperationalDate } from './dates';
import { ServiceError } from './errors';

export interface AssignmentQuery {
  shiftId: string;
  operatorId: string;
  equipmentId: string;
}

export async function buildAssignmentContext(
  db: Prisma.TransactionClient,
  input: AssignmentQuery,
): Promise<{
  context: AssignmentContext;
  equipmentCode: string;
  operatorName: string;
  shiftPlannedHours: number;
}> {
  const [equipment, shift, operator, vigentes] = await Promise.all([
    db.equipment.findUnique({ where: { id: input.equipmentId }, include: { type: true } }),
    db.shift.findUnique({ where: { id: input.shiftId } }),
    db.operator.findUnique({
      where: { id: input.operatorId },
      include: { certifications: true },
    }),
    db.assignment.findMany({
      where: { shiftId: input.shiftId, status: { in: ['ACTIVE', 'AT_RISK'] } },
      include: { operator: true, equipment: true },
    }),
  ]);

  if (!equipment) {
    throw new ServiceError({
      code: 'EQUIPMENT_NOT_FOUND',
      message: `No existe el equipo solicitado (${input.equipmentId}).`,
      status: 404,
    });
  }

  if (!shift) {
    throw new ServiceError({
      code: 'SHIFT_NOT_FOUND',
      message: `No existe el turno solicitado (${input.shiftId}).`,
      status: 404,
    });
  }

  if (!operator) {
    throw new ServiceError({
      code: 'OPERATOR_NOT_FOUND',
      message: `No existe el operador solicitado (${input.operatorId}).`,
      status: 404,
    });
  }

  return {
    equipmentCode: equipment.code,
    operatorName: operator.fullName,
    shiftPlannedHours: Number(shift.plannedHours),
    context: {
      shift: {
        id: shift.id,
        date: toIsoDate(shift.date),
        endDate: toOperationalDate(shift.endsAt),
        journey: shift.journey,
        status: shift.status,
        plannedHours: Number(shift.plannedHours),
      },
      equipment: {
        id: equipment.id,
        code: equipment.code,
        typeId: equipment.typeId,
        typeName: equipment.type.name,
        status: equipment.status,
        currentHours: Number(equipment.currentHours),
        nextMaintenanceHours: Number(equipment.nextMaintenanceHours),
      },
      operator: {
        id: operator.id,
        fullName: operator.fullName,
        active: operator.active,
      },
      certifications: operator.certifications.map((c) => ({
        equipmentTypeId: c.equipmentTypeId,
        issuedAt: toIsoDate(c.issuedAt),
        expiresAt: toIsoDate(c.expiresAt),
      })),
      activeAssignments: vigentes.map((a) => ({
        id: a.id,
        operatorId: a.operatorId,
        operatorName: a.operator.fullName,
        equipmentId: a.equipmentId,
        equipmentCode: a.equipment.code,
      })),
    },
  };
}

/**
 * Vista previa para la interfaz: dice qué pasaría **sin escribir nada**. No reemplaza la
 * validación de la creación, que se repite dentro de la transacción y sobre la fila del
 * equipo bloqueada; entre esta consulta y el envío, el estado puede cambiar.
 */
export async function previewAssignment(
  db: Prisma.TransactionClient,
  input: AssignmentQuery,
): Promise<{ violations: Violation[] }> {
  const { context } = await buildAssignmentContext(db, input);

  return { violations: validateAssignment(context) };
}
