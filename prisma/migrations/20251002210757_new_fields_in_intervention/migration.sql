/*
  Warnings:

  - Added the required column `otNumber` to the `Intervention` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Intervention" ADD COLUMN     "otNumber" INTEGER NOT NULL;
