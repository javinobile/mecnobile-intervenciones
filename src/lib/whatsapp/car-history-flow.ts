/**
 * Solicitud de historial por WhatsApp → queda PENDIENTE hasta que un ADMIN autorice.
 */

import prisma from '../../../lib/prisma';
import { normalizeLicensePlate } from '../../../lib/utils';
import { normalizeWaId, phoneMatchKeys, phonesLikelyMatch } from './phone';
import type { StatusCar } from './ot-status';

function waLookupVariants(waId: string): string[] {
    const normalized = normalizeWaId(waId) || waId;
    const keys = new Set<string>([normalized, waId, ...phoneMatchKeys(waId)]);
    if (normalized.startsWith('549')) keys.add(`54${normalized.slice(3)}`);
    if (normalized.startsWith('54') && !normalized.startsWith('549')) {
        keys.add(`549${normalized.slice(2)}`);
    }
    return Array.from(keys).filter(Boolean);
}

/**
 * Autos asociados a este WhatsApp (dueño actual, OT del cliente, turnos).
 * Si `onlyWithHistory`, deja solo los que tienen OT ABIERTA/CERRADA.
 */
export async function findCarsForWhatsApp(
    waId: string,
    opts: { onlyWithHistory?: boolean } = { onlyWithHistory: true }
): Promise<StatusCar[]> {
    const variants = waLookupVariants(waId);
    if (!variants.length) return [];

    const clients = await prisma.client.findMany({
        where: { phone: { not: null } },
        select: { id: true, phone: true },
    });
    const clientIds = clients.filter((c) => phonesLikelyMatch(c.phone, waId)).map((c) => c.id);

    const carIds = new Set<string>();

    if (clientIds.length) {
        const owned = await prisma.carOwnership.findMany({
            where: { clientId: { in: clientIds }, endDate: null },
            select: { carId: true },
        });
        for (const o of owned) carIds.add(o.carId);

        const byClientOt = await prisma.intervention.findMany({
            where: {
                clientId: { in: clientIds },
                status: { in: ['CERRADA', 'ABIERTA'] },
            },
            select: { carId: true },
        });
        for (const ot of byClientOt) carIds.add(ot.carId);
    }

    const appointments = await prisma.appointment.findMany({
        where: {
            OR: [
                { whatsappWaId: { in: variants } },
                { clientPhone: { in: variants } },
            ],
        },
        select: { carId: true, licensePlate: true },
        take: 80,
    });

    for (const ap of appointments) {
        if (ap.carId) {
            carIds.add(ap.carId);
            continue;
        }
        if (!ap.licensePlate) continue;
        const normalized = normalizeLicensePlate(ap.licensePlate);
        const rows = await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM "Car"
            WHERE REPLACE(REPLACE(UPPER("licensePlate"), '-', ''), ' ', '') = ${normalized}
            LIMIT 1
        `;
        if (rows[0]) carIds.add(rows[0].id);
    }

    if (!carIds.size) return [];

    const ids = Array.from(carIds);

    if (opts.onlyWithHistory) {
        const withHistory = await prisma.intervention.findMany({
            where: {
                carId: { in: ids },
                status: { in: ['CERRADA', 'ABIERTA'] },
            },
            select: {
                car: {
                    select: { id: true, licensePlate: true, make: true, model: true },
                },
            },
            distinct: ['carId'],
        });

        const byId = new Map<string, StatusCar>();
        for (const row of withHistory) {
            byId.set(row.car.id, row.car);
        }

        return Array.from(byId.values()).sort((a, b) =>
            a.licensePlate.localeCompare(b.licensePlate, 'es')
        );
    }

    const cars = await prisma.car.findMany({
        where: { id: { in: ids } },
        select: { id: true, licensePlate: true, make: true, model: true },
    });

    return cars.sort((a, b) => a.licensePlate.localeCompare(b.licensePlate, 'es'));
}

/** Autos del WhatsApp con al menos una OT no cancelada (historial útil). */
export async function findCarsWithHistoryForWhatsApp(waId: string): Promise<StatusCar[]> {
    return findCarsForWhatsApp(waId, { onlyWithHistory: true });
}

export function isValidEmail(raw: string): boolean {
    const email = raw.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function createPendingHistoryRequest(opts: {
    waId: string;
    carId: string;
    email: string;
}): Promise<{ ok: true; plate: string } | { ok: false; message: string }> {
    const email = opts.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
        return { ok: false, message: 'El email no parece válido.' };
    }

    const car = await prisma.car.findUnique({
        where: { id: opts.carId },
        select: {
            id: true,
            licensePlate: true,
            ownershipHistory: {
                where: { endDate: null },
                take: 1,
                select: { clientId: true },
            },
            interventions: {
                where: { status: { in: ['CERRADA', 'ABIERTA'] } },
                take: 1,
                select: { id: true },
            },
        },
    });

    if (!car) {
        return { ok: false, message: 'No encontramos ese vehículo.' };
    }
    if (car.interventions.length === 0) {
        return { ok: false, message: 'Ese vehículo no tiene historial de taller para emitir.' };
    }

    const pendingSame = await prisma.carHistoryRequest.findFirst({
        where: {
            carId: car.id,
            whatsappWaId: { in: waLookupVariants(opts.waId) },
            status: 'PENDIENTE',
        },
        select: { id: true },
    });
    if (pendingSame) {
        return {
            ok: false,
            message:
                'Ya tenés una solicitud *pendiente* de autorización para este auto. El taller te va a avisar.',
        };
    }

    const clientId = car.ownershipHistory[0]?.clientId ?? null;

    await prisma.carHistoryRequest.create({
        data: {
            carId: car.id,
            clientId,
            whatsappWaId: opts.waId,
            email,
            status: 'PENDIENTE',
        },
    });

    return { ok: true, plate: car.licensePlate };
}
