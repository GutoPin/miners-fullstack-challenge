-- Invariantes que no dependen de la aplicación (docs/MODELO-DATOS.md §3).
-- Prisma no genera CHECK constraints: esta migración va escrita a mano.

-- Un horómetro es un acumulado: nunca es negativo.
ALTER TABLE "equipment"
  ADD CONSTRAINT "chk_hours_positive" CHECK ("currentHours" >= 0);

-- Un turno no puede durar 0 ni más de un día.
ALTER TABLE "shifts"
  ADD CONSTRAINT "chk_planned_hours" CHECK ("plannedHours" > 0 AND "plannedHours" <= 24);

-- Las horas reales son opcionales hasta el cierre, pero si existen están acotadas.
ALTER TABLE "assignments"
  ADD CONSTRAINT "chk_actual_hours"
  CHECK ("actualHours" IS NULL OR ("actualHours" > 0 AND "actualHours" <= 24));
