"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import prisma from "../../lib/prisma";
import { revalidatePath } from "next/cache";
import { Car, Client, InterventionStatus } from "../../generated/prisma";
import { normalizeLicensePlate } from "../../lib/utils";

// IMPORTACIÓN CLAVE: Función para normalizar matrículas


// ====================================================================
// A. ACCIONES DE BÚSQUEDA Y LISTADO DE VEHÍCULOS
// ====================================================================

// --- Tipos para la respuesta de búsqueda ---
interface CarSearchResult {
    id: string;
    plate: string;
    make: string;
    model: string;
    ownerName: string; // Nombre del Cliente/Dueño
}

/**
 * Busca vehículos por matrícula, marca o modelo.
 * Se utiliza para el componente de cliente que selecciona el coche para una OT.
 * @param searchTerm La cadena de texto a buscar.
 * @returns Una promesa que resuelve a un array de resultados de coches.
 */
export async function getCarsForSearch(searchTerm: string): Promise<CarSearchResult[]> {

    const session = await getServerSession(authOptions);
    if (!session) {
        console.error("Acceso denegado: Usuario no autenticado.");
        return [];
    }

    const search = searchTerm.trim();
    if (search.length < 3) return [];

    // NORMALIZACIÓN: Aplicamos la normalización al término de búsqueda para la patente
    const normalizedSearch = normalizeLicensePlate(search);

    try {
        // 1. OBTENER DATOS DE PRISMA con la relación anidada
        const cars = await prisma.car.findMany({
            where: {
                OR: [
                    // USAR EL TÉRMINO NORMALIZADO para la búsqueda de la patente
                    { licensePlate: { contains: normalizedSearch, mode: 'insensitive' } }, 
                    // Para otros campos, se puede usar el término original
                    { make: { contains: search, mode: 'insensitive' } },
                    { model: { contains: search, mode: 'insensitive' } },
                ]
            },
            select: {
                id: true,
                licensePlate: true, 
                make: true,
                model: true,
                ownershipHistory: {
                    where: {
                        endDate: null, // Condición: El cliente es el dueño actual
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
            },
            take: 10,
        });

        // 2. Mapear los resultados
        return cars.map(car => {
            const currentOwner = car.ownershipHistory[0]?.client;

            const ownerName = currentOwner
                ? `${currentOwner.firstName} ${currentOwner.lastName}`
                : 'Cliente Desconocido'; 

            return {
                id: car.id,
                plate: car.licensePlate, 
                make: car.make || 'N/A',
                model: car.model || 'N/A',
                ownerName: ownerName, 
            };
        });

    } catch (error) {
        console.error("Error al buscar vehículos en la DB:", error);
        return [];
    }
}

// ====================================================================
// B. ACCIÓN DE LISTADO Y PAGINACIÓN
// ====================================================================

// --- Tipos para la Paginación y el Listado ---
const PAGE_SIZE = 10; 

export interface CarListItem {
    id: string;
    plate: string;
    make: string | null;
    model: string | null;
    year: number | null;
    ownerName: string;
}

export interface CarsPageResult {
    cars: CarListItem[];
    totalPages: number;
    currentPage: number;
}

/**
 * Obtiene una página de vehículos del taller, incluyendo el dueño actual.
 */
export async function getCarsPage(page: number = 1, query: string = ''): Promise<CarsPageResult> {

    const session = await getServerSession(authOptions);
    if (!session) {
        return { cars: [], totalPages: 0, currentPage: 1 };
    }

    const offset = (page - 1) * PAGE_SIZE;
    const search = query.trim();

    // NORMALIZACIÓN: Aplicamos la normalización al query para la patente
    const normalizedSearch = normalizeLicensePlate(search);

    // Configuración del filtro de búsqueda
    const whereClause = search.length > 0 ? {
        OR: [
            // USAR EL TÉRMINO NORMALIZADO para la búsqueda de la patente
            { licensePlate: { contains: normalizedSearch, mode: 'insensitive' } },
            { make: { contains: search, mode: 'insensitive' } },
            { model: { contains: search, mode: 'insensitive' } },
        ]
    } : {} as any;

    try {
        // 1. OBTENER EL TOTAL DE REGISTROS para calcular totalPages
        const totalCount = await prisma.car.count({ where: whereClause });
        const totalPages = Math.ceil(totalCount / PAGE_SIZE);

        // 2. OBTENER LOS VEHÍCULOS DE LA PÁGINA ACTUAL
        const cars = await prisma.car.findMany({
            where: whereClause,
            take: PAGE_SIZE,
            skip: offset,
            orderBy: {
                licensePlate: 'asc',
            },
            select: {
                id: true,
                licensePlate: true,
                make: true,
                model: true,
                year: true,
                // Búsqueda del Dueño Actual (Client)
                ownershipHistory: {
                    where: { endDate: null },
                    select: {
                        client: {
                            select: { firstName: true, lastName: true }
                        }
                    },
                    take: 1,
                }
            },
        });

        // 3. Mapear y formatear los resultados
        const formattedCars: CarListItem[] = cars.map(car => {
            const currentOwner = car.ownershipHistory[0]?.client;

            const ownerName = currentOwner
                ? `${currentOwner.firstName} ${currentOwner.lastName}`
                : 'Cliente Desconocido';

            return {
                id: car.id,
                plate: car.licensePlate,
                make: car.make,
                model: car.model,
                year: car.year,
                ownerName: ownerName,
            };
        });

        return {
            cars: formattedCars,
            totalPages,
            currentPage: page,
        };

    } catch (error) {
        console.error("Error fetching cars page:", error);
        return { cars: [], totalPages: 0, currentPage: 1 };
    }
}

// ====================================================================
// C. ACCIÓN DE CREACIÓN (createClientAndCar)
// ====================================================================

// --- Tipos de Datos para el Formulario ---
interface NewCarFormData {
    // Cliente
    ownerName: string;
    ownerPhone: string;
    ownerEmail: string;
    ownerDni: string;
    // Vehículo
    plate: string;
    vin: string; 
    make: string;
    model: string;
    year: string;
    color: string;
    km: string;
}

interface CreationResponse {
    success: boolean;
    message: string;
    carId?: string;
    clientId?: string;
}

/**
 * Procesa el registro de un nuevo vehículo, buscando/creando el cliente
 * y estableciendo la relación de propiedad actual.
 */
export async function createClientAndCar(data: NewCarFormData): Promise<CreationResponse> {

    // ... (Seguridad, Validación y Parseo de Cliente) ...
    const nameParts = data.ownerName.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const dni = data.ownerDni.trim();

    const year = parseInt(data.year);
    const initialKm = parseInt(data.km);

    // **********************************************
    // * LÓGICA DE NORMALIZACIÓN ESTRICTA *
    // **********************************************

    // 1. Normalizar Matrícula: Reemplazar por la función reutilizable
    const plate = normalizeLicensePlate(data.plate);

    // 2. Normalizar VIN: Eliminar espacios y convertir a mayúsculas
    const vin = data.vin.trim().replace(/\s/g, '').toUpperCase();

    // **********************************************

    if (!firstName || !lastName || !data.ownerPhone || !dni ||
        !plate || !vin || !data.make || !data.model || isNaN(year) || isNaN(initialKm))
    {
        return { success: false, message: 'Faltan campos requeridos o son inválidos (DNI, Matrícula o VIN).' };
    }

    try {
        const result = await prisma.$transaction(async (tx) => {

            let client: Client | null = null;
            let car: Car | null = null;

            // --- A. GESTIÓN DEL CLIENTE (sin cambios) ---

            // 1. BUSCAR por DNI (Método más confiable)
            client = await tx.client.findUnique({ where: { dni: dni } });

            // 2. Si no se encontró por DNI, buscar por Email
            if (!client && data.ownerEmail) {
                client = await tx.client.findUnique({ where: { email: data.ownerEmail } });
            }

            // 3. Crear o Actualizar el cliente si no existe
            if (!client) {
                client = await tx.client.create({
                    data: {
                        firstName: firstName,
                        lastName: lastName,
                        phone: data.ownerPhone,
                        email: data.ownerEmail || null,
                        dni: dni,
                        address: null,
                    }
                });
            } else {
                await tx.client.update({
                    where: { id: client.id },
                    data: {
                        firstName: firstName,
                        lastName: lastName,
                        phone: data.ownerPhone,
                        email: data.ownerEmail || client.email,
                    }
                });
            }


            // --- B. GESTIÓN DEL VEHÍCULO (VERIFICACIÓN DE DUPLICADOS) ---

            // 1. Buscar el coche por Matrícula NORMALIZADA
            car = await tx.car.findUnique({ where: { licensePlate: plate } });

            // 2. Si no se encontró por Matrícula, buscar por VIN NORMALIZADO
            if (!car) {
                car = await tx.car.findUnique({ where: { vin: vin } });
            }

            // 3. EVITAR DUPLICADO: Si el coche ya existe, abortar
            if (car) {
                // Identificamos el campo en conflicto para un mensaje claro
                const conflictField = car.licensePlate === plate ? `matrícula ${plate}` : `VIN ${vin}`;

                // Chequeamos si es un intento de registrar el mismo coche y el mismo dueño
                const isSameOwner = await tx.carOwnership.findFirst({
                    where: {
                        carId: car.id,
                        clientId: client.id,
                        endDate: null,
                    }
                });

                if (isSameOwner) {
                    // El coche ya existe y el dueño es el mismo (notificación)
                    throw new Error(`Error: El vehículo con ${conflictField} ya está registrado a nombre de este cliente.`);
                } else {
                    // El coche existe pero el dueño es diferente (duplicado REAL)
                    throw new Error(`Error: El identificador ${conflictField} ya está registrado a nombre de otro cliente. Por favor, revise los datos.`);
                }
            }

            // 4. Crear el nuevo vehículo
            car = await tx.car.create({
                data: {
                    licensePlate: plate, // USAR EL VALOR NORMALIZADO
                    vin: vin, 
                    engineNumber: null,
                    color: data.color || null,
                    make: data.make,
                    model: data.model,
                    year: year,
                    initialKm: initialKm,
                }
            });

            // --- C. ESTABLECER PROPIEDAD ACTUAL (sin cambios) ---
            await tx.carOwnership.create({
                data: {
                    carId: car.id,
                    clientId: client.id,
                    startDate: new Date(),
                    endDate: null, // Dueño Actual
                }
            });

            return { car, client };
        });

        // ... (Revalidar y respuesta de éxito) ...
        revalidatePath('/dashboard/cars');

        return {
            success: true,
            message: `Vehículo ${result.car.licensePlate} registrado y vinculado a ${result.client.firstName} ${result.client.lastName}.`,
            carId: result.car.id,
            clientId: result.client.id,
        };

    } catch (error: any) {
        console.error('Error al crear cliente y vehículo:', error);
        const errorMessage = error.message.includes('Error:')
            ? error.message.replace('Error: ', '')
            : 'Error interno del servidor al registrar.';
        return { success: false, message: errorMessage };
    }
}

// ====================================================================
// D. ACCIÓN DE ACTUALIZACIÓN (updateCar)
// ====================================================================

// --- Tipos para la Actualización ---
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

    let updateData: any = { ...data };

    // 1. NORMALIZAR LA PATENTE SI SE ESTÁ ACTUALIZANDO
    if (data.licensePlate) {
        updateData.licensePlate = normalizeLicensePlate(data.licensePlate);
    }
    
    // 2. Normalizar VIN si existe
    if (data.vin) {
        updateData.vin = data.vin.toUpperCase().replace(/\s/g, '');
    }

    try {
        await prisma.car.update({
            where: { id: carId },
            data: updateData // USAR LOS DATOS NORMALIZADOS
        });

        // Revalidar la caché de la página de detalle del coche
        revalidatePath(`/dashboard/cars/${carId}`);
        
        return { success: true, message: `Vehículo actualizado con éxito.` };

    } catch (error: any) {
        console.error("Error al actualizar el vehículo:", error);
        // Manejo de error específico para campos únicos (ej: matrícula duplicada)
        if (error.code === 'P2002') {
             return { success: false, message: 'Error: La matrícula o VIN ya existe en otro vehículo.' };
        }
        return { success: false, message: 'Error interno al actualizar el vehículo.' };
    }
}

// ====================================================================
// E. DETALLE DEL VEHÍCULO
// ====================================================================

// Estructura simplificada del historial de OT
export interface InterventionHistoryItem {
    id: string;
    otNumber: number;
    description: string;
    status: InterventionStatus; // Usamos el enum de Prisma
    createdAt: Date;
    mileageKm: number;
    performedBy: {
        name: string;
    } | null;
}

// Estructura simplificada de la propiedad
export interface CurrentOwnerInfo {
    id: string;
    firstName: string;
    lastName: string;
    dni: string | null;
    phone: string | null;
    email: string | null;
}

export interface CarDetails {
    car: Car; // Detalles básicos del vehículo
    currentOwner: CurrentOwnerInfo | null;
    interventions: InterventionHistoryItem[];
}

/**
 * Obtiene todos los detalles de un vehículo, incluyendo el dueño actual y su historial de OTs.
 */
export async function getCarDetails(carId: string): Promise<CarDetails | null> {

    const session = await getServerSession(authOptions);
    if (!session) {
        return null; // Acceso denegado
    }

    try {
        const carData = await prisma.car.findUnique({
            where: { id: carId },
            // Incluir todas las relaciones necesarias en una sola consulta
            include: {
                // 1. Dueño Actual
                ownershipHistory: {
                    where: { endDate: null }, // Dueño actual (endDate es NULL)
                    select: {
                        client: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                dni: true,
                                phone: true,
                                email: true,
                            }
                        }
                    },
                    take: 1,
                },
                // 2. Historial de Intervenciones (OTs)
                interventions: {
                    orderBy: { createdAt: 'desc' }, // Ordenar por la más reciente primero
                    select: {
                        id: true,
                        otNumber: true,
                        description: true,
                        status: true,
                        createdAt: true,
                        mileageKm: true,
                        performedBy: { // Datos del Staff que abrió la OT
                            select: {
                                name: true
                            }
                        }
                    }
                }
            }
        });

        if (!carData) {
            return null;
        }

        // Mapear el Dueño Actual
        const currentOwnerRecord = carData.ownershipHistory[0]?.client;
        const currentOwner: CurrentOwnerInfo | null = currentOwnerRecord
            ? {
                id: currentOwnerRecord.id,
                firstName: currentOwnerRecord.firstName,
                lastName: currentOwnerRecord.lastName,
                dni: currentOwnerRecord.dni,
                phone: currentOwnerRecord.phone,
                email: currentOwnerRecord.email,
            }
            : null;

        // Mapear el Historial de Intervenciones
        const interventions: InterventionHistoryItem[] = carData.interventions.map(i => ({
            id: i.id,
            otNumber: i.otNumber,
            description: i.description,
            status: i.status,
            createdAt: i.createdAt,
            mileageKm: i.mileageKm,
            performedBy: (i.performedBy && i.performedBy.name !== null) ? { name: i.performedBy.name } : null,
        }));

        // Devolver el objeto final consolidado
        return {
            car: carData,
            currentOwner,
            interventions,
        };

    } catch (error) {
        console.error("Error al obtener detalles del vehículo:", error);
        return null;
    }
}

// ====================================================================
// F. ACCIONES DE CLIENTES (MANTENIDAS)
// ====================================================================

const CLIENT_PAGE_SIZE = 10;

export interface ClientListItem {
    id: string;
    dni: string | null;
    fullName: string;
    phone: string | null;
    email: string | null;
    activeCarsCount: number; 
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
// G. DETALLE DEL CLIENTE Y GESTIÓN DE PROPIEDAD
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
// H. ACCIÓN DE CAMBIO DE PROPIEDAD (ASIGNAR COCHE)
// ====================================================================

/**
 * Asigna un coche existente a un cliente, cerrando cualquier propiedad anterior si existe.
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