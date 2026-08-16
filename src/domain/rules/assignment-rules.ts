/**
 * Motor de reglas de asignación (reglas 6, 7, 8, 9 y 11 del enunciado).
 *
 * TypeScript puro: recibe un snapshot plano y devuelve decisiones. No conoce Prisma,
 * no consulta nada y **no lee el reloj**: la vigencia de una certificación se evalúa
 * contra la fecha del turno, nunca contra `new Date()`.
 */
import type { AssignmentContext, IsoDate, ShiftSnapshot } from '../types';
import { SEVERITY_BY_CODE, type Violation, type ViolationCode } from './violation';

/**
 * Evalúa todas las reglas y devuelve todas las violaciones (regla 11).
 *
 * No hay early return: cortar en la primera violación obligaría al planificador a
 * descubrir los problemas de a uno, arreglar, reintentar y volver a fallar.
 */
export function validateAssignment(input: AssignmentContext): Violation[] {
  return [
    ...shiftRules(input),
    ...equipmentStatusRules(input),
    ...operatorRules(input),
    ...duplicationRules(input),
    ...certificationRules(input),
  ];
}

/**
 * Una asignación rechazada se puede forzar solo si todo lo que la bloquea es
 * `OVERRIDABLE`. Una sola violación `HARD` deja el rechazo firme (§5): el override
 * se ignora. Los `WARNING` no bloquean, así que no cuentan para ninguno de los dos lados.
 */
export function canBeOverridden(violations: Violation[]): boolean {
  return (
    violations.some((v) => v.severity === 'OVERRIDABLE') &&
    !violations.some((v) => v.severity === 'HARD')
  );
}

// ─────────────────────────── Reglas ───────────────────────────

/** No se asigna a un turno que ya no está planificado: sería falsear historia. */
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

/** Regla 8: no se asigna un equipo bloqueado, en taller o dado de baja. */
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

/** Un operador dado de baja no opera: se reactiva desde su ficha, no se fuerza el turno. */
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

/** Reglas 6 y 7: un operador y un equipo, una sola asignación vigente por turno. */
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

/**
 * Regla 9: certificación vigente para el tipo de equipo, evaluada contra la fecha
 * del turno. De las certificaciones del tipo vale la de mayor `expiresAt` (renovaciones).
 */
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

  // Las fechas ISO se ordenan igual como texto que como fecha.
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

// ─────────────────────────── Formato de mensajes ───────────────────────────

/** La severidad la pone la tabla de §2, nunca la regla que emite la violación. */
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

/** '2026-08-18' → '18/08/2026'. */
function date(value: IsoDate): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function shiftLabel(shift: ShiftSnapshot): string {
  return `turno del ${date(shift.date)} (${shift.journey === 'DAY' ? 'DÍA' : 'NOCHE'})`;
}
