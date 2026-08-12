'use server'

import { authOptions } from "@/auth";
import { getServerSession } from "next-auth";
import {
    InterventionItemType,
    InterventionStatus,
    Prisma,
} from "../../generated/prisma";
import prisma from "../../lib/prisma";
import { normalizeLicensePlate, validateNewLicensePlate } from "../../lib/utils";
import {
    findCarIdsByNormalizedPlateContains,
    findCarIdByNormalizedPlateExact,
    findCarIdByNormalizedPlateExactInTx,
} from "../../lib/plate-search";
import { revalidatePath } from "next/cache";
import { renderToBuffer } from "@react-pdf/renderer";
import { OtComprobantePdf, PdfData } from '@/components/interventions/OtComprbantePdf';
import { Decimal } from "../../generated/prisma/runtime/library";
import { getLogoBase64 } from '@/lib/pdf-logo';

export interface InterventionListItem {
    id: string;
    otNumber: number;
    status: InterventionStatus;
    /** Estado real en DB */
    cancelRequested: boolean;
    /** Etiqueta a mostrar según el rol del usuario */
    displayStatus: 'ABIERTA' | 'CERRADA' | 'CANCELADA' | 'PENDIENTE_CANCELACION';
    dateOfIntervention: Date;
    description: string;
    carPlate: string;
    carMakeModel: string;
    ownerName: string;
    performedByName: string;
    cost: number;
}

interface ServerActionResponse {
    success: boolean;
    message: string;
    intervention?: { id: string; otNumber: number };
}

const PAGE_SIZE = 10;

export interface InterventionsPageResult {
    interventions: InterventionListItem[];
    totalPages: number;
    currentPage: number;
    /** Total de OTs del filtro (sin paginar). */
    totalCount: number;
    /** Suma de cost del filtro (sin paginar). */
    totalCost: number;
}

/** Interpreta YYYY-MM-DD como inicio/fin de día (UTC) para filtrar dateOfIntervention. */
function parseDateBound(isoDate: string, endOfDay: boolean): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
    const [y, m, d] = isoDate.split('-').map(Number);
    if (!y || !m || !d) return null;
    return endOfDay
        ? new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999))
        : new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function buildTermFilter(term: string, plateCarIds: string[] = []): Prisma.InterventionWhereInput {
    const filters: Prisma.InterventionWhereInput[] = [
        { description: { contains: term, mode: 'insensitive' } },
        { notes: { contains: term, mode: 'insensitive' } },
        { car: { make: { contains: term, mode: 'insensitive' } } },
        { car: { model: { contains: term, mode: 'insensitive' } } },
        { performedBy: { name: { contains: term, mode: 'insensitive' } } },
        {
            client: {
                OR: [
                    { firstName: { contains: term, mode: 'insensitive' } },
                    { lastName: { contains: term, mode: 'insensitive' } },
                    { dni: { contains: term, mode: 'insensitive' } },
                ]
            }
        },
    ];

    if (plateCarIds.length > 0) {
        filters.push({ carId: { in: plateCarIds } });
    } else {
        // Fallback literal por si no hubo match normalizado
        filters.push({
            car: { licensePlate: { contains: normalizeLicensePlate(term), mode: 'insensitive' } },
        });
    }

    const otNumber = parseInt(term, 10);
    if (!isNaN(otNumber)) {
        filters.push({ otNumber });
    }

    return { OR: filters };
}

function parseStatus(status: string): InterventionStatus | null {
    const validStatus: InterventionStatus[] = ['ABIERTA', 'CERRADA', 'CANCELADA'];
    return validStatus.includes(status as InterventionStatus)
        ? (status as InterventionStatus)
        : null;
}

export async function getInterventionsPage(
    page: number = 1,
    query: string = '',
    status: string = '',
    dateFrom: string = '',
    dateTo: string = ''
): Promise<InterventionsPageResult> {
    const empty: InterventionsPageResult = {
        interventions: [],
        totalPages: 0,
        currentPage: 1,
        totalCount: 0,
        totalCost: 0,
    };

    const session = await getServerSession(authOptions);
    if (!session) return empty;

    const isAdmin = session.user.role === 'ADMIN';
    const currentPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const terms = query.trim().split(/\s+/).filter(Boolean);
    const statusFilter = parseStatus(status);

    // Resolver IDs de patente ignorando guiones (FAM-250 ≡ FAM250)
    const plateIdsByTerm = await Promise.all(
        terms.map((term) => findCarIdsByNormalizedPlateContains(term, 50))
    );

    let statusClause: Prisma.InterventionWhereInput = {};
    if (statusFilter === 'ABIERTA') {
        statusClause = { status: 'ABIERTA', cancelRequestedAt: null };
    } else if (statusFilter === 'CERRADA') {
        statusClause = { status: 'CERRADA' };
    } else if (statusFilter === 'CANCELADA') {
        if (isAdmin) {
            statusClause = { status: 'CANCELADA' };
        } else {
            statusClause = {
                OR: [
                    { status: 'CANCELADA' },
                    { status: 'ABIERTA', cancelRequestedAt: { not: null } },
                ],
            };
        }
    } else if (status === 'PENDIENTE_CANCELACION' && isAdmin) {
        statusClause = { status: 'ABIERTA', cancelRequestedAt: { not: null } };
    }

    // Rango de fechas solo aplica para ADMIN (el UI no lo envía en otros roles)
    let dateClause: Prisma.InterventionWhereInput = {};
    if (isAdmin) {
        const fromBound = dateFrom ? parseDateBound(dateFrom.trim(), false) : null;
        const toBound = dateTo ? parseDateBound(dateTo.trim(), true) : null;
        if (fromBound || toBound) {
            dateClause = {
                dateOfIntervention: {
                    ...(fromBound ? { gte: fromBound } : {}),
                    ...(toBound ? { lte: toBound } : {}),
                },
            };
        }
    }

    const whereClause: Prisma.InterventionWhereInput = {
        ...(terms.length > 0
            ? { AND: terms.map((term, idx) => buildTermFilter(term, plateIdsByTerm[idx] || [])) }
            : {}),
        ...statusClause,
        ...dateClause,
        // Mecánico/viewer: solo sus OT. Admin: todas.
        ...(!isAdmin ? { performedById: session.user.id } : {}),
    };

    try {
        const [totalCount, costAgg] = await Promise.all([
            prisma.intervention.count({ where: whereClause }),
            prisma.intervention.aggregate({
                where: whereClause,
                _sum: { cost: true },
            }),
        ]);

        const totalCost = costAgg._sum.cost?.toNumber() ?? 0;
        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        const safePage = totalPages > 0 ? Math.min(currentPage, totalPages) : 1;

        const rows = await prisma.intervention.findMany({
            where: whereClause,
            take: PAGE_SIZE,
            skip: (safePage - 1) * PAGE_SIZE,
            include: {
                car: {
                    select: {
                        licensePlate: true,
                        make: true,
                        model: true,
                    }
                },
                client: {
                    select: {
                        firstName: true,
                        lastName: true,
                    }
                },
                performedBy: {
                    select: {
                        name: true,
                    }
                }
            },
            orderBy: {
                otNumber: 'desc',
            }
        });

        const formatted: InterventionListItem[] = rows.map(i => {
            const cancelRequested = i.cancelRequestedAt != null;
            let displayStatus: InterventionListItem['displayStatus'] = i.status;
            if (i.status === 'ABIERTA' && cancelRequested) {
                displayStatus = isAdmin ? 'PENDIENTE_CANCELACION' : 'CANCELADA';
            }

            return {
                id: i.id,
                otNumber: i.otNumber,
                status: i.status,
                cancelRequested,
                displayStatus,
                dateOfIntervention: i.dateOfIntervention,
                description: i.description,
                carPlate: i.car.licensePlate,
                carMakeModel: `${i.car.make || 'S/M'} ${i.car.model || 'S/M'}`,
                ownerName: `${i.client.firstName} ${i.client.lastName}`,
                performedByName: i.performedBy.name || 'Staff Desconocido',
                cost: i.cost.toNumber(),
            };
        });

        return {
            interventions: formatted,
            totalPages,
            currentPage: safePage,
            totalCount,
            totalCost,
        };
    } catch (error) {
        console.error("Error fetching interventions:", error);
        return empty;
    }
}

// --- Búsqueda OT ---

export interface OtCarSearchResult {
    id: string;
    plate: string;
    make: string;
    model: string;
    year: number | null;
    vin: string;
    ownerId: string | null;
    ownerName: string;
    ownerDni: string | null;
    ownerPhone: string | null;
}

export interface OtClientSearchResult {
    id: string;
    fullName: string;
    dni: string;
    phone: string | null;
    email: string | null;
    cars: {
        id: string;
        plate: string;
        make: string;
        model: string;
        year: number | null;
    }[];
}

export async function searchCarsForOt(searchTerm: string): Promise<OtCarSearchResult[]> {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return [];
    }

    const search = searchTerm.trim();
    if (search.length < 2) return [];
    const plateIds = await findCarIdsByNormalizedPlateContains(search, 20);

    const cars = await prisma.car.findMany({
        where: {
            OR: [
                ...(plateIds.length > 0 ? [{ id: { in: plateIds } }] : []),
                { vin: { contains: search.replace(/\s/g, ''), mode: 'insensitive' as const } },
                { make: { contains: search, mode: 'insensitive' as const } },
                { model: { contains: search, mode: 'insensitive' as const } },
            ]
        },
        select: {
            id: true,
            licensePlate: true,
            make: true,
            model: true,
            year: true,
            vin: true,
            ownershipHistory: {
                where: { endDate: null },
                select: {
                    client: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            dni: true,
                            phone: true,
                        }
                    }
                },
                take: 1,
            }
        },
        take: 10,
    });

    return cars.map(car => {
        const owner = car.ownershipHistory[0]?.client;
        return {
            id: car.id,
            plate: car.licensePlate,
            make: car.make || 'N/A',
            model: car.model || 'N/A',
            year: car.year,
            vin: car.vin,
            ownerId: owner?.id ?? null,
            ownerName: owner ? `${owner.firstName} ${owner.lastName}` : 'Sin dueño',
            ownerDni: owner?.dni ?? null,
            ownerPhone: owner?.phone ?? null,
        };
    });
}

/** Cada palabra debe matchear en algún campo (nombre, apellido, DNI, etc.).
 *  Así "nobile javier" encuentra a Javier Nobile. */
function buildSoftClientSearchWhere(searchTerm: string): Prisma.ClientWhereInput | null {
    const tokens = searchTerm
        .trim()
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 1);

    if (tokens.length === 0) return null;

    const tokenClause = (token: string): Prisma.ClientWhereInput => ({
        OR: [
            { firstName: { contains: token, mode: 'insensitive' } },
            { lastName: { contains: token, mode: 'insensitive' } },
            { dni: { contains: token, mode: 'insensitive' } },
            { phone: { contains: token, mode: 'insensitive' } },
            { email: { contains: token, mode: 'insensitive' } },
        ],
    });

    if (tokens.length === 1) {
        return tokenClause(tokens[0]);
    }

    return { AND: tokens.map(tokenClause) };
}

export async function searchClientsForOt(searchTerm: string): Promise<OtClientSearchResult[]> {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return [];
    }

    const search = searchTerm.trim();
    if (search.length < 2) return [];

    const where = buildSoftClientSearchWhere(search);
    if (!where) return [];

    const clients = await prisma.client.findMany({
        where,
        select: {
            id: true,
            firstName: true,
            lastName: true,
            dni: true,
            phone: true,
            email: true,
            ownedCarsHistory: {
                where: { endDate: null },
                select: {
                    car: {
                        select: {
                            id: true,
                            licensePlate: true,
                            make: true,
                            model: true,
                            year: true,
                        }
                    }
                }
            }
        },
        take: 10,
    });

    return clients.map(c => ({
        id: c.id,
        fullName: `${c.firstName} ${c.lastName}`,
        dni: c.dni,
        phone: c.phone,
        email: c.email,
        cars: c.ownedCarsHistory.map(o => ({
            id: o.car.id,
            plate: o.car.licensePlate,
            make: o.car.make || 'N/A',
            model: o.car.model || 'N/A',
            year: o.car.year,
        })),
    }));
}

export type ExistingCarMatch = OtCarSearchResult & {
    matchedBy: 'plate' | 'vin';
};

/**
 * Busca un vehículo existente por patente normalizada y/o VIN exacto.
 * La patente se compara sin guiones ni espacios (FAM-250 ≡ FAM250).
 * Usado al intentar dar de alta un auto nuevo para evitar duplicados
 * y ofrecer asociar el existente al propietario elegido.
 */
export async function findExistingCarByPlateOrVin(params: {
    plate?: string;
    vin?: string;
}): Promise<ExistingCarMatch | null> {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return null;
    }

    // Siempre normalizar: FAM-250 y FAM250 deben resolverse al mismo vehículo
    const plate = params.plate?.trim()
        ? normalizeLicensePlate(params.plate)
        : '';
    const vin = params.vin?.trim().replace(/\s/g, '').toUpperCase() || '';

    if (!plate && !vin) return null;

    let carId: string | null = null;
    let matchedBy: 'plate' | 'vin' = 'plate';

    if (plate) {
        carId = await findCarIdByNormalizedPlateExact(plate);
        if (carId) matchedBy = 'plate';
    }

    if (!carId && vin) {
        const byVin = await prisma.car.findUnique({
            where: { vin },
            select: { id: true },
        });
        if (byVin) {
            carId = byVin.id;
            matchedBy = 'vin';
        }
    }

    // Si matcheó por patente, verificar también VIN distinto (mismo auto o conflicto cruzado)
    if (carId && vin && matchedBy === 'plate') {
        const byVin = await prisma.car.findUnique({
            where: { vin },
            select: { id: true },
        });
        // Preferir reportar el match más específico; si son IDs distintos, el de patente gana
        // (createIntervention bloqueará ambos de todos modos).
        if (byVin && byVin.id !== carId) {
            // Conflicto cruzado: patente de un auto, VIN de otro — reportar patente
            matchedBy = 'plate';
        }
    }

    if (!carId) return null;

    const car = await prisma.car.findUnique({
        where: { id: carId },
        select: {
            id: true,
            licensePlate: true,
            make: true,
            model: true,
            year: true,
            vin: true,
            ownershipHistory: {
                where: { endDate: null },
                select: {
                    client: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            dni: true,
                            phone: true,
                        },
                    },
                },
                take: 1,
            },
        },
    });

    if (!car) return null;

    const owner = car.ownershipHistory[0]?.client;
    return {
        id: car.id,
        plate: car.licensePlate,
        make: car.make || 'N/A',
        model: car.model || 'N/A',
        year: car.year,
        vin: car.vin,
        ownerId: owner?.id ?? null,
        ownerName: owner ? `${owner.firstName} ${owner.lastName}` : 'Sin dueño',
        ownerDni: owner?.dni ?? null,
        ownerPhone: owner?.phone ?? null,
        matchedBy,
    };
}

async function transferOwnership(
    tx: Prisma.TransactionClient,
    carId: string,
    newClientId: string
) {
    await tx.carOwnership.updateMany({
        where: { carId, endDate: null },
        data: { endDate: new Date() },
    });
    await tx.carOwnership.create({
        data: {
            carId,
            clientId: newClientId,
            startDate: new Date(),
            endDate: null,
        },
    });
}

async function upsertClientInTx(
    tx: Prisma.TransactionClient,
    data: {
        firstName: string;
        lastName: string;
        dni: string;
        phone?: string | null;
        email?: string | null;
        address?: string | null;
    }
) {
    const dni = data.dni.trim();
    let client = await tx.client.findUnique({ where: { dni } });
    if (!client && data.email) {
        client = await tx.client.findUnique({ where: { email: data.email } });
    }

    if (!client) {
        return tx.client.create({
            data: {
                firstName: data.firstName.trim(),
                lastName: data.lastName.trim(),
                dni,
                phone: data.phone?.trim() || null,
                email: data.email?.trim() || null,
                address: data.address?.trim() || null,
            },
        });
    }

    return tx.client.update({
        where: { id: client.id },
        data: {
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            phone: data.phone?.trim() || client.phone,
            email: data.email?.trim() || client.email,
            address: data.address?.trim() || client.address,
        },
    });
}

export interface CreateOtPayload {
    carId?: string;
    clientId?: string;
    /** Si true y clientId distinto del dueño actual, transfiere ownership */
    transferOwnership?: boolean;
    /** Alta inline de vehículo (si no hay carId) */
    newCar?: {
        plate: string;
        vin: string;
        make: string;
        model: string;
        year: string;
        color?: string;
        km: string;
    };
    /** Alta inline de cliente (si no hay clientId) */
    newClient?: {
        firstName: string;
        lastName: string;
        dni: string;
        phone?: string;
        email?: string;
        address?: string;
    };
    description: string;
    notes?: string;
    mileageKm: string;
    /** Turno confirmado del que se abre la OT (queda vinculado para no duplicarlo) */
    appointmentId?: string;
}

/**
 * Abre una OT resolviendo auto+dueño (existentes o altas), con transferencia opcional.
 */
export async function createIntervention(data: CreateOtPayload): Promise<ServerActionResponse> {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return { success: false, message: 'Acceso denegado. Se requiere ser personal del taller.' };
    }

    const performedById = session.user.id;

    if (!data.description || !data.mileageKm) {
        return { success: false, message: 'Faltan descripción o kilometraje.' };
    }

    const mileageKm = parseInt(data.mileageKm, 10);
    if (isNaN(mileageKm)) {
        return { success: false, message: 'El Kilometraje debe ser un número válido.' };
    }

    if (data.appointmentId) {
        const appointment = await prisma.appointment.findUnique({
            where: { id: data.appointmentId },
            select: { status: true, interventionId: true },
        });
        if (!appointment) {
            return { success: false, message: 'El turno indicado no existe.' };
        }
        if (appointment.status !== 'CONFIRMADO') {
            return {
                success: false,
                message: 'Solo se puede abrir una OT desde un turno confirmado.',
            };
        }
        if (appointment.interventionId) {
            return { success: false, message: 'Ese turno ya tiene una OT abierta.' };
        }
    }

    try {
        const newIntervention = await prisma.$transaction(async (tx) => {
            let clientId = data.clientId || null;
            let carId = data.carId || null;

            if (data.newClient) {
                const client = await upsertClientInTx(tx, data.newClient);
                clientId = client.id;
            }

            if (!clientId) {
                throw new Error('Debe indicar o dar de alta un propietario.');
            }

            if (data.newCar) {
                const plateValidation = validateNewLicensePlate(data.newCar.plate);
                if (!plateValidation.ok || !plateValidation.plate) {
                    throw new Error(plateValidation.message || 'Patente inválida.');
                }
                const plate = plateValidation.plate;
                const vin = data.newCar.vin.trim().replace(/\s/g, '').toUpperCase();
                const year = parseInt(data.newCar.year, 10);
                const initialKm = parseInt(data.newCar.km, 10);

                if (!vin || !data.newCar.make || !data.newCar.model || isNaN(year) || isNaN(initialKm)) {
                    throw new Error('Datos del vehículo incompletos o inválidos.');
                }

                const existingByPlateId = await findCarIdByNormalizedPlateExactInTx(tx, plate);
                const existingByVin = await tx.car.findUnique({ where: { vin } });
                if (existingByPlateId || existingByVin) {
                    const byPlate = existingByPlateId
                        ? await tx.car.findUnique({ where: { id: existingByPlateId }, select: { licensePlate: true } })
                        : null;
                    if (existingByPlateId && byPlate && normalizeLicensePlate(byPlate.licensePlate) === plate) {
                        throw new Error(
                            `La patente ${byPlate.licensePlate} ya está registrada. Use el vehículo existente o asócielo al propietario elegido.`
                        );
                    }
                    if (existingByVin) {
                        throw new Error(
                            `El VIN ${vin} ya está registrado (patente ${existingByVin.licensePlate}). Use el vehículo existente o asócielo al propietario elegido.`
                        );
                    }
                    throw new Error(
                        'El vehículo ya está registrado. Use el existente o asócielo al propietario elegido.'
                    );
                }

                const car = await tx.car.create({
                    data: {
                        licensePlate: plate,
                        vin,
                        make: data.newCar.make,
                        model: data.newCar.model,
                        year,
                        color: data.newCar.color || null,
                        initialKm,
                    },
                });
                carId = car.id;

                await tx.carOwnership.create({
                    data: {
                        carId: car.id,
                        clientId,
                        startDate: new Date(),
                        endDate: null,
                    },
                });
            }

            if (!carId) {
                throw new Error('Debe indicar o dar de alta un vehículo.');
            }

            const currentOwnership = await tx.carOwnership.findFirst({
                where: { carId, endDate: null },
            });

            if (!currentOwnership) {
                await tx.carOwnership.create({
                    data: {
                        carId,
                        clientId,
                        startDate: new Date(),
                        endDate: null,
                    },
                });
            } else if (currentOwnership.clientId !== clientId) {
                if (!data.transferOwnership) {
                    throw new Error(
                        'El dueño seleccionado no coincide con el dueño actual del vehículo. Confirme la transferencia de propiedad.'
                    );
                }
                await transferOwnership(tx, carId, clientId);
            }

            const totalInterventions = await tx.intervention.count();
            const otNumber = totalInterventions + 1;

            const intervention = await tx.intervention.create({
                data: {
                    otNumber,
                    carId,
                    clientId,
                    description: data.description,
                    notes: data.notes || null,
                    mileageKm,
                    performedById,
                },
            });

            if (data.appointmentId) {
                // updateMany + filtro por interventionId null: evita doble OT si hay dos pestañas abiertas
                const linked = await tx.appointment.updateMany({
                    where: {
                        id: data.appointmentId,
                        status: 'CONFIRMADO',
                        interventionId: null,
                    },
                    data: { interventionId: intervention.id },
                });
                if (linked.count === 0) {
                    throw new Error('Ese turno ya tiene una OT abierta.');
                }
            }

            return intervention;
        });

        revalidatePath('/dashboard/interventions');
        revalidatePath('/dashboard/cars');
        revalidatePath('/dashboard/clients');
        revalidatePath('/dashboard/turnos');

        return {
            success: true,
            intervention: { id: newIntervention.id, otNumber: newIntervention.otNumber },
            message: `Orden de Trabajo #${newIntervention.otNumber} abierta con éxito.`,
        };
    } catch (error: unknown) {
        console.error('Error al crear intervención:', error);
        const message = error instanceof Error ? error.message : 'Error interno del servidor al crear la OT.';
        return { success: false, message };
    }
}

export type InterventionDetail = Awaited<ReturnType<typeof getInterventionDetail>>;

export async function getInterventionDetail(id: string) {
    const session = await getServerSession(authOptions);
    if (!session) { return null; }

    try {
        const intervention = await prisma.intervention.findUnique({
            where: { id },
            include: {
                car: {
                    select: {
                        id: true,
                        licensePlate: true,
                        vin: true,
                        make: true,
                        model: true,
                        year: true,
                        color: true,
                        initialKm: true,
                        engineNumber: true,
                    }
                },
                client: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        email: true,
                        dni: true,
                        address: true,
                    }
                },
                items: {
                    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                },
                performedBy: {
                    select: {
                        name: true,
                        role: true,
                    }
                }
            },
        });

        if (!intervention) return null;

        const isAdmin = session.user.role === 'ADMIN';
        if (!isAdmin && intervention.performedById !== session.user.id) {
            return null;
        }

        const cancelRequested = intervention.cancelRequestedAt != null;
        const isCancelled = intervention.status === 'CANCELADA';
        const isClosed = intervention.status === 'CERRADA';
        const isTrulyOpen = intervention.status === 'ABIERTA' && !cancelRequested;

        // Mecánico: solicitud de cancelación le figura como cancelada
        let displayStatus: 'ABIERTA' | 'CERRADA' | 'CANCELADA' | 'PENDIENTE_CANCELACION' =
            intervention.status;
        if (intervention.status === 'ABIERTA' && cancelRequested) {
            displayStatus = isAdmin ? 'PENDIENTE_CANCELACION' : 'CANCELADA';
        }

        // Edición de contenido (notas, ítems, km, etc.)
        // Una OT cerrada o cancelada es un documento final: nadie la edita, sin
        // importar el rol ni cuándo se cerró. Solo se edita mientras está abierta.
        // Pendiente de cancelación: el admin sigue gestionándola hasta resolverla.
        const canEditContent =
            !isCancelled &&
            !isClosed &&
            (
                (isTrulyOpen && (isAdmin || session.user.role === 'MECHANIC')) ||
                (cancelRequested && isAdmin)
            );

        const canEditMasters = canEditContent;

        const canClose = isTrulyOpen && (isAdmin || session.user.role === 'MECHANIC');
        const canRequestCancel = isTrulyOpen && (isAdmin || session.user.role === 'MECHANIC');
        const canResolveCancel = isAdmin && cancelRequested && intervention.status === 'ABIERTA';

        return {
            id: intervention.id,
            otNumber: intervention.otNumber,
            description: intervention.description,
            notes: intervention.notes,
            status: intervention.status,
            cancelRequested,
            cancelRequestedAt: intervention.cancelRequestedAt,
            displayStatus,
            dateOfIntervention: intervention.dateOfIntervention,
            estimatedReadyAt: intervention.estimatedReadyAt,
            carId: intervention.carId,
            clientId: intervention.clientId,
            performedById: intervention.performedById,
            mileageKm: intervention.mileageKm,
            createdAt: intervention.createdAt,
            updatedAt: intervention.updatedAt,
            car: intervention.car,
            performedBy: intervention.performedBy,
            costNumber: intervention.cost.toNumber(),
            items: intervention.items.map(item => ({
                id: item.id,
                type: item.type,
                description: item.description,
                hours: item.hours?.toNumber() ?? null,
                unitPrice: item.unitPrice.toNumber(),
                amount: item.amount.toNumber(),
                sortOrder: item.sortOrder,
            })),
            owner: {
                id: intervention.client.id,
                name: `${intervention.client.firstName} ${intervention.client.lastName}`,
                firstName: intervention.client.firstName,
                lastName: intervention.client.lastName,
                phone: intervention.client.phone,
                email: intervention.client.email,
                dni: intervention.client.dni,
                address: intervention.client.address,
            },
            isOpen: isTrulyOpen,
            isClosed,
            isCancelled,
            canEditContent,
            canEditMasters,
            canClose,
            canRequestCancel,
            canResolveCancel,
            userRole: session.user.role as string,
        };
    } catch (error) {
        console.error("Error fetching intervention detail:", error);
        return null;
    }
}

interface UpdateInterventionData {
    id: string;
    notes?: string;
    description?: string;
    mileageKm?: string;
    /** ISO local `YYYY-MM-DDTHH:mm` o string vacío para limpiar */
    estimatedReadyAt?: string;
}

function canMutateOt(
    role: string,
    userId: string,
    ot: { status: InterventionStatus; cancelRequestedAt: Date | null; performedById: string }
): { ok: true } | { ok: false; message: string } {
    if (role !== 'ADMIN' && ot.performedById !== userId) {
        return { ok: false, message: 'No tenés permiso sobre esta OT.' };
    }
    if (ot.status === 'CANCELADA') {
        return { ok: false, message: 'Una OT cancelada no se puede modificar ni reabrir.' };
    }
    // Cerrada es final para todos los roles, también para las OTs cerradas antes
    // de que existiera esta regla.
    if (ot.status === 'CERRADA') {
        return { ok: false, message: 'Una OT cerrada no se puede modificar.' };
    }
    if (ot.status === 'ABIERTA' && ot.cancelRequestedAt && role !== 'ADMIN') {
        return { ok: false, message: 'La OT figura cancelada a la espera de autorización del administrador.' };
    }
    if (ot.status === 'ABIERTA') {
        return { ok: true };
    }
    return { ok: false, message: 'No se puede modificar esta OT.' };
}

export async function updateIntervention(data: UpdateInterventionData): Promise<{
    success: boolean;
    message: string;
}> {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return { success: false, message: 'Acceso denegado.' };
    }

    try {
        const existing = await prisma.intervention.findUnique({ where: { id: data.id } });
        if (!existing) {
            return { success: false, message: 'OT no encontrada.' };
        }

        const allowed = canMutateOt(session.user.role, session.user.id, existing);
        if (!allowed.ok) return { success: false, message: allowed.message };

        const updateData: Prisma.InterventionUpdateInput = {};

        if (data.notes !== undefined) {
            updateData.notes = data.notes;
        }

        const canEditCore =
            (existing.status === 'ABIERTA' && !existing.cancelRequestedAt)
            || (existing.cancelRequestedAt != null && session.user.role === 'ADMIN');

        if (canEditCore) {
            if (data.description !== undefined) {
                updateData.description = data.description;
            }
            if (data.mileageKm !== undefined && data.mileageKm !== '') {
                const km = parseInt(data.mileageKm, 10);
                if (isNaN(km)) {
                    return { success: false, message: 'Kilometraje inválido.' };
                }
                updateData.mileageKm = km;
            }
            if (data.estimatedReadyAt !== undefined) {
                const raw = data.estimatedReadyAt.trim();
                if (!raw) {
                    updateData.estimatedReadyAt = null;
                } else {
                    const parsed = new Date(raw);
                    if (Number.isNaN(parsed.getTime())) {
                        return { success: false, message: 'Fecha/hora de entrega inválida.' };
                    }
                    updateData.estimatedReadyAt = parsed;
                }
            }
        }

        if (Object.keys(updateData).length === 0) {
            return { success: false, message: 'No se proporcionaron datos para actualizar.' };
        }

        await prisma.intervention.update({
            where: { id: data.id },
            data: updateData,
        });

        revalidatePath(`/dashboard/interventions/${data.id}`);
        revalidatePath('/dashboard/interventions');

        return {
            success: true,
            message: 'Orden de Trabajo actualizada con éxito.',
        };
    } catch (error) {
        console.error('Error al actualizar intervención:', error);
        return { success: false, message: 'Error interno del servidor al actualizar la OT.' };
    }
}

export async function closeIntervention(id: string): Promise<{ success: boolean; message: string }> {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return { success: false, message: 'Acceso denegado.' };
    }

    try {
        const ot = await prisma.intervention.findUnique({
            where: { id },
            include: { _count: { select: { items: true } } },
        });
        if (!ot) return { success: false, message: 'OT no encontrada.' };
        if (session.user.role !== 'ADMIN' && ot.performedById !== session.user.id) {
            return { success: false, message: 'No tenés permiso sobre esta OT.' };
        }
        if (ot.status !== 'ABIERTA' || ot.cancelRequestedAt) {
            return { success: false, message: 'Solo se pueden cerrar órdenes abiertas sin cancelación pendiente.' };
        }
        if (ot._count.items === 0 || ot.cost.equals(0)) {
            return {
                success: false,
                message:
                    'No se puede cerrar una OT sin ítems o con importe $0. Agregá al menos un ítem con valor monetario.',
            };
        }

        await prisma.intervention.update({
            where: { id },
            data: { status: 'CERRADA' },
        });

        revalidatePath(`/dashboard/interventions/${id}`);
        revalidatePath('/dashboard/interventions');

        return { success: true, message: 'Orden de Trabajo cerrada.' };
    } catch (error) {
        console.error('Error closing OT:', error);
        return { success: false, message: 'Error al cerrar la OT.' };
    }
}

export async function requestCancelIntervention(id: string): Promise<{ success: boolean; message: string }> {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return { success: false, message: 'Acceso denegado.' };
    }

    try {
        const ot = await prisma.intervention.findUnique({ where: { id } });
        if (!ot) return { success: false, message: 'OT no encontrada.' };
        if (session.user.role !== 'ADMIN' && ot.performedById !== session.user.id) {
            return { success: false, message: 'No tenés permiso sobre esta OT.' };
        }
        if (ot.status !== 'ABIERTA') {
            return { success: false, message: 'Solo se puede solicitar cancelación de una OT abierta.' };
        }
        if (ot.cancelRequestedAt) {
            return { success: false, message: 'Ya hay una solicitud de cancelación pendiente.' };
        }

        // Si es ADMIN, cancela directo; el mecánico solo solicita
        if (session.user.role === 'ADMIN') {
            await prisma.intervention.update({
                where: { id },
                data: {
                    status: 'CANCELADA',
                    cancelRequestedAt: null,
                    cancelRequestedById: null,
                },
            });
            revalidatePath(`/dashboard/interventions/${id}`);
            revalidatePath('/dashboard/interventions');
            return { success: true, message: 'Orden de Trabajo cancelada.' };
        }

        await prisma.intervention.update({
            where: { id },
            data: {
                cancelRequestedAt: new Date(),
                cancelRequestedById: session.user.id,
            },
        });

        revalidatePath(`/dashboard/interventions/${id}`);
        revalidatePath('/dashboard/interventions');

        return {
            success: true,
            message: 'Solicitud de cancelación enviada. Quedará cancelada cuando el administrador la autorice.',
        };
    } catch (error) {
        console.error('Error requesting cancel:', error);
        return { success: false, message: 'Error al solicitar la cancelación.' };
    }
}

export async function approveCancelIntervention(id: string): Promise<{ success: boolean; message: string }> {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        return { success: false, message: 'Solo un administrador puede autorizar la cancelación.' };
    }

    try {
        const ot = await prisma.intervention.findUnique({ where: { id } });
        if (!ot) return { success: false, message: 'OT no encontrada.' };
        if (ot.status !== 'ABIERTA' || !ot.cancelRequestedAt) {
            return { success: false, message: 'No hay una solicitud de cancelación pendiente.' };
        }

        await prisma.intervention.update({
            where: { id },
            data: {
                status: 'CANCELADA',
                cancelRequestedAt: null,
                cancelRequestedById: null,
            },
        });

        revalidatePath(`/dashboard/interventions/${id}`);
        revalidatePath('/dashboard/interventions');

        return { success: true, message: 'Cancelación autorizada. La OT quedó cancelada.' };
    } catch (error) {
        console.error('Error approving cancel:', error);
        return { success: false, message: 'Error al autorizar la cancelación.' };
    }
}

export async function rejectCancelIntervention(id: string): Promise<{ success: boolean; message: string }> {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        return { success: false, message: 'Solo un administrador puede rechazar la cancelación.' };
    }

    try {
        const ot = await prisma.intervention.findUnique({ where: { id } });
        if (!ot) return { success: false, message: 'OT no encontrada.' };
        if (ot.status !== 'ABIERTA' || !ot.cancelRequestedAt) {
            return { success: false, message: 'No hay una solicitud de cancelación pendiente.' };
        }

        await prisma.intervention.update({
            where: { id },
            data: {
                cancelRequestedAt: null,
                cancelRequestedById: null,
            },
        });

        revalidatePath(`/dashboard/interventions/${id}`);
        revalidatePath('/dashboard/interventions');

        return { success: true, message: 'La solicitud fue rechazada y la OT volvió a figurar como abierta.' };
    } catch (error) {
        console.error('Error rejecting cancel:', error);
        return { success: false, message: 'Error al rechazar la cancelación.' };
    }
}

async function recalculateOtCost(tx: Prisma.TransactionClient, interventionId: string) {
    const agg = await tx.interventionItem.aggregate({
        where: { interventionId },
        _sum: { amount: true },
    });
    const total = agg._sum.amount ?? new Decimal(0);
    await tx.intervention.update({
        where: { id: interventionId },
        data: { cost: total },
    });
    return total;
}

async function assertOtEditableForItems(interventionId: string, role: string, userId: string) {
    const ot = await prisma.intervention.findUnique({
        where: { id: interventionId },
        select: { status: true, cancelRequestedAt: true, performedById: true },
    });
    if (!ot) return { ok: false as const, message: 'OT no encontrada.' };

    const allowed = canMutateOt(role, userId, ot);
    if (!allowed.ok) return { ok: false as const, message: allowed.message };

    return { ok: true as const };
}

export interface UpsertItemData {
    interventionId: string;
    itemId?: string;
    type: InterventionItemType | string;
    description: string;
    hours?: string;
    unitPrice?: string;
}

export async function upsertInterventionItem(data: UpsertItemData): Promise<{
    success: boolean;
    message: string;
    totalCost?: number;
}> {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return { success: false, message: 'Acceso denegado.' };
    }

    const openCheck = await assertOtEditableForItems(data.interventionId, session.user.role, session.user.id);
    if (!openCheck.ok) return { success: false, message: openCheck.message };

    const validTypes: InterventionItemType[] = ['REPUESTO', 'MANO_DE_OBRA', 'TRABAJO_TERCERO'];
    if (!validTypes.includes(data.type as InterventionItemType)) {
        return { success: false, message: 'Tipo de ítem inválido.' };
    }
    const type = data.type as InterventionItemType;

    if (!data.description.trim()) {
        return { success: false, message: 'La descripción del ítem es obligatoria.' };
    }

    try {
        const settings = await prisma.workshopSettings.upsert({
            where: { id: 'default' },
            update: {},
            create: { id: 'default', hourlyRate: 0 },
        });
        const hourlyRate = settings.hourlyRate;

        let hours: Decimal | null = null;
        let unitPrice: Decimal;
        let amount: Decimal;

        if (type === 'MANO_DE_OBRA') {
            const h = parseFloat(data.hours || '0');
            if (isNaN(h) || h <= 0) {
                return { success: false, message: 'Indique las horas trabajadas (mayor a 0).' };
            }
            hours = new Decimal(h);
            unitPrice = hourlyRate;
            amount = hours.mul(unitPrice);
        } else {
            const price = parseFloat(data.unitPrice || '0');
            if (isNaN(price) || price < 0) {
                return { success: false, message: 'Indique un monto válido.' };
            }
            unitPrice = new Decimal(price);
            amount = unitPrice;
        }

        await prisma.$transaction(async (tx) => {
            if (data.itemId) {
                await tx.interventionItem.update({
                    where: { id: data.itemId },
                    data: {
                        type,
                        description: data.description.trim(),
                        hours,
                        unitPrice,
                        amount,
                    },
                });
            } else {
                const count = await tx.interventionItem.count({
                    where: { interventionId: data.interventionId },
                });
                await tx.interventionItem.create({
                    data: {
                        interventionId: data.interventionId,
                        type,
                        description: data.description.trim(),
                        hours,
                        unitPrice,
                        amount,
                        sortOrder: count,
                    },
                });
            }
            await recalculateOtCost(tx, data.interventionId);
        });

        const updated = await prisma.intervention.findUnique({
            where: { id: data.interventionId },
            select: { cost: true },
        });

        revalidatePath(`/dashboard/interventions/${data.interventionId}`);
        revalidatePath('/dashboard/interventions');

        return {
            success: true,
            message: data.itemId ? 'Ítem actualizado.' : 'Ítem agregado.',
            totalCost: updated?.cost.toNumber(),
        };
    } catch (error) {
        console.error('Error upsert item:', error);
        return { success: false, message: 'Error al guardar el ítem.' };
    }
}

export async function deleteInterventionItem(itemId: string, interventionId: string): Promise<{
    success: boolean;
    message: string;
    totalCost?: number;
}> {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return { success: false, message: 'Acceso denegado.' };
    }

    const openCheck = await assertOtEditableForItems(interventionId, session.user.role, session.user.id);
    if (!openCheck.ok) return { success: false, message: openCheck.message };

    try {
        await prisma.$transaction(async (tx) => {
            await tx.interventionItem.delete({ where: { id: itemId } });
            await recalculateOtCost(tx, interventionId);
        });

        const updated = await prisma.intervention.findUnique({
            where: { id: interventionId },
            select: { cost: true },
        });

        revalidatePath(`/dashboard/interventions/${interventionId}`);
        revalidatePath('/dashboard/interventions');

        return {
            success: true,
            message: 'Ítem eliminado.',
            totalCost: updated?.cost.toNumber(),
        };
    } catch (error) {
        console.error('Error delete item:', error);
        return { success: false, message: 'Error al eliminar el ítem.' };
    }
}

/**
 * Transfiere el dueño del vehículo vinculado a una OT abierta y actualiza el snapshot.
 */
export async function transferOtOwner(data: {
    interventionId: string;
    newClientId?: string;
    newClient?: {
        firstName: string;
        lastName: string;
        dni: string;
        phone?: string;
        email?: string;
    };
}): Promise<{ success: boolean; message: string }> {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return { success: false, message: 'Acceso denegado.' };
    }

    try {
        await prisma.$transaction(async (tx) => {
            const ot = await tx.intervention.findUnique({
                where: { id: data.interventionId },
            });
            if (!ot) throw new Error('OT no encontrada.');
            if (ot.status === 'CANCELADA') {
                throw new Error('Una OT cancelada no se puede modificar.');
            }
            if (ot.status !== 'ABIERTA' || ot.cancelRequestedAt) {
                throw new Error('Solo se puede transferir el dueño mientras la OT está abierta (sin cancelación pendiente).');
            }

            let clientId = data.newClientId;
            if (data.newClient) {
                const client = await upsertClientInTx(tx, data.newClient);
                clientId = client.id;
            }
            if (!clientId) throw new Error('Debe indicar el nuevo propietario.');

            await transferOwnership(tx, ot.carId, clientId);
            await tx.intervention.update({
                where: { id: ot.id },
                data: { clientId },
            });
        });

        revalidatePath(`/dashboard/interventions/${data.interventionId}`);
        revalidatePath('/dashboard/cars');
        revalidatePath('/dashboard/clients');

        return { success: true, message: 'Propietario transferido. En adelante quedará asociado a este vehículo.' };
    } catch (error: unknown) {
        console.error('Error transfer OT owner:', error);
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Error al transferir propietario.',
        };
    }
}

export async function updateOtCar(
    interventionId: string,
    carData: {
        licensePlate?: string;
        vin?: string;
        make?: string | null;
        model?: string | null;
        year?: number | null;
        color?: string | null;
        engineNumber?: string | null;
        initialKm?: number;
    }
): Promise<{ success: boolean; message: string }> {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return { success: false, message: 'Acceso denegado.' };
    }

    const ot = await prisma.intervention.findUnique({ where: { id: interventionId } });
    if (!ot) return { success: false, message: 'OT no encontrada.' };
    const allowed = canMutateOt(session.user.role, session.user.id, ot);
    if (!allowed.ok) return { success: false, message: allowed.message };

    try {
        const updateData: Prisma.CarUpdateInput = { ...carData };
        if (carData.licensePlate) {
            const plateValidation = validateNewLicensePlate(carData.licensePlate);
            if (!plateValidation.ok || !plateValidation.plate) {
                return { success: false, message: plateValidation.message || 'Patente inválida.' };
            }
            const { findCarIdByNormalizedPlateExact } = await import('../../lib/plate-search');
            const existingId = await findCarIdByNormalizedPlateExact(plateValidation.plate);
            if (existingId && existingId !== ot.carId) {
                return { success: false, message: 'Patente o VIN ya existe.' };
            }
            updateData.licensePlate = plateValidation.plate;
        }
        if (carData.vin) {
            updateData.vin = carData.vin.toUpperCase().replace(/\s/g, '');
        }

        await prisma.car.update({
            where: { id: ot.carId },
            data: updateData,
        });

        revalidatePath(`/dashboard/interventions/${interventionId}`);
        return { success: true, message: 'Vehículo actualizado.' };
    } catch (error: unknown) {
        console.error(error);
        if (typeof error === 'object' && error && 'code' in error && (error as { code: string }).code === 'P2002') {
            return { success: false, message: 'Patente o VIN ya existe.' };
        }
        return { success: false, message: 'Error al actualizar el vehículo.' };
    }
}

export async function updateOtClient(
    interventionId: string,
    clientData: {
        firstName: string;
        lastName: string;
        dni: string;
        phone?: string | null;
        email?: string | null;
        address?: string | null;
    }
): Promise<{ success: boolean; message: string }> {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return { success: false, message: 'Acceso denegado.' };
    }

    const ot = await prisma.intervention.findUnique({ where: { id: interventionId } });
    if (!ot) return { success: false, message: 'OT no encontrada.' };
    const allowed = canMutateOt(session.user.role, session.user.id, ot);
    if (!allowed.ok) return { success: false, message: allowed.message };

    try {
        const conflict = await prisma.client.findFirst({
            where: {
                id: { not: ot.clientId },
                OR: [
                    { dni: clientData.dni.trim() },
                    ...(clientData.email ? [{ email: clientData.email.trim() }] : []),
                ],
            },
        });
        if (conflict) {
            return { success: false, message: 'DNI o email ya registrado en otra persona.' };
        }

        await prisma.client.update({
            where: { id: ot.clientId },
            data: {
                firstName: clientData.firstName.trim(),
                lastName: clientData.lastName.trim(),
                dni: clientData.dni.trim(),
                phone: clientData.phone?.trim() || null,
                email: clientData.email?.trim() || null,
                address: clientData.address?.trim() || null,
            },
        });

        revalidatePath(`/dashboard/interventions/${interventionId}`);
        return { success: true, message: 'Propietario actualizado.' };
    } catch (error) {
        console.error(error);
        return { success: false, message: 'Error al actualizar el propietario.' };
    }
}

export async function generateOtPdfBase64(interventionId: string): Promise<{
    success: boolean;
    base64Data?: string;
    otNumber?: number;
    message?: string;
}> {
    const session = await getServerSession(authOptions);
    if (!session) {
        return { success: false, message: 'Acceso denegado.' };
    }

    try {
        const interventionData = await prisma.intervention.findUnique({
            where: { id: interventionId },
            include: {
                car: true,
                client: true,
                items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
                performedBy: true,
            }
        });

        if (!interventionData) {
            return { success: false, message: 'Orden de Trabajo no encontrada.' };
        }

        if (
            session.user.role !== 'ADMIN' &&
            interventionData.performedById !== session.user.id
        ) {
            return { success: false, message: 'No tenés permiso sobre esta OT.' };
        }

        if (interventionData.status === 'CANCELADA') {
            return { success: false, message: 'No se puede generar el PDF de una orden cancelada.' };
        }

        if (interventionData.cancelRequestedAt) {
            return {
                success: false,
                message: 'No se puede generar el PDF: la orden tiene una cancelación solicitada.',
            };
        }

        if (interventionData.status !== 'CERRADA') {
            return {
                success: false,
                message: 'El comprobante PDF solo se puede generar cuando la OT está cerrada.',
            };
        }

        const logoDataUrl = getLogoBase64();

        const pdfData: PdfData = {
            otNumber: interventionData.otNumber,
            status: interventionData.status,
            createdAt: interventionData.dateOfIntervention,
            updatedAt: interventionData.updatedAt,
            mileageKm: interventionData.mileageKm,
            notes: interventionData.notes,
            description: interventionData.description,
            cost: interventionData.cost.toNumber(),
            logoSrc: logoDataUrl,
            items: interventionData.items.map(item => ({
                type: item.type,
                description: item.description,
                amount: item.amount.toNumber(),
            })),
            car: {
                licensePlate: interventionData.car.licensePlate,
                make: interventionData.car.make || 'N/A',
                model: interventionData.car.model || 'N/A',
                year: interventionData.car.year,
                vin: interventionData.car.vin,
            },
            owner: {
                name: `${interventionData.client.firstName} ${interventionData.client.lastName}`,
                dni: interventionData.client.dni,
            },
            performedBy: interventionData.performedBy ? {
                name: `${interventionData.performedBy.name || 'N/A'}`,
            } : null,
        };

        const pdfBuffer = await renderToBuffer(<OtComprobantePdf data={pdfData} />);
        const base64Data = pdfBuffer.toString('base64');

        return {
            success: true,
            base64Data,
            otNumber: interventionData.otNumber,
        };
    } catch (error) {
        console.error("Error al generar PDF con React-PDF:", error);
        return { success: false, message: 'Error interno al generar el PDF.' };
    }
}
