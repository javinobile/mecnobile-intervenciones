'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useState } from 'react';

interface InterventionsSearchFormProps {
    initialQuery: string;
    initialStatus: string;
    initialFrom?: string;
    initialTo?: string;
    initialRange?: string;
    isAdmin?: boolean;
}

function toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
    const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    return copy;
}

function endOfWeek(d: Date): Date {
    const start = startOfWeek(d);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return end;
}

export default function InterventionsSearchForm({
    initialQuery,
    initialStatus,
    initialFrom = '',
    initialTo = '',
    initialRange = '',
    isAdmin = false,
}: InterventionsSearchFormProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [query, setQuery] = useState(initialQuery);
    const [from, setFrom] = useState(initialFrom);
    const [to, setTo] = useState(initialTo);
    const [range, setRange] = useState(initialRange);

    const pushParams = (opts: {
        nextQuery: string;
        nextStatus: string;
        nextFrom?: string;
        nextTo?: string;
        nextRange?: string;
    }) => {
        const params = new URLSearchParams(searchParams.toString());

        if (opts.nextQuery.trim() === '') params.delete('q');
        else params.set('q', opts.nextQuery.trim());

        if (opts.nextStatus === '') params.delete('status');
        else params.set('status', opts.nextStatus);

        if (isAdmin) {
            const f = opts.nextFrom ?? '';
            const t = opts.nextTo ?? '';
            const r = opts.nextRange ?? '';
            if (f) params.set('from', f); else params.delete('from');
            if (t) params.set('to', t); else params.delete('to');
            if (r) params.set('range', r); else params.delete('range');
        }

        params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        pushParams({
            nextQuery: query,
            nextStatus: initialStatus,
            nextFrom: from,
            nextTo: to,
            nextRange: range === 'week' || range === 'month' ? 'custom' : range,
        });
        if (from || to) setRange(from || to ? 'custom' : '');
    };

    const handleClear = () => {
        setQuery('');
        pushParams({
            nextQuery: '',
            nextStatus: initialStatus,
            nextFrom: from,
            nextTo: to,
            nextRange: range,
        });
    };

    const applyPreset = (preset: 'week' | 'month' | '') => {
        const now = new Date();
        if (preset === 'week') {
            const f = toIsoDate(startOfWeek(now));
            const t = toIsoDate(endOfWeek(now));
            setFrom(f);
            setTo(t);
            setRange('week');
            pushParams({
                nextQuery: query,
                nextStatus: initialStatus,
                nextFrom: f,
                nextTo: t,
                nextRange: 'week',
            });
            return;
        }
        if (preset === 'month') {
            const f = toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
            const t = toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
            setFrom(f);
            setTo(t);
            setRange('month');
            pushParams({
                nextQuery: query,
                nextStatus: initialStatus,
                nextFrom: f,
                nextTo: t,
                nextRange: 'month',
            });
            return;
        }
        setFrom('');
        setTo('');
        setRange('');
        pushParams({
            nextQuery: query,
            nextStatus: initialStatus,
            nextFrom: '',
            nextTo: '',
            nextRange: '',
        });
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 w-full">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                <div className="relative w-full">
                    <input
                        type="text"
                        name="q"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="OT #, patente, cliente, vehículo..."
                        className="w-full min-h-11 px-3 py-2.5 pr-8 text-base border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-800"
                    />
                    {query.length > 0 && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                            aria-label="Limpiar búsqueda"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <select
                    value={initialStatus}
                    onChange={(e) => pushParams({
                        nextQuery: query,
                        nextStatus: e.target.value,
                        nextFrom: from,
                        nextTo: to,
                        nextRange: range,
                    })}
                    className="min-h-11 px-3 py-2 text-base border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 shrink-0"
                    aria-label="Filtrar por estado"
                >
                    <option value="">Todos los estados</option>
                    <option value="ABIERTA">Abiertas</option>
                    <option value="CERRADA">Cerradas</option>
                    <option value="CANCELADA">Canceladas</option>
                    {isAdmin && (
                        <option value="PENDIENTE_CANCELACION">Pend. cancelación</option>
                    )}
                </select>

                <button
                    type="submit"
                    className="min-h-11 min-w-11 flex items-center justify-center px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shrink-0"
                    aria-label="Buscar"
                >
                    <Search className="w-5 h-5" />
                </button>
            </div>

            {isAdmin && (
                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
                    <div className="flex gap-1.5 flex-wrap">
                        <button
                            type="button"
                            onClick={() => applyPreset('week')}
                            className={`min-h-10 px-3 text-sm rounded-lg border font-medium ${
                                range === 'week'
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                            Esta semana
                        </button>
                        <button
                            type="button"
                            onClick={() => applyPreset('month')}
                            className={`min-h-10 px-3 text-sm rounded-lg border font-medium ${
                                range === 'month'
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                            Este mes
                        </button>
                        <button
                            type="button"
                            onClick={() => applyPreset('')}
                            className="min-h-10 px-3 text-sm rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 font-medium"
                        >
                            Sin fecha
                        </button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-xs text-gray-500 shrink-0">Desde</label>
                        <input
                            type="date"
                            value={from}
                            onChange={(e) => {
                                setFrom(e.target.value);
                                setRange('custom');
                            }}
                            className="min-h-10 px-2 text-sm border border-gray-300 rounded-lg"
                        />
                        <label className="text-xs text-gray-500 shrink-0">Hasta</label>
                        <input
                            type="date"
                            value={to}
                            onChange={(e) => {
                                setTo(e.target.value);
                                setRange('custom');
                            }}
                            className="min-h-10 px-2 text-sm border border-gray-300 rounded-lg"
                        />
                        <button
                            type="button"
                            onClick={() => pushParams({
                                nextQuery: query,
                                nextStatus: initialStatus,
                                nextFrom: from,
                                nextTo: to,
                                nextRange: from || to ? 'custom' : '',
                            })}
                            className="min-h-10 px-3 text-sm rounded-lg bg-gray-800 text-white font-medium hover:bg-gray-900"
                        >
                            Aplicar fechas
                        </button>
                    </div>
                </div>
            )}
        </form>
    );
}
