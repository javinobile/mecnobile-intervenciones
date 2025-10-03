/*
  Warnings:

  - A unique constraint covering the columns `[dni]` on the table `Client` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `dni` to the `Client` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "dni" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Client_dni_key" ON "Client"("dni");
