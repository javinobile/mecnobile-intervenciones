// app/dashboard/clients/page.tsx
import Link from 'next/link';
import { User, PlusCircle } from 'lucide-react';
import { getClientsPage } from '@/actions/client.actions';
import SearchForm from '@/components/clients/SearchForm';
import ClientsTable from '@/components/clients/ClientsTable';
import PaginationLink from '@/components/clients/PaginationLink';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { redirect } from 'next/navigation';

interface ClientsPageProps {
    searchParams: {
        page?: string;
        q?: string;
    };
}

// Convertimos la función en ASÍNCRONA
export default async function ClientsPage({ searchParams }: ClientsPageProps) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        redirect('/dashboard');
    }

    const search = await searchParams;

    const currentPage = parseInt(search.page || '1');
    const query = search.q || '';

    // 1. OBTENER DATOS REALES en el servidor
    const { clients, totalPages } = await getClientsPage(currentPage, query);

    const isFirstPage = currentPage <= 1;
    const isLastPage = currentPage >= totalPages;

    return (
        <>

            <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center">
                <User className="w-6 h-6 mr-2 text-blue-600" />
                Gestión de Clientes
            </h1>
            <p className="text-sm text-gray-500 mb-4">
                Listado y búsqueda de propietarios registrados.
            </p>

            <div className="flex justify-between items-center mb-4 gap-3">
                <SearchForm initialQuery={query} />

                <Link
                    href="/dashboard/cars/new"
                    className="flex items-center px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-green-700 transition duration-150 shrink-0"
                >
                    <PlusCircle className="w-4 h-4 mr-1.5" />
                    Nuevo Cliente (vía Coche)
                </Link>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <ClientsTable clients={clients} />

                {totalPages > 1 && (
                    <div className="flex justify-between items-center pt-3 border-t border-gray-200 mt-4">
                        <p className="text-sm text-gray-700">Página {currentPage} de {totalPages}</p>
                        <div className="flex space-x-2">
                            <PaginationLink
                                page={currentPage - 1}
                                disabled={isFirstPage}
                                query={query}
                                label="Anterior"
                                iconType="left"
                            />
                            <PaginationLink
                                page={currentPage + 1}
                                disabled={isLastPage}
                                query={query}
                                label="Siguiente"
                                iconType="right"
                            />
                        </div>
                    </div>
                )}
                {clients.length === 0 && (
                    <div className="text-center py-8 text-sm text-gray-500">
                        No se encontraron clientes que coincidan con la búsqueda.
                    </div>
                )}
            </div>
        </>
    );
}

