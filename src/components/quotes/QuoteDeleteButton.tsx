'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { deleteQuote } from '@/actions/quote.actions';

/**
 * Borra un presupuesto no aceptado, previa confirmación.
 * `variant="row"`: link chico para la tabla (refresca el listado).
 * `variant="button"`: botón del detalle (vuelve al listado).
 */
export default function QuoteDeleteButton({
    quoteId,
    quoteNumber,
    variant,
}: {
    quoteId: string;
    quoteNumber: number;
    variant: 'row' | 'button';
}) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const handleClick = async () => {
        if (!confirm(`¿Borrar el presupuesto Nº ${quoteNumber}? Esta acción no se puede deshacer.`)) return;
        setLoading(true);
        try {
            const result = await deleteQuote(quoteId);
            if (!result.success) {
                alert(result.message);
                return;
            }
            if (variant === 'button') router.push('/dashboard/presupuestos');
            else router.refresh();
        } catch {
            alert('Error al borrar el presupuesto.');
        } finally {
            setLoading(false);
        }
    };

    if (variant === 'row') {
        return (
            <button
                type="button"
                onClick={handleClick}
                disabled={loading}
                className="text-red-600 hover:text-red-800 transition duration-150 disabled:opacity-50"
            >
                {loading ? 'Borrando…' : 'Borrar'}
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 min-h-11 px-4 border border-red-300 text-red-700 font-medium rounded-lg hover:bg-red-50 disabled:opacity-50"
        >
            <Trash2 className="w-4 h-4" />
            {loading ? 'Borrando…' : 'Borrar presupuesto'}
        </button>
    );
}
