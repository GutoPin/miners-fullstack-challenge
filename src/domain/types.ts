/**
 * Input types for the rule engine.
 *
 * Plain objects: the domain knows nothing about Prisma or Next. Schema `Decimal`s arrive
 * here as `number` and calendar dates as `IsoDate`; the service builds the snapshot.
 */

/** calendar date without time, 'YYYY-MM-DD'; compares correctly as a string */
export type IsoDate = string;

// mirrors of the schema enums, kept here so the domain never imports the prisma client
export type Journey = 'DAY' | 'NIGHT';
export type EquipmentStatus = 'AVAILABLE' | 'BLOCKED' | 'IN_MAINTENANCE' | 'OUT_OF_SERVICE';
export type ShiftStatus = 'PLANNED' | 'CLOSED' | 'CANCELLED';
export type AssignmentStatus = 'ACTIVE' | 'AT_RISK' | 'CANCELLED' | 'COMPLETED';

export interface EquipmentSnapshot {
  id: string;
  code: string; // 'CAM-003', for messages
  typeId: string; // matches Certification.equipmentTypeId
  typeName: string; // 'Camión de acarreo', for messages
  status: EquipmentStatus;
  currentHours: number;
  nextMaintenanceHours: number; // absolute threshold that triggers the block
}

export interface ShiftSnapshot {
  id: string;
  date: IsoDate; // operational date of the shift
  /** calendar date the shift ends on in Lima; `date + 1` when a night shift crosses midnight */
  endDate: IsoDate;
  journey: Journey;
  status: ShiftStatus;
  plannedHours: number;
}

export interface OperatorSnapshot {
  id: string;
  fullName: string;
  active: boolean;
}

export interface CertificationSnapshot {
  equipmentTypeId: string;
  issuedAt: IsoDate;
  expiresAt: IsoDate; // valid through the end of that day
}

/** another assignment already holding a slot in the same shift (rules 6 and 7) */
export interface ExistingAssignment {
  id: string;
  operatorId: string;
  operatorName: string;
  equipmentId: string;
  equipmentCode: string;
}

/**
 * Scheduled future use of a piece of equipment; input to the 7-day projection (rule 12).
 * Carries both statuses because deciding which ones count is a business rule, and business
 * rules belong to the domain rather than to the SQL query that fetched the rows.
 */
export interface PlannedUsage {
  date: IsoDate;
  journey: Journey;
  plannedHours: number;
  shiftStatus: ShiftStatus;
  assignmentStatus: AssignmentStatus;
}

export interface AssignmentContext {
  shift: ShiftSnapshot;
  equipment: EquipmentSnapshot;
  operator: OperatorSnapshot;
  /** every certification, unfiltered: expired ones separate "never certified" from "expired" */
  certifications: CertificationSnapshot[];
  /** assignments holding a slot; the service already filtered by ACTIVE / AT_RISK */
  activeAssignments: ExistingAssignment[];
}
