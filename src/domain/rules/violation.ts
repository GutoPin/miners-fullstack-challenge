/**
 * Vocabulario del motor de reglas: qué puede estar mal, cuán grave es y cómo se cuenta.
 * Definido en docs/REGLAS-NEGOCIO.md §2.
 */

export type ViolationCode =
  | 'EQUIPMENT_BLOCKED' // regla 8
  | 'EQUIPMENT_IN_MAINTENANCE' // regla 8
  | 'EQUIPMENT_OUT_OF_SERVICE'
  | 'EQUIPMENT_ALREADY_ASSIGNED' // regla 7
  | 'OPERATOR_ALREADY_ASSIGNED' // regla 6
  | 'OPERATOR_NOT_CERTIFIED' // regla 9 (nunca tuvo certificación)
  | 'CERTIFICATION_EXPIRED' // regla 9 (vencida a la fecha del turno)
  | 'CERTIFICATION_EXPIRES_DURING_SHIFT'
  | 'OPERATOR_INACTIVE'
  | 'SHIFT_NOT_PLANNED' // turno cerrado o cancelado
  | 'PROJECTED_BLOCK_BEFORE_SHIFT'; // el equipo se bloqueará antes de este turno

export type Severity =
  | 'HARD' // nunca se puede forzar
  | 'OVERRIDABLE' // un SUPERVISOR puede autorizar la excepción
  | 'WARNING'; // no impide, se informa y queda registrada

export interface Violation {
  code: ViolationCode;
  severity: Severity;
  message: string; // en español, orientado al usuario
  context?: Record<string, unknown>; // horas faltantes, fecha de vencimiento, etc.
}

/**
 * La tabla de severidades de docs/REGLAS-NEGOCIO.md §2.
 *
 * La severidad es propiedad del código, no de la regla que lo emite: así dos reglas
 * no pueden discrepar sobre si algo es forzable. Criterio: HARD = imposibilidad física
 * o corrupción de datos; OVERRIDABLE = decisión de negocio con responsable.
 */
export const SEVERITY_BY_CODE: Record<ViolationCode, Severity> = {
  // Imposibilidades físicas o de historia: ninguna firma las arregla.
  EQUIPMENT_ALREADY_ASSIGNED: 'HARD',
  OPERATOR_ALREADY_ASSIGNED: 'HARD',
  SHIFT_NOT_PLANNED: 'HARD',
  EQUIPMENT_OUT_OF_SERVICE: 'HARD',
  // Baja deliberada de personal: se revierte reactivando al operador, no forzando el turno.
  OPERATOR_INACTIVE: 'HARD',

  // Políticas de negocio: un SUPERVISOR las autoriza y queda auditado.
  EQUIPMENT_BLOCKED: 'OVERRIDABLE',
  EQUIPMENT_IN_MAINTENANCE: 'OVERRIDABLE',
  OPERATOR_NOT_CERTIFIED: 'OVERRIDABLE',
  CERTIFICATION_EXPIRED: 'OVERRIDABLE',

  // Informativas: no impiden la asignación, se muestran y se registran.
  CERTIFICATION_EXPIRES_DURING_SHIFT: 'WARNING',
  PROJECTED_BLOCK_BEFORE_SHIFT: 'WARNING',
};
