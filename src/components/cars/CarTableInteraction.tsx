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
        <main className="flex-grow p-8 bg-gray-50">
            {/* Barra de Herramientas: Búsqueda y Botón Añadir (Se puede simplificar) */}
            <div className="flex justify-between items-center mb-6">
                <SearchForm initialQuery={query} />

                <Link href="/dashboard/cars/new" legacyBehavior>
                    <a className="flex items-center px-4 py-2 bg-green-600 text-white font-medium rounded-lg shadow-md hover:bg-green-700 transition duration-150">
                        {/* El icono PlusCircle ya fue importado en page.tsx, pero lo necesitamos aquí */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
                        Nuevo Vehículo
                    </a>
                </Link>
            </div>

            {/* Tabla de Listado de Vehículos */}
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <CarsTable cars={cars} />

                {/* Paginación */}
                {totalPages > 1 && (
                    <div className="flex justify-between items-center pt-4 border-t border-gray-200 mt-6">
                        <p className="text-sm text-gray-700">Página {currentPage} de {totalPages}</p>
                        <div className="flex space-x-3">
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
                    <div className="text-center py-10 text-gray-500">
                        No se encontraron vehículos que coincidan con la búsqueda.
                    </div>
                )}
                {cars.length === 0 && query.length === 0 && (
                    <div className="text-center py-10 text-gray-500">
                        No hay vehículos registrados.
                    </div>
                )}
            </div>
        </main>
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
        <form onSubmit={handleSubmit} className="flex items-center space-x-3 w-full max-w-md">
            <input
                type="text"
                name="q"
                placeholder="Buscar por Matrícula, Marca o Cliente..."
                defaultValue={initialQuery}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 transition duration-150 text-gray-800"
            />
            <button
                type="submit"
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-150"
            >
                <Search className="w-5 h-5" />
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matrícula</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marca y Modelo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Propietario</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {cars.map((car) => (
                    <tr key={car.id} className="hover:bg-gray-50 transition duration-100">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {car.plate}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {car.make || 'S/M'} {car.model || 'S/M'} ({car.year || 'N/A'})
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {car.ownerName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <Link href={`/dashboard/cars/${car.id}`} legacyBehavior>
                                <a className="text-blue-600 hover:text-blue-900 transition duration-150 mr-4">Ver Detalle</a>
                            </Link>
                            <Link href={`/dashboard/interventions/new?carId=${car.id}`} legacyBehavior>
                                <a className="text-purple-600 hover:text-purple-900 transition duration-150">Abrir OT</a>
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
        <Link href={href} legacyBehavior>
            <a
                className={`flex items-center px-4 py-2 border rounded-lg text-sm font-medium transition duration-150 ${disabled
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-white text-blue-600 border-blue-600 hover:bg-blue-50 hover:border-blue-700'
                    }`}
                aria-disabled={disabled}
                onClick={(e) => disabled && e.preventDefault()}
            >
                {label === 'Anterior' && Icon && <Icon className="w-4 h-4 mr-2" />}
                {label}
                {label === 'Siguiente' && Icon && <Icon className="w-4 h-4 ml-2" />}
            </a>
        </Link>
    );
}