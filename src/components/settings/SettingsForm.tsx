'use client';

import { useState } from 'react';
import { updateWorkshopSettings } from '@/actions/settings.actions';

export default function SettingsForm({ initialHourlyRate }: { initialHourlyRate: number }) {
    const [hourlyRate, setHourlyRate] = useState(initialHourlyRate.toString());
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);
        try {
            const result = await updateWorkshopSettings(hourlyRate);
            if (!result.success) throw new Error(result.message);
            setMessage({ type: 'success', text: result.message });
            if (result.hourlyRate !== undefined) {
                setHourlyRate(result.hourlyRate.toString());
            }
        } catch (err: unknown) {
            setMessage({
                type: 'error',
                text: err instanceof Error ? err.message : 'Error al guardar.',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white p-4 sm:p-6 rounded-xl border border-gray-200 shadow-sm max-w-lg space-y-4">
            <div>
                <label htmlFor="hourlyRate" className="block text-sm font-medium text-gray-700 mb-1">
                    Precio hora — mano de obra (ARS)
                </label>
                <input
                    id="hourlyRate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    className="w-full min-h-11 px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    required
                />
                <p className="mt-1 text-xs text-gray-500">
                    Se usa al cargar ítems de tipo Mano de obra en las OT abiertas.
                </p>
            </div>

            {message && (
                <div className={`p-3 text-sm rounded-md ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {message.text}
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className="w-full min-h-11 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
                {loading ? 'Guardando...' : 'Guardar configuración'}
            </button>
        </form>
    );
}
