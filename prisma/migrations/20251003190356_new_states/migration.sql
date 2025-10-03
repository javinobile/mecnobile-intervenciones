/*
  Warnings:

  - The values [COMPLETED,PENDING_PAYMENT,CANCELLED] on the enum `InterventionStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "InterventionStatus_new" AS ENUM ('CERRADA', 'ABIERTA', 'CANCELADA');
ALTER TABLE "public"."Intervention" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Intervention" ALTER COLUMN "status" TYPE "InterventionStatus_new" USING ("status"::text::"InterventionStatus_new");
ALTER TYPE "InterventionStatus" RENAME TO "InterventionStatus_old";
ALTER TYPE "InterventionStatus_new" RENAME TO "InterventionStatus";
DROP TYPE "public"."InterventionStatus_old";
ALTER TABLE "Intervention" ALTER COLUMN "status" SET DEFAULT 'ABIERTA';
COMMIT;

-- AlterTable
ALTER TABLE "Intervention" ALTER COLUMN "status" SET DEFAULT 'ABIERTA';
