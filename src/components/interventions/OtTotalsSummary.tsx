'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const STORAGE_KEY = 'mecnobile-ot-totals-visible';

interface OtTotalsSummaryProps {
    totalCount: number;
    totalCost: number;
}

export default function OtTotalsSummary({ totalCount, totalCost }: OtTotalsSummaryProps) {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === '0') setVisible(false);
            if (stored === '1') setVisible(true);
        } catch {
            // ignore
        }
    }, []);

    const toggle = () => {
        setVisible((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
            } catch {
                // ignore
            }
            return next;
        });
    };

    const costLabel = new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
    }).format(totalCost);

    return (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-blue-100 bg-blue-50/80">
            {visible ? (
                <div className="flex flex-wrap gap-4 sm:gap-8 text-sm">
                    <div>
                        <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">Órdenes</p>
                        <p className="text-xl font-bold text-blue-950">{totalCount}</p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">Total económico</p>
                        <p className="text-xl font-bold text-emerald-800">{costLabel}</p>
                    </div>
                </div>
            ) : (
                <p className="text-sm text-blue-800/70">Resumen oculto</p>
            )}
            <button
                type="button"
                onClick={toggle}
                className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-800 hover:bg-blue-100 shrink-0"
                title={visible ? 'Ocultar totales' : 'Mostrar totales'}
                aria-label={visible ? 'Ocultar totales' : 'Mostrar totales'}
            >
                {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
        </div>
    );
}
