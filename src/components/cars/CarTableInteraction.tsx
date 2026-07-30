// app/components/cars/CarTableInteraction.tsx
'use client'; // ¡IMPORTANTE! Esto lo convierte en un componente de cliente

import Link from 'next/link';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CarListItem } from '@/actions/car.actions';

// Componente principal que recibe los datos
export default function CarTableInteraction({ cars, totalPages, currentPage, query }: {
    cars: CarListItem[];
    totalPages: number;
    currentPage: number;
    query: string;
}) {

    const isFirstPage = currentPage <= 1;
    const isLastPage = currentPage >= totalPages;

    return (
        <div>
            <div className="flex justify-between items-center mb-4 gap-3">
                <SearchForm initialQuery={query} />
                <Link href="/dashboard/cars/new" className="flex items-center px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-green-700 transition duration-150 shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
                    Nuevo Vehículo
                </Link>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <CarsTable cars={cars} />

                {totalPages > 1 && (
                    <div className="flex justify-between items-center pt-3 border-t border-gray-200 mt-4">
                        <p className="text-sm text-gray-700">Página {currentPage} de {totalPages}</p>
                        <div className="flex space-x-2">
                            <PaginationLink
                                page={currentPage - 1}
                                disabled={isFirstPage}
                                query={query}
                                label="Anterior"
                                icon={ChevronLeft}
                            />
                            <PaginationLink
                                page={currentPage + 1}
                                disabled={isLastPage}
                                query={query}
                                label="Siguiente"
                                icon={ChevronRight}
                            />
                        </div>
                    </div>
                )}
                {cars.length === 0 && query.length > 0 && (
                    <div className="text-center py-8 text-sm text-gray-500">
                        No se encontraron vehículos que coincidan con la búsqueda.
                    </div>
                )}
                {cars.length === 0 && query.length === 0 && (
                    <div className="text-center py-8 text-sm text-gray-500">
                        No hay vehículos registrados.
                    </div>
                )}
            </div>
        </div>
    );
}


// --- Componente de Búsqueda (Usa hooks de cliente) ---
function SearchForm({ initialQuery }: { initialQuery: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const q = formData.get('q') as string;

        const params = new URLSearchParams(searchParams.toString());

        // Si la búsqueda está vacía, eliminamos 'q' de la URL
        if (q.trim() === '') {
            params.delete('q');
        } else {
            params.set('q', q.trim());
        }

        params.set('page', '1');

        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <form onSubmit={handleSubmit} className="flex items-center space-x-2 w-full max-w-md">
            <input
                type="text"
                name="q"
                placeholder="Buscar por Matrícula, Marca o Cliente..."
                defaultValue={initialQuery}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition duration-150 text-gray-800"
            />
            <button
                type="submit"
                className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-150"
            >
                <Search className="w-4 h-4" />
            </button>
        </form>
    );
}

// --- Componente de la Tabla ---
function CarsTable({ cars }: { cars: CarListItem[] }) {
    // Es un sub-componente de cliente, no necesita 'use client' explícito
    return (
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matrícula</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marca y Modelo</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Propietario</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {cars.map((car) => (
                    <tr key={car.id} className="hover:bg-gray-50 transition duration-100">
                        <td className="px-3 py-2.5 whitespace-nowrap text-sm font-medium text-gray-900">
                            {car.plate}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-500">
                            {car.make || 'S/M'} {car.model || 'S/M'} ({car.year || 'N/A'})
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-500">
                            {car.ownerName}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-right text-sm font-medium">
                            <Link
                                href={`/dashboard/cars/${car.id}`}
                                className="text-blue-600 hover:text-blue-900 transition duration-150 mr-3"
                            >
                                Ver Detalle
                            </Link>
                            <Link
                                href={`/dashboard/interventions/new?carId=${car.id}`}
                                className="text-purple-600 hover:text-purple-900 transition duration-150"
                            >
                                Abrir OT
                            </Link>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// --- Componente de Paginación (Usa Link de next/link) ---
function PaginationLink({ page, disabled, query, label, icon: Icon }: { page: number, disabled: boolean, query: string, label: string, icon: any }) {
    // Componente de cliente debido al 'onClick' y a la necesidad de 'use client' en el padre.

    // Construye la URL de paginación
    const params = new URLSearchParams();
    params.set('page', page.toString());
    if (query) {
        params.set('q', query);
    }
    const href = `/dashboard/cars?${params.toString()}`;

    return (
        <Link
            href={href}
            className={`flex items-center px-3 py-1.5 border rounded-md text-sm font-medium transition duration-150 ${disabled
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50 hover:border-blue-700'
                }`}
            aria-disabled={disabled}
            onClick={(e) => { if (disabled) e.preventDefault(); }}
        >
            {label === 'Anterior' && Icon && <Icon className="w-4 h-4 mr-2" />}
            {label}
            {label === 'Siguiente' && Icon && <Icon className="w-4 h-4 ml-2" />}
        </Link>
    );
}