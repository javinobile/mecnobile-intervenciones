-- AlterTable
ALTER TABLE "Intervention" ADD COLUMN "cancelRequestedAt" TIMESTAMP(3),
ADD COLUMN "cancelRequestedById" TEXT;

-- CreateIndex
CREATE INDEX "Intervention_cancelRequestedById_idx" ON "Intervention"("cancelRequestedById");

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_cancelRequestedById_fkey" FOREIGN KEY ("cancelRequestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
