// app/(dashboard)/cars/page.tsx
// ¡SIN 'use client' - Es un Server Component!

import { getCarsPage } from '@/actions/car.actions';
import CarTableInteraction from '@/components/cars/CarTableInteraction';
import { Car } from 'lucide-react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { redirect } from 'next/navigation';

interface CarsPageProps {
    searchParams: {
        page?: string;
        q?: string;
    };
}

// Función ASÍNCRONA
export default async function CarsPage({ searchParams }: CarsPageProps) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        redirect('/dashboard');
    }

    const resolved = await searchParams;
    
    const currentPage = parseInt(resolved.page || '1');
    const query = resolved.q || '';
    
    // 1. Obtener datos en el servidor
    const { cars, totalPages } = await getCarsPage(currentPage, query);
    
    return (
        <>
            
            <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center">
                <Car className="w-6 h-6 mr-2 text-blue-600" />
                Gestión de Automóviles
            </h1>
            <p className="text-sm text-gray-500 mb-4">
                Registro y búsqueda de vehículos del taller.
            </p>

            <CarTableInteraction 
                cars={cars}
                totalPages={totalPages}
                currentPage={currentPage}
                query={query}
            />
            
        </>
    );
}