'use server'

// --- Tipos para el Listado ---

import { authOptions } from "@/auth";
import { getServerSession } from "next-auth";
import { Intervention, InterventionStatus } from "../../generated/prisma";
import prisma from "../../lib/prisma";
import { revalidatePath } from "next/cache";

// Definimos un tipo que incluye todos los datos necesarios para la tabla.
export interface InterventionListItem {
    id: string;
    otNumber: number;
    status: InterventionStatus;
    dateOfIntervention: Date;
    description: string;
    // Datos del Coche
    carPlate: string;
    carMakeModel: string;
    // Datos del Dueño
    ownerName: string;
    // Datos del Staff que registró
    performedByName: string;
}

// --- Tipos de Datos ACTUALIZADOS para el esquema del usuario ---
interface CreateInterventionData {
    carId: string;
    description: string; // Mapea a 'description' en el modelo
    notes: string;       // Mapea a 'notes' en el modelo (Estimación Inicial)
    mileageKm: string;   // NUEVO campo requerido para el kilometraje
}

interface ServerActionResponse {
    success: boolean;
    message: string;
    intervention?: Intervention;
}


/**
 * Obtiene la lista de todas las Intervenciones activas/pendientes.
 * Incluye la compleja lógica de obtener el dueño actual y el Staff que la registró.
 */
export async function getInterventions(): Promise<InterventionListItem[]> {

    // 1. SEGURIDAD: Verificar sesión (sólo Staff puede ver el listado)
    const session = await getServerSession(authOptions);
    if (!session) { return []; }

    try {
        // 2. CONSULTA COMPLEJA A PRISMA
        const interventions = await prisma.intervention.findMany({
            // Solo queremos OTs que NO estén canceladas o completadas (por defecto)
            // AJUSTA EL WHERE según lo que quieras mostrar por defecto.
            // Aquí, mostramos todas las que NO estén COMPLETADAS, asumiendo que son las "activas".
            where: {
                status: {
                    not: 'COMPLETED'
                }
            },

            // Incluimos las relaciones necesarias: Car, User que la hizo
            include: {
                car: {
                    select: {
                        licensePlate: true,
                        make: true,
                        model: true,
                        // Relación anidada para obtener el Dueño Actual (Client)
                        ownershipHistory: {
                            where: {
                                endDate: null, // Dueño Actual
                            },
                            select: {
                                client: {
                                    select: {
                                        firstName: true,
                                        lastName: true,
                                    }
                                }
                            },
                            take: 1,
                        }
                    }
                },
                performedBy: {
                    select: {
                        name: true,
                    }
                }
            },
            orderBy: {
                otNumber: 'desc', // Las OTs más nuevas primero
            }
        });

        // 3. MAPEO Y CONCATENACIÓN DE DATOS para el frontend
        return interventions.map(i => {
            const currentOwner = i.car.ownershipHistory[0]?.client;

            const ownerName = currentOwner
                ? `${currentOwner.firstName} ${currentOwner.lastName}`
                : 'Cliente Desconocido';

            return {
                id: i.id,
                otNumber: i.otNumber,
                status: i.status,
                dateOfIntervention: i.dateOfIntervention,
                description: i.description,
                carPlate: i.car.licensePlate,
                carMakeModel: `${i.car.make || 'S/M'} ${i.car.model || 'S/M'}`,
                ownerName: ownerName,
                performedByName: i.performedBy.name || 'Staff Desconocido',
            };
        });

    } catch (error) {
        console.error("Error fetching interventions:", error);
        return [];
    }
}

// Nuevo tipo para el detalle que incluye todas las relaciones
export type InterventionDetail = Awaited<ReturnType<typeof getInterventionDetail>>;

/**
 * Obtiene todos los detalles de una Intervención específica por su ID.
 * Incluye datos de Cliente, Coche y Staff.
 */
export async function getInterventionDetail(id: string) {

    // 1. SEGURIDAD: Verificar sesión (solo Staff)
    const session = await getServerSession(authOptions);
    if (!session) { return null; }

    try {
        // 2. CONSULTA COMPLEJA A PRISMA para obtener todas las relaciones
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
                        // Búsqueda del Dueño Actual (Client)
                        ownershipHistory: {
                            where: { endDate: null },
                            select: {
                                client: {
                                    select: {
                                        id: true,
                                        firstName: true,
                                        lastName: true,
                                        phone: true,
                                        email: true,
                                    }
                                }
                            },
                            take: 1,
                        }
                    }
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

        // 3. Mapeo y formateo para el frontend
        const currentOwner = intervention.car.ownershipHistory[0]?.client;

        return {
            ...intervention,
            owner: currentOwner
                ? {
                    id: currentOwner.id,
                    name: `${currentOwner.firstName} ${currentOwner.lastName}`,
                    phone: currentOwner.phone,
                    email: currentOwner.email,
                }
                : null,
        };

    } catch (error) {
        console.error("Error fetching intervention detail:", error);
        return null;
    }
}


// Tipos para la actualización
interface UpdateInterventionData {
    id: string; // ID de la Intervención
    notes?: string;
    cost?: string;
    status?: string; // Usamos string para el input del formulario
}

interface UpdateActionResponse {
    success: boolean;
    message: string;
    updatedIntervention?: Intervention;
}

/**
 * Actualiza las notas, el costo y/o el estado de una Intervención específica.
 */
export async function updateIntervention(data: UpdateInterventionData): Promise<UpdateActionResponse> {

    // 1. SEGURIDAD: Verificar sesión y rol (solo Staff puede actualizar OTs)
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return { success: false, message: 'Acceso denegado. Se requiere ser personal del taller para actualizar la OT.' };
    }

    try {
        const updateData: any = {};

        // 2. CONVERSIÓN Y VALIDACIÓN DE DATOS
        if (data.notes !== undefined) {
            updateData.notes = data.notes;
        }

        if (data.cost !== undefined && data.cost !== null && data.cost !== '') {
            const costValue = parseFloat(data.cost);
            if (isNaN(costValue) || costValue < 0) {
                return { success: false, message: 'El Costo debe ser un número positivo válido.' };
            }
            // Mapeo a Decimal de Prisma
            updateData.cost = costValue;
        }

        if (data.status) {
            // Validación básica del enum: asegura que el string coincida con InterventionStatus
            const validStatus = ['COMPLETED', 'PENDING_PAYMENT', 'CANCELLED'];
            if (!validStatus.includes(data.status)) {
                return { success: false, message: `Estado inválido: ${data.status}.` };
            }
            updateData.status = data.status;
        }

        // No hay nada que actualizar
        if (Object.keys(updateData).length === 0) {
            return { success: false, message: 'No se proporcionaron datos para actualizar.' };
        }

        // 3. ACTUALIZACIÓN EN PRISMA
        const updatedIntervention = await prisma.intervention.update({
            where: { id: data.id },
            data: updateData,
        });

        // 4. Revalidar la caché de la página de detalle y del listado
        revalidatePath(`/dashboard/interventions/${data.id}`);
        revalidatePath('/dashboard/interventions');

        return {
            success: true,
            updatedIntervention: updatedIntervention,
            message: 'Orden de Trabajo actualizada con éxito.'
        };

    } catch (error) {
        console.error('Error al actualizar intervención:', error);
        return { success: false, message: 'Error interno del servidor al actualizar la OT.' };
    }
}

/**
 * Crea una nueva Intervención (Orden de Trabajo) respetando el esquema.
 * Vincula el coche, el usuario Staff que abre la OT, y el kilometraje actual.
 */
export async function createIntervention(data: CreateInterventionData): Promise<ServerActionResponse> {

    // 1. SEGURIDAD: Autenticar y Autorizar Staff
    const session = await getServerSession(authOptions);

    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return { success: false, message: 'Acceso denegado. Se requiere ser personal del taller.' };
    }

    // El 'performedById' es el usuario Staff que registra la OT
    const performedById = session.user.id;

    try {
        // 2. VALIDACIÓN
        if (!data.carId || !data.description || !data.mileageKm) {
            return { success: false, message: 'Faltan campos requeridos (Vehículo, Descripción o Kilometraje).' };
        }

        // Conversión y validación de números
        const mileageKm = parseInt(data.mileageKm);
        if (isNaN(mileageKm)) {
            return { success: false, message: 'El Kilometraje debe ser un número válido.' };
        }

        // 3. LÓGICA CENTRAL (Transacción de Prisma)
        const newIntervention = await prisma.$transaction(async (tx) => {

            // a) Generar el Número de OT
            const totalInterventions = await tx.intervention.count();
            const otNumber = totalInterventions + 1;

            // b) Crear la nueva Intervención
            const intervention = await tx.intervention.create({
                data: {
                    otNumber: otNumber,
                    carId: data.carId,
                    description: data.description,       // Mapeado
                    notes: data.notes || null,           // Mapeado (opcional en tu esquema)
                    mileageKm: mileageKm,                // Mapeado y parseado a Int
                    performedById: performedById,        // Mapeado al Staff logueado

                    // status: InterventionStatus.COMPLETED es el valor por defecto en tu esquema.
                    // Si una OT nueva debe estar PENDIENTE, debes cambiar el @default en schema.prisma.
                    // Aquí, permitimos que tome el valor por defecto: COMPLETED.
                },
            });
            return intervention;
        });

        // 4. Revalidar la caché
        revalidatePath('/dashboard/interventions');

        return {
            success: true,
            intervention: newIntervention,
            message: `Orden de Trabajo #${newIntervention.otNumber} abierta con éxito.`,
        };

    } catch (error) {
        console.error('Error al crear intervención:', error);
        return { success: false, message: 'Error interno del servidor al crear la OT.' };
    }
}