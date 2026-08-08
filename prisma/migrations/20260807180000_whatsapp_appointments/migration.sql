-- AlterEnum
ALTER TYPE "AppointmentStatus" ADD VALUE 'PROPUESTA_ENVIADA';

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('MANUAL', 'WHATSAPP');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "source" "AppointmentSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Appointment" ADD COLUMN "whatsappWaId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "proposedSlots" JSONB;

-- CreateIndex
CREATE INDEX "Appointment_status_startsAt_idx" ON "Appointment"("status", "startsAt");
CREATE INDEX "Appointment_whatsappWaId_idx" ON "Appointment"("whatsappWaId");

-- CreateTable
CREATE TABLE "WhatsAppConversation" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "step" TEXT NOT NULL DEFAULT 'IDLE',
    "draftName" TEXT,
    "draftNotes" TEXT,
    "draftStartsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConversation_waId_key" ON "WhatsAppConversation"("waId");
