-- AlterTable Appointment: dominio + auto opcional
ALTER TABLE "Appointment" ADD COLUMN "licensePlate" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "carId" TEXT;

-- CreateIndex
CREATE INDEX "Appointment_carId_idx" ON "Appointment"("carId");
CREATE INDEX "Appointment_licensePlate_idx" ON "Appointment"("licensePlate");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WhatsAppConversation: drafts para avería/dominio
ALTER TABLE "WhatsAppConversation" ADD COLUMN "draftIssue" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "draftPlate" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "draftCarId" TEXT;

-- draftNotes ya no se usa en el nuevo FSM; se deja por compatibilidad si existía
ALTER TABLE "WhatsAppConversation" DROP COLUMN IF EXISTS "draftNotes";
