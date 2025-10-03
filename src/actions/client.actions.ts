'use server'

// ====================================================================
// A. LISTADO Y PAGINACIÓN DE CLIENTES
// ====================================================================

import { authOptions } from "@/auth";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import prisma from "../../lib/prisma";

const CLIENT_PAGE_SIZE = 10;

export interface ClientListItem {
    id: string;
    dni: string | null;
    fullName: string;
    phone: string | null;
    email: string | null;
    activeCarsCount: number; // Número de coches actualmente en propiedad
}

export interface ClientsPageResult {
    clients: ClientListItem[];
    totalPages: number;
    currentPage: number;
}

/**
 * Obtiene una página de clientes, buscando por nombre, DNI, teléfono o email.
 */
export async function getClientsPage(page: number = 1, query: string = ''): Promise<ClientsPageResult> {

    const session = await getServerSession(authOptions);
    if (!session) {
        return { clients: [], totalPages: 0, currentPage: 1 };
    }

    const offset = (page - 1) * CLIENT_PAGE_SIZE;
    const search = query.trim();

    // Configuración del filtro de búsqueda
    const whereClause = search.length > 0 ? {
        OR: [
            { dni: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
        ]
    } : {} as any;

    try {
        // 1. OBTENER EL TOTAL DE REGISTROS
        const totalCount = await prisma.client.count({ where: whereClause });
        const totalPages = Math.ceil(totalCount / CLIENT_PAGE_SIZE);

        // 2. OBTENER LOS CLIENTES DE LA PÁGINA ACTUAL
        const clients = await prisma.client.findMany({
            where: whereClause,
            take: CLIENT_PAGE_SIZE,
            skip: offset,
            orderBy: { lastName: 'asc' },
            select: {
                id: true,
                dni: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
                // Contar cuántos coches tienen actualmente (endDate: null)
                ownedCarsHistory: {
                    where: { endDate: null },
                    select: { id: true }
                }
            },
        });

        // 3. Mapear y formatear los resultados
        const formattedClients: ClientListItem[] = clients.map(client => ({
            id: client.id,
            dni: client.dni,
            fullName: `${client.firstName} ${client.lastName}`,
            phone: client.phone,
            email: client.email,
            activeCarsCount: client.ownedCarsHistory.length,
        }));

        return {
            clients: formattedClients,
            totalPages,
            currentPage: page,
        };

    } catch (error) {
        console.error("Error fetching clients page:", error);
        return { clients: [], totalPages: 0, currentPage: 1 };
    }
}


// ====================================================================
// B. DETALLE DEL CLIENTE Y GESTIÓN DE PROPIEDAD
// ====================================================================

// Estructura simplificada de la propiedad del coche
export interface OwnedCarInfo {
    ownershipId: string;
    carId: string;
    plate: string;
    make: string | null;
    model: string | null;
    year: number | null;
    startDate: Date;
    endDate: Date | null; // NULL si es el dueño actual
    isActive: boolean;
}

export interface ClientDetails {
    id: string;
    dni: string | null;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    carHistory: OwnedCarInfo[];
}

/**
 * Obtiene todos los detalles de un cliente, incluyendo su historial de coches.
 */
export async function getClientDetails(clientId: string): Promise<ClientDetails | null> {

    const session = await getServerSession(authOptions);
    if (!session) return null;

    try {
        const client = await prisma.client.findUnique({
            where: { id: clientId },
            include: {
                ownedCarsHistory: {
                    orderBy: { startDate: 'desc' }, // Último coche primero
                    include: {
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
            }
        });

        if (!client) return null;

        const carHistory: OwnedCarInfo[] = client.ownedCarsHistory.map(ownership => ({
            ownershipId: ownership.id,
            carId: ownership.car.id,
            plate: ownership.car.licensePlate,
            make: ownership.car.make,
            model: ownership.car.model,
            year: ownership.car.year,
            startDate: ownership.startDate,
            endDate: ownership.endDate,
            isActive: ownership.endDate === null,
        }));

        return {
            id: client.id,
            dni: client.dni,
            firstName: client.firstName,
            lastName: client.lastName,
            phone: client.phone,
            email: client.email,
            address: client.address,
            carHistory: carHistory,
        };

    } catch (error) {
        console.error("Error fetching client details:", error);
        return null;
    }
}


// ====================================================================
// C. ACCIÓN DE CAMBIO DE PROPIEDAD (ASIGNAR COCHE)
// ====================================================================

/**
 * Asigna un coche existente a un cliente, cerrando cualquier propiedad anterior si existe.
 * @param clientId ID del cliente que se convertirá en el nuevo dueño.
 * @param carId ID del vehículo a asignar.
 */
export async function assignCarToClient(clientId: string, carId: string): Promise<{ success: boolean, message: string }> {

    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') { // Solo ADMIN puede cambiar propiedad
        return { success: false, message: 'Acceso denegado.' };
    }

    try {
        const result = await prisma.$transaction(async (tx) => {

            // 1. CERRAR cualquier propiedad ACTIVA anterior del coche
            const currentOwnerships = await tx.carOwnership.findMany({
                where: {
                    carId: carId,
                    endDate: null,
                }
            });

            if (currentOwnerships.length > 0) {
                // Actualizar todas las propiedades activas para cerrar la relación
                const updatePromises = currentOwnerships.map(ownership =>
                    tx.carOwnership.update({
                        where: { id: ownership.id },
                        data: { endDate: new Date() }
                    })
                );
                await Promise.all(updatePromises);
            }

            // 2. CREAR la nueva relación de propiedad
            const newOwnership = await tx.carOwnership.create({
                data: {
                    carId: carId,
                    clientId: clientId,
                    startDate: new Date(),
                    endDate: null, // Propiedad actual
                }
            });

            return newOwnership;
        });

        // Revalidar la caché del detalle del cliente y del vehículo afectado
        revalidatePath(`/dashboard/clients/${clientId}`);
        revalidatePath(`/dashboard/cars/${carId}`);
        revalidatePath('/dashboard/cars'); // Por si se usa en el listado de coches

        return { success: true, message: `Vehículo asignado con éxito al cliente.` };

    } catch (error) {
        console.error("Error al asignar vehículo:", error);
        return { success: false, message: "Error al realizar el cambio de propiedad." };
    }
}

// Interfaz para los datos de edición
export interface UpdateClientData {
    clientId: string;
    firstName: string;
    lastName: string;
    dni: string;
    phone: string;
    email: string | null;
    address: string | null;
}

/**
 * Actualiza los datos escalares de un cliente existente.
 */
export async function updateClient(data: UpdateClientData): Promise<{ success: boolean, message: string }> {

    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return { success: false, message: 'Acceso denegado. Se requiere ser personal del taller.' };
    }

    // Normalización de datos
    const dni = data.dni.trim();
    const phone = data.phone.trim();
    const email = data.email?.trim() || null;
    const address = data.address?.trim() || null;

    try {
        // 1. CHEQUEO DE UNICIDAD (DNI y Email)
        // Buscamos si ya existe otro cliente con el mismo DNI o Email (excluyendo al cliente actual)

        const conflictingClient = await prisma.client.findFirst({
            where: {
                id: { not: data.clientId },
                OR: [
                    { dni: dni },
                    ...(email ? [{ email: email }] : []), // Solo chequea el email si no es nulo
                ]
            }
        });

        if (conflictingClient) {
            if (conflictingClient.dni === dni) {
                return { success: false, message: `Error: El DNI/CUIT ${dni} ya está registrado a nombre de otro cliente.` };
            }
            if (conflictingClient.email === email) {
                return { success: false, message: `Error: El email ${email} ya está registrado a nombre de otro cliente.` };
            }
        }

        // 2. ACTUALIZACIÓN DE DATOS
        await prisma.client.update({
            where: { id: data.clientId },
            data: {
                firstName: data.firstName.trim(),
                lastName: data.lastName.trim(),
                dni: dni,
                phone: phone,
                email: email,
                address: address,
                updatedAt: new Date(),
            }
        });

        // 3. Revalidar la caché de la página de detalle
        revalidatePath(`/dashboard/clients/${data.clientId}`);

        return { success: true, message: 'Datos del cliente actualizados con éxito.' };

    } catch (error) {
        console.error("Error al actualizar cliente:", error);
        return { success: false, message: 'Error interno al guardar los cambios.' };
    }
}

// Definición de datos editables (hacemos todos los campos opcionales)
export interface UpdateCarData {
    licensePlate?: string;
    vin?: string;
    engineNumber?: string | null;
    color?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    initialKm?: number;
}

/**
 * Actualiza los datos de un vehículo existente.
 */
export async function updateCar(carId: string, data: UpdateCarData): Promise<{ success: boolean, message: string }> {

    const session = await getServerSession(authOptions);
    // Asumimos que sólo un ADMIN o MECHANIC puede editar datos del vehículo
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return { success: false, message: 'Acceso denegado. Se requiere ser personal del taller.' };
    }

    try {
        await prisma.car.update({
            where: { id: carId },
            data: {
                // Mapeo simple de datos. Prisma maneja la validación de tipos
                licensePlate: data.licensePlate,
                vin: data.vin,
                engineNumber: data.engineNumber,
                color: data.color,
                make: data.make,
                model: data.model,
                year: data.year,
                initialKm: data.initialKm,
                // Nota: Los campos únicos (licensePlate, vin) serán validados por la DB.
            }
        });

        // Revalidar la caché de la página de detalle del coche
        revalidatePath(`/dashboard/cars/${carId}`);

        return { success: true, message: `Vehículo ${data.licensePlate || carId} actualizado con éxito.` };

    } catch (error: any) {
        console.error("Error al actualizar el vehículo:", error);
        // Manejo de error específico para campos únicos (ej: matrícula duplicada)
        if (error.code === 'P2002') {
            return { success: false, message: 'Error: La matrícula o VIN ya existe en otro vehículo.' };
        }
        return { success: false, message: 'Error interno al actualizar el vehículo.' };
    }
}