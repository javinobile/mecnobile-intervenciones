// app/(dashboard)/interventions/page.tsx
import Link from 'next/link';
import { Wrench, PlusCircle, Clock, CheckCircle, XCircle, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { getInterventionsPage, InterventionListItem } from '@/actions/intervention.actions';
import InterventionsSearchForm from '@/components/interventions/InterventionsSearchForm';
import OtTotalsSummary from '@/components/interventions/OtTotalsSummary';
import { getWorkshopSettings } from '@/actions/settings.actions';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

interface InterventionsPageProps {
    searchParams: Promise<{
        page?: string;
        q?: string;
        status?: string;
        from?: string;
        to?: string;
        range?: string;
        dateMode?: string;
    }>;
}

export default async function InterventionsPage({ searchParams }: InterventionsPageProps) {
    const resolved = await searchParams;
    const session = await getServerSession(authOptions);
    const isAdmin = session?.user?.role === 'ADMIN';

    const requestedPage = parseInt(resolved.page || '1');
    const query = resolved.q || '';
    const status = resolved.status || '';
    const dateFrom = isAdmin ? (resolved.from || '') : '';
    const dateTo = isAdmin ? (resolved.to || '') : '';
    const range = isAdmin ? (resolved.range || '') : '';
    const dateMode = isAdmin && resolved.dateMode === 'open' ? 'open' : 'close';

    const workshopSettings = isAdmin ? await getWorkshopSettings() : null;

    const { interventions, totalPages, currentPage, totalCount, totalCost, totalLaborCost } = await getInterventionsPage(
        requestedPage,
        query,
        status,
        dateFrom,
        dateTo,
        dateMode
    );

    const isFirstPage = currentPage <= 1;
    const isLastPage = currentPage >= totalPages;
    const hasFilters = !!(query || status || dateFrom || dateTo);

    const pageHref = (page: number) => {
        const params = new URLSearchParams();
        params.set('page', page.toString());
        if (query) params.set('q', query);
        if (status) params.set('status', status);
        if (dateFrom) params.set('from', dateFrom);
        if (dateTo) params.set('to', dateTo);
        if (range) params.set('range', range);
        if (dateMode) params.set('dateMode', dateMode);
        return `/dashboard/interventions?${params.toString()}`;
    };

    const getStatusBadge = (item: InterventionListItem) => {
        switch (item.displayStatus) {
            case 'ABIERTA':
                return (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <Clock className="w-3.5 h-3.5 mr-1" /> Abierta
                    </span>
                );
            case 'CERRADA':
                return (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Cerrada
                    </span>
                );
            case 'CANCELADA':
                return (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Cancelada
                    </span>
                );
            case 'PENDIENTE_CANCELACION':
                return (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-900">
                        <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Pend. cancelación
                    </span>
                );
            default:
                return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Desconocido</span>;
        }
    };

    const formatDate = (date: Date) =>
        new Date(date).toLocaleDateString('es-AR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });

    return (
        <>
            <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center">
                <Wrench className="w-6 h-6 mr-2 text-blue-600" />
                Órdenes de Trabajo
            </h1>
            <p className="text-sm text-gray-500 mb-4">
                {isAdmin
                    ? 'Vista general con filtros y totales del período seleccionado.'
                    : 'Vista de las órdenes de trabajo que gestionaste.'}
            </p>

            <div className="flex flex-col gap-3 mb-4">
                <Link
                    href="/dashboard/interventions/new"
                    className="flex items-center justify-center min-h-11 px-4 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:bg-green-700 transition duration-150 w-full sm:w-auto sm:self-end"
                >
                    <PlusCircle className="w-4 h-4 mr-1.5" />
                    Abrir Nueva OT
                </Link>
                <InterventionsSearchForm
                    initialQuery={query}
                    initialStatus={status}
                    initialFrom={dateFrom}
                    initialTo={dateTo}
                    initialRange={range}
                    initialDateMode={dateMode}
                    isAdmin={!!isAdmin}
                />
                {isAdmin && (
                    <OtTotalsSummary
                        totalCount={totalCount}
                        totalCost={totalCost}
                        totalLaborCost={totalLaborCost}
                        ownerCommissionPct={workshopSettings?.ownerCommissionPct ?? 70}
                    />
                )}
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
                {interventions.map((i) => (
                    <Link
                        key={i.id}
                        href={`/dashboard/interventions/${i.id}`}
                        className="block bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:border-blue-300 transition"
                    >
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="text-lg font-bold text-blue-600">OT #{i.otNumber}</span>
                            {getStatusBadge(i)}
                        </div>
                        <p className="font-semibold text-gray-900">{i.carPlate}</p>
                        <p className="text-sm text-gray-600">{i.carMakeModel}</p>
                        <p className="text-sm text-gray-500 mt-1">{i.ownerName}</p>
                        <p className="text-xs text-gray-400 mt-2">{formatDate(i.filterDate)} · {i.performedByName}</p>
                        {isAdmin && (
                            <p className="text-xs font-medium text-emerald-700 mt-1">
                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(i.cost)}
                            </p>
                        )}
                    </Link>
                ))}
                {interventions.length === 0 && (
                    <div className="text-center py-8 text-sm text-gray-500 bg-white rounded-xl border">
                        {hasFilters
                            ? 'No se encontraron órdenes con esos filtros.'
                            : 'Aún no hay órdenes de trabajo.'}
                    </div>
                )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block bg-white p-4 rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OT #</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{dateMode === 'close' ? 'Fecha cierre' : 'Fecha apertura'}</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehículo</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Por</th>
                            {isAdmin && (
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Costo</th>
                            )}
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {interventions.map((i) => (
                            <tr key={i.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2.5 whitespace-nowrap text-sm font-bold text-blue-600">{i.otNumber}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-sm">{getStatusBadge(i)}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-500">{formatDate(i.filterDate)}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-900">
                                    <span className="font-semibold">{i.carPlate}</span> — {i.carMakeModel}
                                </td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-500">{i.ownerName}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-500">{i.performedByName}</td>
                                {isAdmin && (
                                    <td className="px-3 py-2.5 whitespace-nowrap text-sm text-right text-emerald-800 font-medium">
                                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(i.cost)}
                                    </td>
                                )}
                                <td className="px-3 py-2.5 whitespace-nowrap text-right text-sm font-medium">
                                    <Link href={`/dashboard/interventions/${i.id}`} className="text-blue-600 hover:text-blue-900">
                                        Ver
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {interventions.length === 0 && (
                    <div className="text-center py-8 text-sm text-gray-500">
                        {hasFilters
                            ? 'No se encontraron órdenes de trabajo con esos filtros.'
                            : 'Aún no hay órdenes de trabajo registradas.'}
                    </div>
                )}
            </div>

            {totalPages > 1 && (
                <div className="flex justify-between items-center pt-4 mt-2">
                    <p className="text-sm text-gray-700">Página {currentPage} de {totalPages}</p>
                    <div className="flex space-x-2">
                        <PageLink href={pageHref(currentPage - 1)} disabled={isFirstPage} label="Anterior" iconType="left" />
                        <PageLink href={pageHref(currentPage + 1)} disabled={isLastPage} label="Siguiente" iconType="right" />
                    </div>
                </div>
            )}
        </>
    );
}

function PageLink({
    href,
    disabled,
    label,
    iconType,
}: {
    href: string;
    disabled: boolean;
    label: string;
    iconType: 'left' | 'right';
}) {
    const baseClasses = 'flex items-center min-h-11 px-3 py-1.5 border rounded-md text-sm font-medium transition duration-150';
    const Icon = iconType === 'left' ? ChevronLeft : ChevronRight;

    if (disabled) {
        return (
            <span className={`${baseClasses} bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed`}>
                {iconType === 'left' && <Icon className="w-4 h-4 mr-2" />}
                {label}
                {iconType === 'right' && <Icon className="w-4 h-4 ml-2" />}
            </span>
        );
    }

    return (
        <Link href={href} className={`${baseClasses} bg-white text-blue-600 border-blue-600 hover:bg-blue-50`}>
            {iconType === 'left' && <Icon className="w-4 h-4 mr-2" />}
            {label}
            {iconType === 'right' && <Icon className="w-4 h-4 ml-2" />}
        </Link>
    );
}
