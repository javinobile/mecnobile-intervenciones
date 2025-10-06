// app/(dashboard)/cars/page.tsx
// ¡SIN 'use client' - Es un Server Component!

import { getCarsPage } from '@/actions/car.actions';
import CarTableInteraction from '@/components/cars/CarTableInteraction';
import { PlusCircle, Car } from 'lucide-react'; 

interface CarsPageProps {
    searchParams: {
        page?: string;
        q?: string;
    };
}

// Función ASÍNCRONA
export default async function CarsPage({ searchParams }: CarsPageProps) {
    
    const currentPage = parseInt(searchParams.page || '1');
    const query = searchParams.q || '';
    
    // 1. Obtener datos en el servidor
    const { cars, totalPages } = await getCarsPage(currentPage, query);
    
    return (
        <>
            
            <h1 className="text-4xl font-extrabold text-gray-900 mb-2 flex items-center">
                <Car className="w-8 h-8 mr-3 text-blue-600" />
                Gestión de Automóviles
            </h1>
            <p className="text-gray-500 mb-8">
                Registro y búsqueda de vehículos del taller.
            </p>

            {/* Renderiza el componente de cliente, pasándole los datos del servidor */}
            <CarTableInteraction 
                cars={cars}
                totalPages={totalPages}
                currentPage={currentPage}
                query={query}
            />
            
        </>
    );
}