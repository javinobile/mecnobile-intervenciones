'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { acceptQuote, rejectQuote } from '@/actions/quote.actions';
import type { QuoteStatus } from '../../../generated/prisma';

/** Botones "Aceptar" (solo ENVIADO) y "Rechazar" (BORRADOR o ENVIADO). */
export default function QuoteDecisionActions({ quoteId, status }: { quoteId: string; status: QuoteStatus }) {
    const router = useRouter();
    const [loading, setLoading] = useState<'accept' | 'reject' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const canAccept = status === 'ENVIADO';
    const canReject = status === 'BORRADOR' || status === 'ENVIADO';
    if (!canAccept && !canReject) return null;

    const run = async (kind: 'accept' | 'reject') => {
        const prompt =
            kind === 'accept'
                ? 'El presupuesto queda cerrado y no se podrá modificar ni borrar. ¿Marcarlo como aceptado?'
                : '¿Marcar el presupuesto como rechazado?';
        if (!confirm(prompt)) return;
        setLoading(kind);
        setError(null);
        try {
            const result = kind === 'accept' ? await acceptQuote(quoteId) : await rejectQuote(quoteId);
            if (!result.success) {
                setError(result.message);
                return;
            }
            router.refresh();
        } catch {
            setError('Error de red. Probá de nuevo.');
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className="space-y-1">
            <div className="flex flex-col sm:flex-row gap-2">
                {canAccept && (
                    <button
                        type="button"
                        onClick={() => run('accept')}
                        disabled={loading !== null}
                        className="flex items-center justify-center gap-1.5 min-h-11 px-4 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                        {loading === 'accept' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Marcar aceptado
                    </button>
                )}
                {canReject && (
                    <button
                        type="button"
                        onClick={() => run('reject')}
                        disabled={loading !== null}
                        className="flex items-center justify-center gap-1.5 min-h-11 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                        {loading === 'reject' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                        Marcar rechazado
                    </button>
                )}
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
    );
}
