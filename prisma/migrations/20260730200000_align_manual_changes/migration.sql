-- Alinea la base con el historial de migraciones. Todo esto se había hecho a mano
-- durante la importación del sistema legacy, por lo que Prisma lo reportaba como
-- drift y `migrate dev` pedía resetear la base.
-- El SQL es idempotente: se puede aplicar sobre una base ya alineada.

-- 1. Tablas de staging de la importación (los datos ya están en "Client"/"Car")
DROP TABLE IF EXISTS "TempAutomoviles";
DROP TABLE IF EXISTS "TempPropietarios";

-- 2. Los ids los genera Prisma con @default(uuid()), no la base
ALTER TABLE "Car" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "Client" ALTER COLUMN "id" DROP DEFAULT;

-- 3. La única (firstName, lastName, phone) se había neutralizado a mano agregándole
-- "id" al índice, porque el padrón legacy tiene homónimos. Se elimina: la unicidad
-- del cliente es el DNI.
DROP INDEX IF EXISTS "Client_firstName_lastName_phone_key";
