/**
 * Crea un clon de la base local para ensayar migraciones sin riesgo.
 *
 *   node scripts/clone-db.mjs
 *   DATABASE_URL="postgresql://root:Root.1234@localhost:5432/mecnobile_deploy_test?schema=public" npx prisma migrate deploy
 *
 * Ojo: corta las conexiones activas a la base origen (parar `yarn dev` antes).
 */
import { PrismaClient } from '../generated/prisma/index.js';

const SOURCE = process.env.CLONE_SOURCE ?? 'mecnobile-db';
const CLONE = process.env.CLONE_TARGET ?? 'mecnobile_deploy_test';
const ADMIN_URL = process.env.ADMIN_DATABASE_URL ?? 'postgresql://root:Root.1234@localhost:5432/postgres';

const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });

await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${CLONE}"`);
await admin.$executeRawUnsafe(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${SOURCE}' AND pid <> pg_backend_pid()`
);
await admin.$executeRawUnsafe(`CREATE DATABASE "${CLONE}" TEMPLATE "${SOURCE}"`);
console.log(`Clon creado: ${CLONE} (copia de ${SOURCE})`);

await admin.$disconnect();
