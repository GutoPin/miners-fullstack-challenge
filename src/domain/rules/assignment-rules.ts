/**
 * Assignment rule engine (rules 6, 7, 8, 9 and 11).
 *
 * Plain TypeScript: takes a flat snapshot, returns decisions. No Prisma, no queries and
 * no clock — certification validity is checked against the shift date, never `new Date()`.
 */
import type { AssignmentContext, IsoDate, ShiftSnapshot } from '../types';
import { SEVERITY_BY_CODE, type Violation, type ViolationCode } from './violation';

/** every rule, every violation: no early return (rule 11) */
export function validateAssignment(input: AssignmentContext): Violation[] {
  return [
    ...shiftRules(input),
    ...equipmentStatusRules(input),
    ...operatorRules(input),
    ...duplicationRules(input),
    ...certificationRules(input),
  ];
}

/** overridable only if nothing blocking is HARD; warnings don't count either way */
export function canBeOverridden(violations: Violation[]): boolean {
  return (
    violations.some((v) => v.severity === 'OVERRIDABLE') &&
    !violations.some((v) => v.severity === 'HARD')
  );
}

/** a closed or cancelled shift takes no assignments */
function shiftRules({ shift }: AssignmentContext): Violation[] {
  if (shift.status === 'PLANNED') return [];

  const estado = shift.status === 'CLOSED' ? 'cerrado' : 'cancelado';
  return [
    violation(
      'SHIFT_NOT_PLANNED',
      `El ${shiftLabel(shift)} está ${estado}: ya no admite asignaciones. Cree la asignación en un turno planificado.`,
      { shiftStatus: shift.status },
    ),
  ];
}

/** rule 8: blocked, in workshop or retired equipment cannot be assigned */
function equipmentStatusRules({ equipment }: AssignmentContext): Violation[] {
  switch (equipment.status) {
    case 'AVAILABLE':
      return [];

    case 'BLOCKED':
      return [
        violation(
          'EQUIPMENT_BLOCKED',
          `${equipment.code} está BLOQUEADO: ${hours(equipment.currentHours)} h supera su umbral de ${hours(equipment.nextMaintenanceHours)} h. Registre el mantenimiento para liberarlo.`,
          {
            currentHours: equipment.currentHours,
            thresholdHours: equipment.nextMaintenanceHours,
            overdue: equipment.currentHours - equipment.nextMaintenanceHours,
          },
        ),
      ];

    case 'IN_MAINTENANCE':
      return [
        violation(
          'EQUIPMENT_IN_MAINTENANCE',
          `${equipment.code} está en mantenimiento en taller. Registre la salida del taller o elija otro equipo.`,
          { equipmentCode: equipment.code },
        ),
      ];

    case 'OUT_OF_SERVICE':
      return [
        violation(
          'EQUIPMENT_OUT_OF_SERVICE',
          `${equipment.code} está fuera de servicio por baja operativa. Reactive el equipo antes de asignarlo.`,
          { equipmentCode: equipment.code },
        ),
      ];
  }
}

/** inactive operators are reactivated from their record, not forced into a shift */
function operatorRules({ operator }: AssignmentContext): Violation[] {
  if (operator.active) return [];

  return [
    violation(
      'OPERATOR_INACTIVE',
      `${operator.fullName} está inactivo y no puede recibir asignaciones. Reactive al operador en su ficha o elija otro.`,
      { operatorId: operator.id },
    ),
  ];
}

/** rules 6 and 7: one active assignment per operator and per equipment in a shift */
function duplicationRules({ shift, equipment, operator, activeAssignments }: AssignmentContext): Violation[] {
  const violations: Violation[] = [];

  const equipmentTaken = activeAssignments.find((a) => a.equipmentId === equipment.id);
  if (equipmentTaken) {
    violations.push(
      violation(
        'EQUIPMENT_ALREADY_ASSIGNED',
        `${equipment.code} ya está asignado a ${equipmentTaken.operatorName} en el ${shiftLabel(shift)}. Elija otro equipo o cancele esa asignación.`,
        { conflictingAssignmentId: equipmentTaken.id, operatorName: equipmentTaken.operatorName },
      ),
    );
  }

  const operatorTaken = activeAssignments.find((a) => a.operatorId === operator.id);
  if (operatorTaken) {
    violations.push(
      violation(
        'OPERATOR_ALREADY_ASSIGNED',
        `${operator.fullName} ya tiene asignado el equipo ${operatorTaken.equipmentCode} en el ${shiftLabel(shift)}. Elija otro operador o cancele esa asignación.`,
        { conflictingAssignmentId: operatorTaken.id, equipmentCode: operatorTaken.equipmentCode },
      ),
    );
  }

  return violations;
}

/** rule 9: certification valid at the shift date; renewals win by latest expiry */
function certificationRules({ shift, equipment, operator, certifications }: AssignmentContext): Violation[] {
  const delTipo = certifications.filter((c) => c.equipmentTypeId === equipment.typeId);

  if (delTipo.length === 0) {
    return [
      violation(
        'OPERATOR_NOT_CERTIFIED',
        `${operator.fullName} no tiene ninguna certificación para ${equipment.typeName}. Registre su certificación antes de asignarlo a ${equipment.code}.`,
        { equipmentTypeId: equipment.typeId, equipmentTypeName: equipment.typeName },
      ),
    ];
  }

  // iso dates sort the same as strings and as dates
  const vigente = delTipo.reduce((a, b) => (a.expiresAt >= b.expiresAt ? a : b));

  if (vigente.expiresAt < shift.date) {
    return [
      violation(
        'CERTIFICATION_EXPIRED',
        `La certificación de ${operator.fullName} para ${equipment.typeName} venció el ${date(vigente.expiresAt)}, antes del ${shiftLabel(shift)}. Renueve la certificación o asigne otro operador.`,
        { expiresAt: vigente.expiresAt, shiftDate: shift.date },
      ),
    ];
  }

  if (vigente.expiresAt < shift.endDate) {
    return [
      violation(
        'CERTIFICATION_EXPIRES_DURING_SHIFT',
        `La certificación de ${operator.fullName} para ${equipment.typeName} vence el ${date(vigente.expiresAt)} y el turno termina el ${date(shift.endDate)}: quedará sin cobertura antes del cierre. Acorte el turno o releve al operador.`,
        { expiresAt: vigente.expiresAt, shiftEndDate: shift.endDate },
      ),
    ];
  }

  return [];
}

/** severity comes from the code table, never from the rule that raises it */
function violation(code: ViolationCode, message: string, context: Record<string, unknown>): Violation {
  return { code, severity: SEVERITY_BY_CODE[code], message, context };
}

const hoursFormat = new Intl.NumberFormat('es-PE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function hours(value: number): string {
  return hoursFormat.format(value);
}

/** '2026-08-18' → '18/08/2026' */
function date(value: IsoDate): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function shiftLabel(shift: ShiftSnapshot): string {
  return `turno del ${date(shift.date)} (${shift.journey === 'DAY' ? 'DÍA' : 'NOCHE'})`;
}
