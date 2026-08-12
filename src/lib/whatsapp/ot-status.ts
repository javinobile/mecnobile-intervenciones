/**
 * Consulta de estado de OT por WhatsApp:
 * teléfono → solo autos con OT ABIERTA → (si hay varios) pedir dominio → reporte.
 */

import prisma from '../../../lib/prisma';
import { normalizeLicensePlate } from '../../../lib/utils';
import { rewriteOtStatusColloquial, type OtStatusFacts } from '@/lib/ai/groq-client';
import {
    formatDateTimeEsAr,
    normalizeWaId,
    phoneMatchKeys,
    phonesLikelyMatch,
} from './phone';

export type StatusCar = {
    id: string;
    licensePlate: string;
    make: string | null;
    model: string | null;
};

/** Re-export: match de teléfonos AR (15… ↔ 549…). */
export { phoneMatchKeys, phonesLikelyMatch };

function carLabel(car: Pick<StatusCar, 'licensePlate' | 'make' | 'model'>): string {
    const mm = [car.make, car.model].filter(Boolean).join(' ').trim();
    return mm ? `${mm} (${car.licensePlate})` : car.licensePlate;
}

function waLookupVariants(waId: string): string[] {
    const normalized = normalizeWaId(waId) || waId;
    const keys = new Set<string>([normalized, waId, ...phoneMatchKeys(waId)]);
    if (normalized.startsWith('549')) keys.add(`54${normalized.slice(3)}`);
    if (normalized.startsWith('54') && !normalized.startsWith('549')) {
        keys.add(`549${normalized.slice(2)}`);
    }
    return Array.from(keys).filter(Boolean);
}

const ITEM_TYPE_LABEL: Record<string, string> = {
    REPUESTO: 'Repuesto',
    MANO_DE_OBRA: 'Mano de obra',
    TRABAJO_TERCERO: 'Trabajo de tercero',
};

/**
 * Autos del WhatsApp que tienen al menos una OT ABIERTA.
 * Si el dueño tiene varios vehículos sin OT, se ignoran.
 */
export async function findCarsWithOpenOtForWhatsApp(waId: string): Promise<StatusCar[]> {
    const variants = waLookupVariants(waId);
    if (!variants.length) return [];

    const clients = await prisma.client.findMany({
        where: { phone: { not: null } },
        select: {
            id: true,
            phone: true,
        },
    });

    const clientIds = clients.filter((c) => phonesLikelyMatch(c.phone, waId)).map((c) => c.id);

    const carIds = new Set<string>();

    if (clientIds.length) {
        const owned = await prisma.carOwnership.findMany({
            where: { clientId: { in: clientIds }, endDate: null },
            select: { carId: true },
        });
        for (const o of owned) carIds.add(o.carId);

        // OT abierta a nombre de ese cliente (aunque el auto haya cambiado de dueño en el padrón)
        const byClientOt = await prisma.intervention.findMany({
            where: { status: 'ABIERTA', clientId: { in: clientIds } },
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
        select: {
            licensePlate: true,
            carId: true,
        },
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

    const open = await prisma.intervention.findMany({
        where: {
            status: 'ABIERTA',
            carId: { in: Array.from(carIds) },
        },
        select: {
            car: {
                select: {
                    id: true,
                    licensePlate: true,
                    make: true,
                    model: true,
                },
            },
        },
        distinct: ['carId'],
        orderBy: { dateOfIntervention: 'desc' },
    });

    const byId = new Map<string, StatusCar>();
    for (const row of open) {
        byId.set(row.car.id, row.car);
    }

    return Array.from(byId.values()).sort((a, b) =>
        a.licensePlate.localeCompare(b.licensePlate, 'es')
    );
}

export async function findOpenInterventionForCar(carId: string) {
    return prisma.intervention.findFirst({
        where: { carId, status: 'ABIERTA' },
        orderBy: { dateOfIntervention: 'desc' },
        select: {
            otNumber: true,
            description: true,
            notes: true,
            dateOfIntervention: true,
            estimatedReadyAt: true,
            client: { select: { firstName: true } },
            car: {
                select: {
                    licensePlate: true,
                    make: true,
                    model: true,
                },
            },
            items: {
                orderBy: { sortOrder: 'asc' },
                select: { description: true, type: true },
            },
        },
    });
}

function buildTemplateStatus(facts: OtStatusFacts): string {
    const hi = facts.clientFirstName ? `Hola ${facts.clientFirstName}` : 'Hola';
    const progressLines: string[] = [];

    if (facts.description.trim()) {
        progressLines.push(`Ingreso: ${facts.description.trim()}`);
    }
    for (const item of facts.items) {
        const tipo = ITEM_TYPE_LABEL[item.type] || item.type;
        progressLines.push(`${tipo}: ${item.description}`);
    }
    if (facts.notes?.trim()) {
        progressLines.push(`Nota del taller: ${facts.notes.trim()}`);
    }

    const progress =
        progressLines.length > 0
            ? progressLines.map((l) => `• ${l}`).join('\n')
            : '• Todavía no hay detalle de trabajos cargados en la OT.';

    const eta = facts.estimatedReadyAtLabel
        ? `Estimamos entrega *${facts.estimatedReadyAtLabel}*.`
        : `Todavía *no hay horario de entrega confirmado*; te avisamos por este chat cuando lo tengamos.`;

    return (
        `${hi}, te cuento cómo va tu *${facts.carLabel}* (OT #${facts.otNumber}, desde ${facts.openedAtLabel}):\n\n` +
        `${progress}\n\n` +
        `${eta}`
    );
}

function toFacts(
    ot: NonNullable<Awaited<ReturnType<typeof findOpenInterventionForCar>>>
): OtStatusFacts {
    return {
        clientFirstName: ot.client.firstName || null,
        licensePlate: ot.car.licensePlate,
        carLabel: carLabel(ot.car),
        otNumber: ot.otNumber,
        description: ot.description,
        notes: ot.notes,
        openedAtLabel: formatDateTimeEsAr(ot.dateOfIntervention).fecha,
        items: ot.items.map((i) => ({
            type: i.type,
            description: i.description,
        })),
        estimatedReadyAtLabel: ot.estimatedReadyAt
            ? formatDateTimeEsAr(ot.estimatedReadyAt).full
            : null,
    };
}

/** Arma el mensaje de estado (Groq si está configurado; si no / si falla, plantilla). */
export async function buildOtStatusReply(car: StatusCar): Promise<string> {
    const ot = await findOpenInterventionForCar(car.id);
    if (!ot) {
        return (
            `Para el dominio *${car.licensePlate}* *no hay una OT abierta* ahora.\n` +
            `Si acabás de dejar el auto, puede que todavía no lo hayan cargado.\n\n` +
            `Escribí *ayuda* para ver opciones.`
        );
    }

    const facts = toFacts(ot);
    const ai = await rewriteOtStatusColloquial(facts);
    if (ai) return ai;
    return buildTemplateStatus(facts);
}

export function formatCarChoiceList(cars: StatusCar[]): string {
    return cars
        .map((c, i) => {
            const mm = [c.make, c.model].filter(Boolean).join(' ');
            return `${i + 1}) *${c.licensePlate}*${mm ? ` — ${mm}` : ''}`;
        })
        .join('\n');
}

export { formatDateTimeEsAr };
