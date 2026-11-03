import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Calculator, PlusCircle } from 'lucide-react';
import { authOptions } from '@/auth';
import { getQuotesPage } from '@/actions/quote.actions';
import SearchForm from '@/components/clients/SearchForm';
import PaginationLink from '@/components/clients/PaginationLink';
import QuotesTable from '@/components/quotes/QuotesTable';
import QuoteStatusFilter from '@/components/quotes/QuoteStatusFilter';

interface PresupuestosPageProps {
    searchParams: Promise<{
        page?: string;
        q?: string;
        estado?: string;
    }>;
}

export default async function PresupuestosPage({ searchParams }: PresupuestosPageProps) {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role;

    if (!session || (role !== 'ADMIN' && role !== 'MECHANIC')) {
        redirect('/dashboard');
    }

    const resolved = await searchParams;
    const query = resolved.q || '';
    const estado = resolved.estado || '';
    const requestedPage = parseInt(resolved.page || '1');

    const { quotes, totalCount, totalPages, currentPage } = await getQuotesPage({
        page: requestedPage,
        query,
        status: estado,
    });

    const pageHref = (page: number) => {
        const params = new URLSearchParams();
        params.set('page', page.toString());
        if (query) params.set('q', query);
        if (estado) params.set('estado', estado);
        return `/dashboard/presupuestos?${params.toString()}`;
    };

    const hasFilters = !!(query || estado);

    return (
        <>
            <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center">
                <Calculator className="w-6 h-6 mr-2 text-blue-600" />
                Presupuestos
            </h1>
            <p className="text-sm text-gray-500 mb-4">
                Presupuestos de mano de obra, repuestos y trabajos de terceros para clientes que consultan.
            </p>

            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-3">
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:max-w-2xl">
                    <SearchForm initialQuery={query} placeholder="Buscar por Nº, cliente o dominio..." />
                    <QuoteStatusFilter value={estado} />
                </div>

                <Link
                    href="/dashboard/presupuestos/new"
                    className="flex items-center justify-center px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-green-700 transition duration-150 shrink-0"
                >
                    <PlusCircle className="w-4 h-4 mr-1.5" />
                    Nuevo presupuesto
                </Link>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                {quotes.length > 0 && <QuotesTable quotes={quotes} />}

                {quotes.length === 0 && (
                    <div className="text-center py-8 text-sm text-gray-500">
                        {hasFilters
                            ? 'No se encontraron presupuestos que coincidan con la búsqueda.'
                            : 'Todavía no hay presupuestos.'}
                    </div>
                )}

                {totalPages > 1 && (
                    <div className="flex justify-between items-center pt-3 border-t border-gray-200 mt-4">
                        <p className="text-sm text-gray-700">
                            Página {currentPage} de {totalPages} · {totalCount} presupuestos
                        </p>
                        <div className="flex space-x-2">
                            <PaginationLink
                                page={currentPage - 1}
                                disabled={currentPage <= 1}
                                query={query}
                                label="Anterior"
                                iconType="left"
                                href={pageHref(currentPage - 1)}
                            />
                            <PaginationLink
                                page={currentPage + 1}
                                disabled={currentPage >= totalPages}
                                query={query}
                                label="Siguiente"
                                iconType="right"
                                href={pageHref(currentPage + 1)}
                            />
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
