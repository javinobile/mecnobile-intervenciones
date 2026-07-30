/**
 * Corrige el checksum guardado en "_prisma_migrations" cuando un archivo de
 * migración ya aplicado fue editado después. No toca el esquema ni los datos:
 * solo sincroniza el hash para que `prisma migrate dev` deje de pedir un reset.
 *
 *   node scripts/fix-migration-checksums.mjs            # solo informa
 *   node scripts/fix-migration-checksums.mjs --apply    # corrige
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../generated/prisma/index.js';

const APPLY = process.argv.includes('--apply');
const MIGRATIONS_DIR = 'prisma/migrations';

const p = new PrismaClient();

const applied = await p.$queryRawUnsafe(
    `select migration_name, checksum from "_prisma_migrations" order by started_at`
);

let mismatches = 0;

for (const row of applied) {
    const file = join(MIGRATIONS_DIR, row.migration_name, 'migration.sql');
    if (!existsSync(file)) {
        console.log(`? ${row.migration_name}: aplicada en la base pero el archivo no existe`);
        continue;
    }
    const real = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (real === row.checksum) continue;

    mismatches++;
    console.log(`! ${row.migration_name}`);
    console.log(`    base:    ${row.checksum}`);
    console.log(`    archivo: ${real}`);

    if (APPLY) {
        await p.$executeRawUnsafe(
            `update "_prisma_migrations" set checksum = $1 where migration_name = $2`,
            real,
            row.migration_name
        );
        console.log('    -> corregido');
    }
}

const known = new Set(applied.map((r) => r.migration_name));
const pending = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !known.has(d.name))
    .map((d) => d.name);

if (pending.length) console.log('Pendientes de aplicar:', pending.join(', '));
if (!mismatches) console.log('Todos los checksums coinciden.');
else if (!APPLY) console.log(`\n${mismatches} desajuste(s). Corré con --apply para corregir.`);

await p.$disconnect();
