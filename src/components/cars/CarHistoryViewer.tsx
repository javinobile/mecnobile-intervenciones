'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Calendar,
    FileDown,
    FileSearch,
    Loader2,
    Search,
    X,
} from 'lucide-react';
import { generateCarHistoryPdfBase64 } from '@/actions/car-history.actions';
import type { LegacyHistoryEntry } from '@/lib/ai/groq-client';

export type CarHistoryViewerOt = {
    id: string;
    otNumber: number;
    description: string;
    notes: string | null;
    status: string;
    dateOfIntervention: string;
    mileageKm: number;
    performedByName: string | null;
};

type SourceFilter = 'all' | 'current' | 'legacy';

type UnifiedRow = {
    key: string;
    source: 'current' | 'legacy';
    title: string;
    statusLabel: string | null;
    statusClass: string | null;
    date: Date | null;
    dateLabel: string;
    mileageKm: number | null;
    description: string;
    details: string[];
    href?: string;
    performer?: string | null;
};

function parseLegacyDate(label: string): Date | null {
    const m = label.trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!m) return null;
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    if (!day || !month || !year) return null;
    const d = new Date(year, month - 1, day);
    return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function statusBadge(status: string): { label: string; className: string } {
    switch (status) {
        case 'CERRADA':
            return { label: 'Completada', className: 'bg-green-100 text-green-800' };
        case 'ABIERTA':
            return { label: 'Abierta', className: 'bg-yellow-100 text-yellow-800' };
        case 'CANCELADA':
            return { label: 'Cancelada', className: 'bg-red-100 text-red-800' };
        default:
            return { label: status, className: 'bg-gray-100 text-gray-800' };
    }
}

function buildRows(
    interventions: CarHistoryViewerOt[],
    legacyEntries: LegacyHistoryEntry[]
): UnifiedRow[] {
    const current: UnifiedRow[] = interventions.map((ot) => {
        const badge = statusBadge(ot.status);
        const date = new Date(ot.dateOfIntervention);
        return {
            key: `ot-${ot.id}`,
            source: 'current',
            title: `OT #${ot.otNumber}`,
            statusLabel: badge.label,
            statusClass: badge.className,
            date: Number.isNaN(date.getTime()) ? null : date,
            dateLabel: Number.isNaN(date.getTime())
                ? 'Sin fecha'
                : date.toLocaleDateString('es-AR', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                  }),
            mileageKm: ot.mileageKm,
            description: ot.description,
            details: ot.notes ? [ot.notes] : [],
            href: `/dashboard/interventions/${ot.id}`,
            performer: ot.performedByName,
        };
    });

    const legacy: UnifiedRow[] = legacyEntries.map((entry, idx) => ({
        key: `legacy-${idx}-${entry.dateLabel}`,
        source: 'legacy',
        title: 'Intervención',
        statusLabel: null,
        statusClass: null,
        date: parseLegacyDate(entry.dateLabel),
        dateLabel: entry.dateLabel,
        mileageKm: entry.mileageKm,
        description: entry.description,
        details: entry.details,
    }));

    return [...current, ...legacy].sort((a, b) => {
        const at = a.date?.getTime() ?? 0;
        const bt = b.date?.getTime() ?? 0;
        return bt - at;
    });
}

type CarHistoryViewerProps = {
    carId: string;
    licensePlate: string;
    interventions: CarHistoryViewerOt[];
    legacyEntries: LegacyHistoryEntry[];
    canPrint: boolean;
};

export default function CarHistoryViewer({
    carId,
    licensePlate,
    interventions,
    legacyEntries,
    canPrint,
}: CarHistoryViewerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [source, setSource] = useState<SourceFilter>('all');
    const [printLoading, setPrintLoading] = useState(false);
    const [printError, setPrintError] = useState<string | null>(null);

    const allRows = useMemo(
        () => buildRows(interventions, legacyEntries),
        [interventions, legacyEntries]
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const from = dateFrom ? startOfDay(new Date(`${dateFrom}T00:00:00`)) : null;
        const to = dateTo ? endOfDay(new Date(`${dateTo}T00:00:00`)) : null;

        return allRows.filter((row) => {
            if (source !== 'all' && row.source !== source) return false;

            if (from || to) {
                if (!row.date) return false;
                if (from && row.date < from) return false;
                if (to && row.date > to) return false;
            }

            if (!q) return true;
            const haystack = [
                row.title,
                row.description,
                ...row.details,
                row.performer || '',
                row.dateLabel,
                row.mileageKm != null ? String(row.mileageKm) : '',
            ]
                .join(' ')
                .toLowerCase();
            return haystack.includes(q);
        });
    }, [allRows, query, dateFrom, dateTo, source]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const clearFilters = () => {
        setQuery('');
        setDateFrom('');
        setDateTo('');
        setSource('all');
    };

    const handlePrint = async () => {
        setPrintLoading(true);
        setPrintError(null);
        try {
            const result = await generateCarHistoryPdfBase64(carId);
            if (!result.success || !result.base64Data) {
                setPrintError(result.message || 'No se pudo generar el PDF.');
                return;
            }
            const binaryString = window.atob(result.base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch {
            setPrintError('Error de red al generar el historial.');
        } finally {
            setPrintLoading(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex items-center px-4 py-2 bg-slate-800 text-white font-medium rounded-lg shadow-md hover:bg-slate-900 transition"
            >
                <FileSearch className="w-5 h-5 mr-2" />
                Consultar historial
            </button>

            {open ? (
                <div className="fixed inset-0 z-50 flex flex-col bg-white">
                    <header className="shrink-0 border-b border-gray-200 bg-white px-4 sm:px-6 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-2xl font-extrabold text-gray-900">
                                    Historial · {licensePlate}
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Órdenes actuales y registros del sistema previo. Filtros solo en
                                    pantalla.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {canPrint ? (
                                    <button
                                        type="button"
                                        onClick={handlePrint}
                                        disabled={printLoading}
                                        className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-700 text-white font-medium hover:bg-blue-800 disabled:opacity-60"
                                    >
                                        {printLoading ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <FileDown className="w-4 h-4 mr-2" />
                                        )}
                                        Imprimir PDF
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="inline-flex items-center justify-center min-h-10 min-w-10 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                                    aria-label="Cerrar"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        {printError ? (
                            <p className="text-sm text-red-600 mt-2">{printError}</p>
                        ) : null}
                    </header>

                    <div className="shrink-0 border-b border-gray-100 bg-slate-50 px-4 sm:px-6 py-3">
                        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
                            <label className="flex-1 min-w-[12rem]">
                                <span className="block text-xs font-medium text-gray-600 mb-1">
                                    Buscar en detalle
                                </span>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="search"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Motivo, notas, km, mecánico…"
                                        className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm"
                                    />
                                </div>
                            </label>
                            <label>
                                <span className="block text-xs font-medium text-gray-600 mb-1">
                                    Desde
                                </span>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                />
                            </label>
                            <label>
                                <span className="block text-xs font-medium text-gray-600 mb-1">
                                    Hasta
                                </span>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                />
                            </label>
                            <label>
                                <span className="block text-xs font-medium text-gray-600 mb-1">
                                    Origen
                                </span>
                                <select
                                    value={source}
                                    onChange={(e) => setSource(e.target.value as SourceFilter)}
                                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                >
                                    <option value="all">Todos</option>
                                    <option value="current">Sistema actual</option>
                                    <option value="legacy">Sistema previo</option>
                                </select>
                            </label>
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="text-sm text-blue-700 hover:underline px-1 py-2"
                            >
                                Limpiar filtros
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            Mostrando {filtered.length} de {allRows.length} registros
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
                        {filtered.length === 0 ? (
                            <div className="text-center py-16 text-gray-500">
                                No hay registros con esos filtros.
                            </div>
                        ) : (
                            <div className="space-y-3 max-w-4xl mx-auto">
                                {filtered.map((row) => {
                                    const body = (
                                        <>
                                            <div className="flex justify-between items-start gap-3">
                                                <span className="text-lg font-bold text-blue-700">
                                                    {row.title}
                                                </span>
                                                {row.statusLabel ? (
                                                    <span
                                                        className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${row.statusClass}`}
                                                    >
                                                        {row.statusLabel}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <p className="text-sm text-gray-800 mt-1">
                                                <span className="font-medium">Motivo:</span>{' '}
                                                {row.description}
                                            </p>
                                            {row.details.length > 0 ? (
                                                <ul className="mt-2 space-y-1">
                                                    {row.details.map((detail, idx) => (
                                                        <li key={idx} className="text-sm text-gray-700">
                                                            • {detail}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : null}
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
                                                <span className="inline-flex items-center">
                                                    <Calendar className="w-3 h-3 mr-1" />
                                                    {row.dateLabel}
                                                </span>
                                                {row.mileageKm != null ? (
                                                    <span>
                                                        {row.mileageKm.toLocaleString('es-AR')} km
                                                    </span>
                                                ) : null}
                                                {row.performer ? (
                                                    <span>Por: {row.performer}</span>
                                                ) : null}
                                            </div>
                                            {row.source === 'legacy' ? (
                                                <p className="text-[11px] text-gray-400 mt-2 italic">
                                                    Dato del sistema anterior
                                                </p>
                                            ) : null}
                                        </>
                                    );

                                    const cardClass =
                                        'block p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition bg-white';

                                    if (row.href) {
                                        return (
                                            <Link key={row.key} href={row.href} className={cardClass}>
                                                {body}
                                            </Link>
                                        );
                                    }

                                    return (
                                        <div key={row.key} className={cardClass}>
                                            {body}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </>
    );
}
