// app/dashboard/clients/page.tsx
import Link from 'next/link';
import { User, PlusCircle } from 'lucide-react';
import { getClientsPage } from '@/actions/client.actions';
import SearchForm from '@/components/clients/SearchForm';
import ClientsTable from '@/components/clients/ClientsTable';
import PaginationLink from '@/components/clients/PaginationLink';

interface ClientsPageProps {
    searchParams: {
        page?: string;
        q?: string;
    };
}

// Convertimos la función en ASÍNCRONA
export default async function ClientsPage({ searchParams }: ClientsPageProps) {

    const currentPage = parseInt(searchParams.page || '1');
    const query = searchParams.q || '';

    // 1. OBTENER DATOS REALES en el servidor
    const { clients, totalPages } = await getClientsPage(currentPage, query);

    const isFirstPage = currentPage <= 1;
    const isLastPage = currentPage >= totalPages;

    return (
        <>

            <h1 className="text-4xl font-extrabold text-gray-900 mb-2 flex items-center">
                <User className="w-8 h-8 mr-3 text-blue-600" />
                Gestión de Clientes (Propietarios)
            </h1>
            <p className="text-gray-500 mb-8">
                Listado y búsqueda de todos los propietarios registrados.
            </p>

            {/* Barra de Herramientas: Búsqueda y Botón Añadir (Opcional, se crean al registrar coche) */}
            <div className="flex justify-between items-center mb-6">
                <SearchForm initialQuery={query} />

                {/* Botón para registrar un nuevo coche (que registra un cliente) */}
                <Link href="/dashboard/cars/new" legacyBehavior>
                    <a className="flex items-center px-4 py-2 bg-green-600 text-white font-medium rounded-lg shadow-md hover:bg-green-700 transition duration-150">
                        <PlusCircle className="w-5 h-5 mr-2" />
                        Nuevo Cliente (vía Coche)
                    </a>
                </Link>
            </div>

            {/* Tabla de Listado de Clientes */}
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <ClientsTable clients={clients} />

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
                                iconType="left" // <-- PASA UNA CADENA DE TEXTO SIMPLE
                            />
                            <PaginationLink
                                page={currentPage + 1}
                                disabled={isLastPage}
                                query={query}
                                label="Siguiente"
                                iconType="right" // <-- PASA UNA CADENA DE TEXTO SIMPLE
                            />
                        </div>
                    </div>
                )}
                {clients.length === 0 && (
                    <div className="text-center py-10 text-gray-500">
                        No se encontraron clientes que coincidan con la búsqueda.
                    </div>
                )}
            </div>
        </>
    );
}

