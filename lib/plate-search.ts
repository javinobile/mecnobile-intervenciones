import prisma from './prisma';
import { Prisma } from '../generated/prisma';
import { normalizeLicensePlate } from './utils';

/**
 * IDs de autos cuya patente, sin guiones/espacios, contiene el término normalizado.
 * Permite encontrar FAM-250 buscando FAM250 y viceversa.
 */
export async function findCarIdsByNormalizedPlateContains(
    searchTerm: string,
    take: number = 30
): Promise<string[]> {
    const normalized = normalizeLicensePlate(searchTerm);
    if (normalized.length < 2) return [];

    const pattern = `%${normalized}%`;
    const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Car"
        WHERE REPLACE(REPLACE(UPPER("licensePlate"), '-', ''), ' ', '') LIKE ${pattern}
        LIMIT ${take}
    `;
    return rows.map((r) => r.id);
}

/**
 * Busca un auto por patente exacta ignorando guiones/espacios
 * (FAM-250 === FAM250).
 */
export async function findCarIdByNormalizedPlateExact(
    plateOrNormalized: string
): Promise<string | null> {
    const normalized = normalizeLicensePlate(plateOrNormalized);
    if (!normalized) return null;

    const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Car"
        WHERE REPLACE(REPLACE(UPPER("licensePlate"), '-', ''), ' ', '') = ${normalized}
        LIMIT 1
    `;
    return rows[0]?.id ?? null;
}

/** Variante usable dentro de una transacción Prisma. */
export async function findCarIdByNormalizedPlateExactInTx(
    tx: Prisma.TransactionClient,
    plateOrNormalized: string
): Promise<string | null> {
    const normalized = normalizeLicensePlate(plateOrNormalized);
    if (!normalized) return null;

    const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Car"
        WHERE REPLACE(REPLACE(UPPER("licensePlate"), '-', ''), ' ', '') = ${normalized}
        LIMIT 1
    `;
    return rows[0]?.id ?? null;
}
