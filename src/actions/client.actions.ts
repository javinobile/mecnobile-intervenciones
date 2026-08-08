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
    if (!session || session.user.role !== 'ADMIN') {
        return { clients: [], totalPages: 0, currentPage: 1 };
    }

    const offset = (page - 1) * CLIENT_PAGE_SIZE;
    const search = query.trim();

    // Búsqueda blanda: cada palabra debe aparecer en algún campo
    // ("nobile javier" encuentra a Javier Nobile)
    const tokens = search.length > 0
        ? search.split(/\s+/).map((t) => t.trim()).filter(Boolean)
        : [];

    const tokenClause = (token: string) => ({
        OR: [
            { dni: { contains: token, mode: 'insensitive' as const } },
            { firstName: { contains: token, mode: 'insensitive' as const } },
            { lastName: { contains: token, mode: 'insensitive' as const } },
            { phone: { contains: token, mode: 'insensitive' as const } },
            { email: { contains: token, mode: 'insensitive' as const } },
        ],
    });

    const whereClause = tokens.length === 0
        ? {}
        : tokens.length === 1
            ? tokenClause(tokens[0])
            : { AND: tokens.map(tokenClause) };

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

    const { canEditMasterRecord } = await import('@/lib/auth-guards');
    if (!(await canEditMasterRecord(session.user.role, { clientId: data.clientId }))) {
        return { success: false, message: 'Solo se puede editar el propietario mientras tenga una OT abierta, o siendo administrador.' };
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
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return { success: false, message: 'Acceso denegado. Se requiere ser personal del taller.' };
    }

    const { canEditMasterRecord } = await import('@/lib/auth-guards');
    if (!(await canEditMasterRecord(session.user.role, { carId }))) {
        return { success: false, message: 'Solo se puede editar el vehículo mientras tenga una OT abierta, o siendo administrador.' };
    }

    try {
        const dataToSave = { ...data };
        if (data.licensePlate) {
            const { validateNewLicensePlate } = await import('../../lib/utils');
            const { findCarIdByNormalizedPlateExact } = await import('../../lib/plate-search');
            const plateValidation = validateNewLicensePlate(data.licensePlate);
            if (!plateValidation.ok || !plateValidation.plate) {
                return { success: false, message: plateValidation.message || 'Patente inválida.' };
            }
            const existingId = await findCarIdByNormalizedPlateExact(plateValidation.plate);
            if (existingId && existingId !== carId) {
                return { success: false, message: 'Error: La matrícula ya existe en otro vehículo.' };
            }
            dataToSave.licensePlate = plateValidation.plate;
        }

        await prisma.car.update({
            where: { id: carId },
            data: {
                licensePlate: dataToSave.licensePlate,
                vin: data.vin,
                engineNumber: data.engineNumber,
                color: data.color,
                make: data.make,
                model: data.model,
                year: data.year,
                initialKm: data.initialKm,
            }
        });

        revalidatePath(`/dashboard/cars/${carId}`);

        return { success: true, message: `Vehículo ${dataToSave.licensePlate || carId} actualizado con éxito.` };

    } catch (error: any) {
        console.error("Error al actualizar el vehículo:", error);
        if (error.code === 'P2002') {
            return { success: false, message: 'Error: La matrícula o VIN ya existe en otro vehículo.' };
        }
        return { success: false, message: 'Error interno al actualizar el vehículo.' };
    }
}