-- Turnos: estado CANCELADO (no se borran más desde WhatsApp) y datos de la cancelación
ALTER TYPE "AppointmentStatus" ADD VALUE 'CANCELADO';

ALTER TABLE "Appointment"
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD COLUMN "canceledBy" TEXT;

-- Conversación del bot: nota de dominio dudoso, dato auxiliar y contador de "no entendí"
ALTER TABLE "WhatsAppConversation"
  ADD COLUMN "draftPlateNote" TEXT,
  ADD COLUMN "draftExtra" TEXT,
  ADD COLUMN "unknownCount" INTEGER NOT NULL DEFAULT 0;
