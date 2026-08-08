-- OT abierta a partir de un turno confirmado (1 a 1, opcional)
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "interventionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_interventionId_key" ON "Appointment"("interventionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Appointment_interventionId_fkey'
  ) THEN
    ALTER TABLE "Appointment"
      ADD CONSTRAINT "Appointment_interventionId_fkey"
      FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
