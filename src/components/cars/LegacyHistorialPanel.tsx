import type { LegacyHistoryEntry } from '../../../lib/legacy-historial';

type LegacyHistorialPanelProps = {
    entries: LegacyHistoryEntry[];
};

/** Tabla compacta del historial del sistema previo (fecha, km, trabajo, diagnóstico, resultado). */
export default function LegacyHistorialPanel({ entries }: LegacyHistorialPanelProps) {
    if (!entries.length) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 mt-8">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Sistema previo</h2>
                <p className="text-[11px] text-gray-400 italic mb-2">Datos del sistema anterior</p>
                <p className="text-sm text-gray-500 italic">
                    Sin historial anterior registrado para este VIN.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 mt-8">
            <h2 className="text-xl font-bold text-gray-800 mb-1">
                Sistema previo ({entries.length})
            </h2>
            <p className="text-[11px] text-gray-400 italic mb-4">Datos del sistema anterior</p>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-gray-600">
                        <tr>
                            <th className="px-3 py-2 font-semibold whitespace-nowrap">Fecha</th>
                            <th className="px-3 py-2 font-semibold whitespace-nowrap">Km</th>
                            <th className="px-3 py-2 font-semibold">Trabajo</th>
                            <th className="px-3 py-2 font-semibold">Diagnóstico</th>
                            <th className="px-3 py-2 font-semibold">Resultado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry, idx) => (
                            <tr
                                key={`${entry.dateLabel}-${idx}`}
                                className="border-t border-gray-100 odd:bg-white even:bg-slate-50/60 align-top"
                            >
                                <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                                    {entry.dateLabel}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                                    {entry.mileageKm != null
                                        ? entry.mileageKm.toLocaleString('es-AR')
                                        : '—'}
                                </td>
                                <td className="px-3 py-2 text-gray-800">{entry.trabajo}</td>
                                <td className="px-3 py-2 text-gray-700">{entry.diagnostico}</td>
                                <td className="px-3 py-2 text-gray-700">{entry.resultado}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
