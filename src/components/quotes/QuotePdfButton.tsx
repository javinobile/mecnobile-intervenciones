'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { generateQuotePdfBase64 } from '@/actions/quote.actions';

/** Descarga el PDF del presupuesto (Presupuesto-N.pdf) con los datos actuales. */
export default function QuotePdfButton({ quoteId, label = 'Descargar PDF' }: { quoteId: string; label?: string }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleClick = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await generateQuotePdfBase64(quoteId);
            if (!result.success || !result.base64Data) {
                setError(result.message || 'Error al generar el PDF.');
                return;
            }
            const bytes = Uint8Array.from(window.atob(result.base64Data), (c) => c.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = result.fileName ?? 'Presupuesto.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
        } catch {
            setError('Error de red al generar el PDF.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-1">
            <button
                type="button"
                onClick={handleClick}
                disabled={loading}
                className="flex items-center justify-center gap-1.5 min-h-11 px-4 bg-gray-800 text-white font-medium rounded-lg hover:bg-gray-900 disabled:opacity-50 w-full sm:w-auto"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                {loading ? 'Generando…' : label}
            </button>
            {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
    );
}
