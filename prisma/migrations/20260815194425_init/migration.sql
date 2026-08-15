-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('AVAILABLE', 'BLOCKED', 'IN_MAINTENANCE', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "ShiftJourney" AS ENUM ('DAY', 'NIGHT');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('PLANNED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'AT_RISK', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "HourmeterSource" AS ENUM ('SHIFT_CLOSE', 'MAINTENANCE', 'MANUAL_ADJUSTMENT', 'INITIAL_LOAD');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('MAINTENANCE_DUE_SOON', 'ASSIGNMENT_AT_RISK', 'CERT_EXPIRING_BEFORE_SHIFT', 'OVERRIDE_USED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERVISOR', 'PLANNER', 'VIEWER');

-- CreateTable
CREATE TABLE "equipment_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maintenanceIntervalHours" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "currentHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'AVAILABLE',
    "nextMaintenanceHours" DECIMAL(10,2) NOT NULL,
    "maintenanceIntervalOverride" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operators" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certifications" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "equipmentTypeId" TEXT NOT NULL,
    "issuedAt" DATE NOT NULL,
    "expiresAt" DATE NOT NULL,
    "documentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "journey" "ShiftJourney" NOT NULL,
    "plannedHours" DECIMAL(5,2) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'PLANNED',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "plannedHours" DECIMAL(5,2) NOT NULL,
    "actualHours" DECIMAL(5,2),
    "varianceNote" TEXT,
    "riskReason" TEXT,
    "activeSlot" INTEGER DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_overrides" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "authorizedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "violatedRules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "hoursAtService" DECIMAL(10,2) NOT NULL,
    "thresholdHours" DECIMAL(10,2) NOT NULL,
    "overdueHours" DECIMAL(10,2) NOT NULL,
    "nextThresholdHours" DECIMAL(10,2) NOT NULL,
    "responsible" TEXT NOT NULL,
    "notes" TEXT,
    "registeredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hourmeter_entries" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "source" "HourmeterSource" NOT NULL,
    "referenceId" TEXT,
    "hoursBefore" DECIMAL(10,2) NOT NULL,
    "hoursDelta" DECIMAL(10,2) NOT NULL,
    "hoursAfter" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hourmeter_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "equipmentId" TEXT,
    "assignmentId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "equipment_types_code_key" ON "equipment_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_code_key" ON "equipment"("code");

-- CreateIndex
CREATE INDEX "equipment_status_idx" ON "equipment"("status");

-- CreateIndex
CREATE INDEX "equipment_typeId_idx" ON "equipment"("typeId");

-- CreateIndex
CREATE UNIQUE INDEX "operators_code_key" ON "operators"("code");

-- CreateIndex
CREATE UNIQUE INDEX "operators_document_key" ON "operators"("document");

-- CreateIndex
CREATE INDEX "certifications_operatorId_equipmentTypeId_expiresAt_idx" ON "certifications"("operatorId", "equipmentTypeId", "expiresAt");

-- CreateIndex
CREATE INDEX "shifts_status_date_idx" ON "shifts"("status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_date_journey_key" ON "shifts"("date", "journey");

-- CreateIndex
CREATE INDEX "assignments_equipmentId_status_idx" ON "assignments"("equipmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_shiftId_equipmentId_activeSlot_key" ON "assignments"("shiftId", "equipmentId", "activeSlot");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_shiftId_operatorId_activeSlot_key" ON "assignments"("shiftId", "operatorId", "activeSlot");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_overrides_assignmentId_key" ON "assignment_overrides"("assignmentId");

-- CreateIndex
CREATE INDEX "maintenance_records_equipmentId_performedAt_idx" ON "maintenance_records"("equipmentId", "performedAt");

-- CreateIndex
CREATE INDEX "hourmeter_entries_equipmentId_createdAt_idx" ON "hourmeter_entries"("equipmentId", "createdAt");

-- CreateIndex
CREATE INDEX "alerts_resolvedAt_severity_idx" ON "alerts"("resolvedAt", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "equipment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_equipmentTypeId_fkey" FOREIGN KEY ("equipmentTypeId") REFERENCES "equipment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_overrides" ADD CONSTRAINT "assignment_overrides_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_overrides" ADD CONSTRAINT "assignment_overrides_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hourmeter_entries" ADD CONSTRAINT "hourmeter_entries_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
