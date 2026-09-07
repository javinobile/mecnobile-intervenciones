import { Archive, Calendar } from 'lucide-react';
import type { LegacyHistoryEntry } from '@/lib/ai/groq-client';

type LegacyHistorialPanelProps = {
    entries: LegacyHistoryEntry[];
};

/**
 * Historial del sistema previo, en el mismo formato visual que las OT locales
 * (fecha, km, motivo y detalles; sin importes).
 */
export default function LegacyHistorialPanel({ entries }: LegacyHistorialPanelProps) {
    return (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 mt-8">
            <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center border-b pb-3">
                <Archive className="w-5 h-5 mr-2 text-slate-600" />
                Historial anterior (sistema previo) ({entries.length})
            </h2>
            <p className="text-xs text-gray-500 mb-4">
                Datos del sistema anterior, normalizados por VIN. Sin importes.
            </p>
            {entries.length === 0 ? (
                <p className="text-sm text-gray-500 italic py-4">
                    Sin historial anterior registrado para este VIN, o el servicio no está disponible.
                </p>
            ) : (
                <div className="space-y-4">
                    {entries.map((entry, idx) => (
                        <div
                            key={`${entry.dateLabel}-${idx}`}
                            className="p-4 border border-gray-200 rounded-lg bg-slate-50/60"
                        >
                            <div className="flex justify-between items-start gap-3">
                                <span className="text-sm font-bold text-slate-800">Registro anterior</span>
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700">
                                    PREVIO
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
                                <span className="inline-flex items-center">
                                    <Calendar className="w-3 h-3 mr-1" />
                                    {entry.dateLabel}
                                </span>
                                {entry.mileageKm != null ? (
                                    <span>{entry.mileageKm.toLocaleString('es-AR')} km</span>
                                ) : null}
                            </div>
                            <p className="text-sm text-gray-800 mt-2">
                                <span className="font-medium">Motivo:</span> {entry.description}
                            </p>
                            {entry.details.length > 0 ? (
                                <ul className="mt-2 space-y-1">
                                    {entry.details.map((detail, dIdx) => (
                                        <li key={dIdx} className="text-sm text-gray-700">
                                            • {detail}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
