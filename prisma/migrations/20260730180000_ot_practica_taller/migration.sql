-- CreateEnum
CREATE TYPE "InterventionItemType" AS ENUM ('REPUESTO', 'MANO_DE_OBRA', 'TRABAJO_TERCERO');

-- CreateTable
CREATE TABLE "InterventionItem" (
    "id" TEXT NOT NULL,
    "interventionId" TEXT NOT NULL,
    "type" "InterventionItemType" NOT NULL,
    "description" TEXT NOT NULL,
    "hours" DECIMAL(8,2),
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterventionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "hourlyRate" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkshopSettings_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add nullable clientId first
ALTER TABLE "Intervention" ADD COLUMN "clientId" TEXT;

-- Backfill clientId from ownership at dateOfIntervention, fallback to current owner
UPDATE "Intervention" i
SET "clientId" = sub."clientId"
FROM (
  SELECT DISTINCT ON (i2.id)
    i2.id AS intervention_id,
    co."clientId"
  FROM "Intervention" i2
  JOIN "CarOwnership" co ON co."carId" = i2."carId"
  WHERE co."startDate" <= i2."dateOfIntervention"
    AND (co."endDate" IS NULL OR co."endDate" > i2."dateOfIntervention")
  ORDER BY i2.id, co."startDate" DESC
) sub
WHERE i.id = sub.intervention_id
  AND i."clientId" IS NULL;

-- Fallback: current owner (endDate null)
UPDATE "Intervention" i
SET "clientId" = co."clientId"
FROM "CarOwnership" co
WHERE i."clientId" IS NULL
  AND co."carId" = i."carId"
  AND co."endDate" IS NULL;

-- If any remain without owner, attach to first client if exists (safety)
UPDATE "Intervention"
SET "clientId" = (SELECT id FROM "Client" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "clientId" IS NULL
  AND EXISTS (SELECT 1 FROM "Client");

-- Make clientId required (only if all rows have values)
ALTER TABLE "Intervention" ALTER COLUMN "clientId" SET NOT NULL;

-- Indexes and FKs
CREATE INDEX "Intervention_clientId_idx" ON "Intervention"("clientId");
CREATE INDEX "InterventionItem_interventionId_idx" ON "InterventionItem"("interventionId");

ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterventionItem" ADD CONSTRAINT "InterventionItem_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default workshop settings
INSERT INTO "WorkshopSettings" ("id", "hourlyRate", "updatedAt", "createdAt")
VALUES ('default', 0.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
