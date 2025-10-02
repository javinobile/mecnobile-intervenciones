"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import prisma from "../../lib/prisma";

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

    try {
        // 1. OBTENER DATOS DE PRISMA con la relación anidada
        const cars = await prisma.car.findMany({
            where: {
                OR: [
                    { licensePlate: { contains: search, mode: 'insensitive' } }, // Usar licensePlate
                    { make: { contains: search, mode: 'insensitive' } },
                    { model: { contains: search, mode: 'insensitive' } },
                ]
            },
            select: {
                id: true,
                licensePlate: true, // Corregido: Usar licensePlate
                make: true,
                model: true,
                // **BUSCAMOS AL DUEÑO ACTUAL a través de CarOwnership**
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
                    take: 1, // Solo necesitamos un resultado (el dueño actual)
                }
            },
            take: 10,
        });

        // 2. Mapear los resultados y concatenar el nombre del dueño
        return cars.map(car => {
            const currentOwner = car.ownershipHistory[0]?.client;

            const ownerName = currentOwner
                ? `${currentOwner.firstName} ${currentOwner.lastName}`
                : 'Cliente Desconocido'; // Si no hay un dueño con endDate=NULL

            return {
                id: car.id,
                plate: car.licensePlate, // Mapeado
                make: car.make || 'N/A',
                model: car.model || 'N/A',
                ownerName: ownerName, // Nombre concatenado
            };
        });

    } catch (error) {
        console.error("Error al buscar vehículos en la DB:", error);
        return [];
    }
}

// ====================================================================
// B. ACCIÓN DE LISTADO Y PAGINACIÓN (NUEVA)
// ====================================================================

// --- Tipos para la Paginación y el Listado ---
const PAGE_SIZE = 10; // Definimos el tamaño de la página por defecto

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
 * Se utiliza para la tabla de /dashboard/cars.
 * @param page El número de página a obtener (basado en 1).
 * @param query Opcional: término de búsqueda.
 */
export async function getCarsPage(page: number = 1, query: string = ''): Promise<CarsPageResult> {
    
    const session = await getServerSession(authOptions);
    if (!session) {
        return { cars: [], totalPages: 0, currentPage: 1 };
    }

    const offset = (page - 1) * PAGE_SIZE;
    const search = query.trim();
    
    // Configuración del filtro de búsqueda
    const whereClause = search.length > 0 ? {
        OR: [
            { licensePlate: { contains: search, mode: 'insensitive' } },
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