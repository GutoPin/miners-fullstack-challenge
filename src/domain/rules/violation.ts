/** Rule engine vocabulary: what can be wrong, how serious it is, how it is reported. */

export type ViolationCode =
  | 'EQUIPMENT_BLOCKED' // rule 8
  | 'EQUIPMENT_IN_MAINTENANCE' // rule 8
  | 'EQUIPMENT_OUT_OF_SERVICE'
  | 'EQUIPMENT_ALREADY_ASSIGNED' // rule 7
  | 'OPERATOR_ALREADY_ASSIGNED' // rule 6
  | 'OPERATOR_NOT_CERTIFIED' // rule 9, never certified
  | 'CERTIFICATION_EXPIRED' // rule 9, expired at the shift date
  | 'CERTIFICATION_EXPIRES_DURING_SHIFT'
  | 'OPERATOR_INACTIVE'
  | 'SHIFT_NOT_PLANNED' // closed or cancelled shift
  | 'PROJECTED_BLOCK_BEFORE_SHIFT'; // equipment will be blocked before this shift

export type Severity =
  | 'HARD' // never forced
  | 'OVERRIDABLE' // a SUPERVISOR can authorize the exception
  | 'WARNING'; // does not block, is reported and recorded

export interface Violation {
  code: ViolationCode;
  severity: Severity;
  message: string; // spanish, user facing
  context?: Record<string, unknown>; // hours left, expiry date, etc.
}

/**
 * Severity belongs to the code, not to the rule that raises it, so two rules can never
 * disagree on whether something is forceable. HARD is a physical impossibility or data
 * corruption; OVERRIDABLE is a business policy someone can sign for.
 */
export const SEVERITY_BY_CODE: Record<ViolationCode, Severity> = {
  EQUIPMENT_ALREADY_ASSIGNED: 'HARD',
  OPERATOR_ALREADY_ASSIGNED: 'HARD',
  SHIFT_NOT_PLANNED: 'HARD',
  EQUIPMENT_OUT_OF_SERVICE: 'HARD',
  OPERATOR_INACTIVE: 'HARD',

  EQUIPMENT_BLOCKED: 'OVERRIDABLE',
  EQUIPMENT_IN_MAINTENANCE: 'OVERRIDABLE',
  OPERATOR_NOT_CERTIFIED: 'OVERRIDABLE',
  CERTIFICATION_EXPIRED: 'OVERRIDABLE',

  CERTIFICATION_EXPIRES_DURING_SHIFT: 'WARNING',
  PROJECTED_BLOCK_BEFORE_SHIFT: 'WARNING',
};
