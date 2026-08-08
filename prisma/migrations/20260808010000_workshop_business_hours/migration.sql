-- Días y horarios de atención del taller (usados para validar turnos)
ALTER TABLE "WorkshopSettings"
  ADD COLUMN IF NOT EXISTS "worksSaturday" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "worksSunday" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "openingTime" TEXT NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS "closingTime" TEXT NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS "saturdayOpeningTime" TEXT NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS "saturdayClosingTime" TEXT NOT NULL DEFAULT '13:00';
