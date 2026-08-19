import prisma from './prisma';
import { findCarIdByNormalizedPlateExact } from './plate-search';
import { normalizeLicensePlate, validateNewLicensePlate } from './utils';

const MERCOSUR_RE = /^[A-Z]{2}\d{3}[A-Z]{2}$/;

export type FuzzyPlateMatch = {
    carId: string;
    storedPlate: string;
    make: string | null;
    model: string | null;
    ownerName: string | null;
    score: number;
    reason: 'migration' | 'similar_digits';
};

/**
 * Patrón de migración del sistema viejo: Mercosur AA###BB se guardó como AAA###
 * usando la primera letra del sufijo como tercera letra.
 * Ej: AF206WN → AFW206 (AF + W + 206)
 */
export function legacyPlateFromMercosurMigration(mercosurNormalized: string): string | null {
    if (!MERCOSUR_RE.test(mercosurNormalized)) return null;
    return (
        mercosurNormalized.slice(0, 2) +
        mercosurNormalized.slice(5, 6) +
        mercosurNormalized.slice(2, 5)
    );
}

async function fetchCarMatchDetails(carId: string): Promise<Omit<FuzzyPlateMatch, 'score' | 'reason'> | null> {
    const car = await prisma.car.findUnique({
        where: { id: carId },
        select: {
            id: true,
            licensePlate: true,
            make: true,
            model: true,
            ownershipHistory: {
                where: { endDate: null },
                take: 1,
                orderBy: { startDate: 'desc' },
                select: {
                    client: { select: { firstName: true, lastName: true } },
                },
            },
        },
    });
    if (!car) return null;

    const owner = car.ownershipHistory[0]?.client;
    const ownerName = owner
        ? `${owner.firstName} ${owner.lastName}`.trim() || null
        : null;

    return {
        carId: car.id,
        storedPlate: car.licensePlate,
        make: car.make,
        model: car.model,
        ownerName,
    };
}

/**
 * Busca vehículos cuya patente migrada del sistema viejo podría corresponder
 * a la patente ingresada (Mercosur o similar).
 */
export async function findFuzzyPlateMatches(
    inputPlate: string,
    limit = 5
): Promise<FuzzyPlateMatch[]> {
    const normalized = normalizeLicensePlate(inputPlate);
    if (normalized.length < 6) return [];

    const seen = new Set<string>();
    const matches: FuzzyPlateMatch[] = [];

    const pushMatch = async (
        carId: string,
        score: number,
        reason: FuzzyPlateMatch['reason']
    ) => {
        if (seen.has(carId)) return;
        seen.add(carId);
        const details = await fetchCarMatchDetails(carId);
        if (!details) return;
        matches.push({ ...details, score, reason });
    };

    const legacyCandidate = legacyPlateFromMercosurMigration(normalized);
    if (legacyCandidate) {
        const carId = await findCarIdByNormalizedPlateExact(legacyCandidate);
        if (carId) await pushMatch(carId, 100, 'migration');
    }

    const digitMatch = normalized.match(/(\d{3})/);
    if (digitMatch) {
        const digits = digitMatch[1];
        const prefix = normalized.slice(0, 2);
        const pattern = `%${digits}%`;

        const rows = await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM "Car"
            WHERE REPLACE(REPLACE(UPPER("licensePlate"), '-', ''), ' ', '') LIKE ${pattern}
              AND LENGTH(REPLACE(REPLACE(UPPER("licensePlate"), '-', ''), ' ', '')) = 6
              AND LEFT(REPLACE(REPLACE(UPPER("licensePlate"), '-', ''), ' ', ''), 2) = ${prefix}
            LIMIT ${limit}
        `;

        for (const row of rows) {
            await pushMatch(row.id, legacyCandidate ? 90 : 70, 'similar_digits');
        }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, limit);
}

/** Corrige la patente del vehículo al formato nuevo confirmado por el cliente. */
export async function updateCarLicensePlateCorrected(
    carId: string,
    newPlate: string
): Promise<{ ok: true } | { ok: false; message: string }> {
    const validation = validateNewLicensePlate(newPlate);
    if (!validation.ok || !validation.plate) {
        return { ok: false, message: validation.message || 'Patente inválida.' };
    }

    const plate = validation.plate;
    const existingId = await findCarIdByNormalizedPlateExact(plate);
    if (existingId && existingId !== carId) {
        return {
            ok: false,
            message: 'Ya existe otro vehículo con esa patente en el sistema.',
        };
    }

    await prisma.car.update({
        where: { id: carId },
        data: { licensePlate: plate },
    });

    return { ok: true };
}

export function formatFuzzyPlateMatchLine(index: number, match: FuzzyPlateMatch): string {
    const vehicle = [match.make, match.model].filter(Boolean).join(' ') || 'Vehículo';
    const owner = match.ownerName ? ` — ${match.ownerName}` : '';
    return `${index + 1}) *${match.storedPlate}* — ${vehicle}${owner}`;
}
