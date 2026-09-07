import { Archive } from 'lucide-react';

type LegacyHistorialPanelProps = {
    historial: string | null;
};

/**
 * Muestra el historial del sistema previo (si existe) en el detalle del vehículo.
 */
export default function LegacyHistorialPanel({ historial }: LegacyHistorialPanelProps) {
    return (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 mt-8">
            <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center border-b pb-3">
                <Archive className="w-5 h-5 mr-2 text-slate-600" />
                Historial anterior (sistema previo)
            </h2>
            <p className="text-xs text-gray-500 mb-4">
                Datos del sistema anterior, obtenidos por VIN del vehículo.
            </p>
            {historial ? (
                <pre className="whitespace-pre-wrap break-words text-sm text-gray-800 bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-[28rem] overflow-y-auto font-sans">
                    {historial}
                </pre>
            ) : (
                <p className="text-sm text-gray-500 italic py-4">
                    Sin historial anterior registrado para este VIN, o el servicio no está disponible.
                </p>
            )}
        </div>
    );
}
