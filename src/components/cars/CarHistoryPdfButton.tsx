'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { generateCarHistoryPdfBase64 } from '@/actions/car-history.actions';

export default function CarHistoryPdfButton({ carId }: { carId: string }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleClick = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await generateCarHistoryPdfBase64(carId);
            if (!result.success || !result.base64Data) {
                setError(result.message || 'No se pudo generar el PDF.');
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
            setError('Error de red al generar el historial.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-start gap-1">
            <button
                type="button"
                onClick={handleClick}
                disabled={loading}
                className="flex items-center px-4 py-2 bg-slate-800 text-white font-medium rounded-lg shadow-md hover:bg-slate-900 transition disabled:opacity-60"
            >
                {loading ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                    <FileDown className="w-5 h-5 mr-2" />
                )}
                Imprimir historial
            </button>
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
    );
}
