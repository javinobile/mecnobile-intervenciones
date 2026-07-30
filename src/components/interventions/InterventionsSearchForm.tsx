'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { useState } from 'react';

interface InterventionsSearchFormProps {
    initialQuery: string;
    initialStatus: string;
    isAdmin?: boolean;
}

export default function InterventionsSearchForm({
    initialQuery,
    initialStatus,
    isAdmin = false,
}: InterventionsSearchFormProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [query, setQuery] = useState(initialQuery);

    const pushParams = (nextQuery: string, nextStatus: string) => {
        const params = new URLSearchParams(searchParams.toString());

        if (nextQuery.trim() === '') {
            params.delete('q');
        } else {
            params.set('q', nextQuery.trim());
        }

        if (nextStatus === '') {
            params.delete('status');
        } else {
            params.set('status', nextStatus);
        }

        params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        pushParams(query, initialStatus);
    };

    const handleClear = () => {
        setQuery('');
        pushParams('', initialStatus);
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
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
                onChange={(e) => pushParams(query, e.target.value)}
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
        </form>
    );
}
