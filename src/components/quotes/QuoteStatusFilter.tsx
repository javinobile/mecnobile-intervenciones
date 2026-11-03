'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { QUOTE_STATUS_LABELS } from './QuoteStatusBadge';
import type { QuoteDisplayStatus } from '@/actions/quote.actions';

const OPTIONS: QuoteDisplayStatus[] = ['BORRADOR', 'ENVIADO', 'VENCIDO', 'ACEPTADO', 'RECHAZADO'];

/** Select de estado: actualiza `?estado=` en la URL y vuelve a la página 1. */
export default function QuoteStatusFilter({ value }: { value: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value) params.set('estado', e.target.value);
        else params.delete('estado');
        params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <select
            aria-label="Filtrar por estado"
            value={value}
            onChange={handleChange}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-800 bg-white"
        >
            <option value="">Todos los estados</option>
            {OPTIONS.map((s) => (
                <option key={s} value={s}>
                    {QUOTE_STATUS_LABELS[s]}
                </option>
            ))}
        </select>
    );
}
