-- CreateEnum
CREATE TYPE "ServiceCheckStatus" AS ENUM ('REVISADO', 'CAMBIADO');

-- AlterTable
ALTER TABLE "Intervention" ADD COLUMN     "isService" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ServiceChecklistItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterventionServiceCheck" (
    "id" TEXT NOT NULL,
    "interventionId" TEXT NOT NULL,
    "checklistItemId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "ServiceCheckStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterventionServiceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceChecklistItem_name_key" ON "ServiceChecklistItem"("name");

-- CreateIndex
CREATE INDEX "InterventionServiceCheck_interventionId_idx" ON "InterventionServiceCheck"("interventionId");

-- CreateIndex
CREATE UNIQUE INDEX "InterventionServiceCheck_interventionId_checklistItemId_key" ON "InterventionServiceCheck"("interventionId", "checklistItemId");

-- CreateIndex
CREATE INDEX "Intervention_isService_idx" ON "Intervention"("isService");

-- AddForeignKey
ALTER TABLE "InterventionServiceCheck" ADD CONSTRAINT "InterventionServiceCheck_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionServiceCheck" ADD CONSTRAINT "InterventionServiceCheck_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "ServiceChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Lista inicial del checklist de service (SPEC 02).
-- Se inserta acá y no en db:seed para que producción la reciba con `prisma migrate deploy`.
INSERT INTO "ServiceChecklistItem" ("id", "name", "sortOrder", "active", "createdAt", "updatedAt") VALUES
    (gen_random_uuid()::text, 'Aceite de motor',             10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Filtro de aceite',            20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Filtro de aire',              30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Filtro de habitáculo',        40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Filtro de combustible',       50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Aceite de caja',              60, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Líquido refrigerante',        70, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Líquido de frenos',           80, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Bujías',                      90, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Correa de distribución',     100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Correa de accesorios',       110, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Pastillas y discos de freno', 120, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Neumáticos y presión',       130, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Batería',                    140, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Luces',                      150, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'Escobillas',                 160, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
