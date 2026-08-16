/**
 * Tipos de entrada del motor de reglas.
 *
 * Objetos planos: el dominio no conoce Prisma ni Next (docs/ARQUITECTURA.md §1).
 * Los `Decimal` del esquema llegan aquí como `number` y las fechas puras como `IsoDate`;
 * la conversión la hace el servicio que arma el snapshot.
 */

/** Fecha de calendario sin hora, `'YYYY-MM-DD'`. Se compara como texto: '2026-08-10' < '2026-08-18'. */
export type IsoDate = string;

// Espejo de los enums del esquema. Se declaran aquí para no importar el cliente de Prisma
// en el dominio; el compilador avisa si el esquema y estas uniones se desalinean.
export type Journey = 'DAY' | 'NIGHT';
export type EquipmentStatus = 'AVAILABLE' | 'BLOCKED' | 'IN_MAINTENANCE' | 'OUT_OF_SERVICE';
export type ShiftStatus = 'PLANNED' | 'CLOSED' | 'CANCELLED';
export type AssignmentStatus = 'ACTIVE' | 'AT_RISK' | 'CANCELLED' | 'COMPLETED';

export interface EquipmentSnapshot {
  id: string;
  code: string; // 'CAM-003', para los mensajes
  typeId: string; // se cruza con Certification.equipmentTypeId
  typeName: string; // 'Camión de acarreo', para los mensajes
  status: EquipmentStatus;
  currentHours: number;
  nextMaintenanceHours: number; // umbral absoluto que dispara el bloqueo
}

export interface ShiftSnapshot {
  id: string;
  date: IsoDate; // fecha operativa del turno
  /**
   * Fecha de calendario en la que termina el turno (en America/Lima).
   * Igual a `date` en el turno DÍA; `date + 1` cuando el turno NOCHE cruza medianoche.
   * Con esto la vigencia de una certificación se evalúa sin aritmética de zona horaria.
   */
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
  expiresAt: IsoDate; // vigente hasta el final de ese día, inclusive
}

/** Otra asignación que ya ocupa cupo en el mismo turno (reglas 6 y 7). */
export interface ExistingAssignment {
  id: string;
  operatorId: string;
  operatorName: string;
  equipmentId: string;
  equipmentCode: string;
}

/**
 * Uso futuro ya programado de un equipo: una asignación suya en un turno.
 * Entrada de la proyección de 7 días (regla 12).
 *
 * Llega con el estado del turno y de la asignación porque decidir cuáles cuentan
 * ("solo turnos PLANNED con asignaciones ACTIVE o AT_RISK") es regla de negocio, y las
 * reglas se deciden en el dominio, no en la consulta SQL que trae los datos.
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
  /**
   * Todas las certificaciones del operador, de cualquier tipo de equipo y sin filtrar
   * por vigencia. El dominio necesita ver las vencidas para distinguir "nunca tuvo
   * certificación" de "la tiene vencida", y las renovaciones para quedarse con la de
   * mayor `expiresAt`.
   */
  certifications: CertificationSnapshot[];
  /**
   * Asignaciones del turno que ocupan cupo: el servicio ya filtró por estado
   * `ACTIVE` / `AT_RISK`. Las canceladas no entran (no ocupan `activeSlot`).
   */
  activeAssignments: ExistingAssignment[];
}
