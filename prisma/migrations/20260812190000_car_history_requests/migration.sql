-- CreateEnum
CREATE TYPE "CarHistoryRequestStatus" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'ENVIADA');

-- CreateTable
CREATE TABLE "CarHistoryRequest" (
    "id" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "clientId" TEXT,
    "whatsappWaId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "CarHistoryRequestStatus" NOT NULL DEFAULT 'PENDIENTE',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarHistoryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CarHistoryRequest_status_createdAt_idx" ON "CarHistoryRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CarHistoryRequest_carId_idx" ON "CarHistoryRequest"("carId");

-- CreateIndex
CREATE INDEX "CarHistoryRequest_whatsappWaId_idx" ON "CarHistoryRequest"("whatsappWaId");

-- AddForeignKey
ALTER TABLE "CarHistoryRequest" ADD CONSTRAINT "CarHistoryRequest_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarHistoryRequest" ADD CONSTRAINT "CarHistoryRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarHistoryRequest" ADD CONSTRAINT "CarHistoryRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
