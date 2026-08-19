'use client';

import { useState } from 'react';
import { updateWorkshopSettings, WorkshopSettingsData } from '@/actions/settings.actions';

export default function SettingsForm({ initialSettings }: { initialSettings: WorkshopSettingsData }) {
    const [hourlyRate, setHourlyRate] = useState(initialSettings.hourlyRate.toString());
    const [worksSaturday, setWorksSaturday] = useState(initialSettings.worksSaturday);
    const [worksSunday, setWorksSunday] = useState(initialSettings.worksSunday);
    const [openingTime, setOpeningTime] = useState(initialSettings.openingTime);
    const [closingTime, setClosingTime] = useState(initialSettings.closingTime);
    const [saturdayOpeningTime, setSaturdayOpeningTime] = useState(initialSettings.saturdayOpeningTime);
    const [saturdayClosingTime, setSaturdayClosingTime] = useState(initialSettings.saturdayClosingTime);
    const [ownerCommissionPct, setOwnerCommissionPct] = useState(initialSettings.ownerCommissionPct.toString());
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);
        try {
            const result = await updateWorkshopSettings({
                hourlyRate,
                worksSaturday,
                worksSunday,
                openingTime,
                closingTime,
                saturdayOpeningTime,
                saturdayClosingTime,
                ownerCommissionPct,
            });
            if (!result.success) throw new Error(result.message);
            setMessage({ type: 'success', text: result.message });
            if (result.settings) {
                setHourlyRate(result.settings.hourlyRate.toString());
                setOpeningTime(result.settings.openingTime);
                setClosingTime(result.settings.closingTime);
                setSaturdayOpeningTime(result.settings.saturdayOpeningTime);
                setSaturdayClosingTime(result.settings.saturdayClosingTime);
                setOwnerCommissionPct(result.settings.ownerCommissionPct.toString());
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
        <form
            onSubmit={handleSubmit}
            className="bg-white p-4 sm:p-6 rounded-xl border border-gray-200 shadow-sm max-w-lg space-y-6"
        >
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


            <div>
                <label htmlFor="ownerCommissionPct" className="block text-sm font-medium text-gray-700 mb-1">
                    Comisión del taller (%)
                </label>
                <input
                    id="ownerCommissionPct"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={ownerCommissionPct}
                    onChange={(e) => setOwnerCommissionPct(e.target.value)}
                    className="w-full min-h-11 px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    required
                />
                <p className="mt-1 text-xs text-gray-500">
                    El resto se asigna al mecánico automáticamente.
                </p>
            </div>

            <div className="pt-4 border-t border-gray-200 space-y-3">
                <div>
                    <h2 className="text-sm font-semibold text-gray-900">Días y horarios de atención</h2>
                    <p className="text-xs text-gray-500">
                        Solo se aceptan turnos dentro de estos rangos, tanto por WhatsApp como en la carga
                        manual del calendario.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label htmlFor="openingTime" className="block text-xs text-gray-600 mb-1">
                            Lunes a viernes — apertura
                        </label>
                        <input
                            id="openingTime"
                            type="time"
                            value={openingTime}
                            onChange={(e) => setOpeningTime(e.target.value)}
                            className="w-full min-h-11 px-3 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="closingTime" className="block text-xs text-gray-600 mb-1">
                            Lunes a viernes — cierre
                        </label>
                        <input
                            id="closingTime"
                            type="time"
                            value={closingTime}
                            onChange={(e) => setClosingTime(e.target.value)}
                            className="w-full min-h-11 px-3 border border-gray-300 rounded-lg"
                            required
                        />
                    </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-800">
                    <input
                        type="checkbox"
                        checked={worksSaturday}
                        onChange={(e) => setWorksSaturday(e.target.checked)}
                        className="w-4 h-4"
                    />
                    El taller trabaja los sábados
                </label>

                {worksSaturday && (
                    <div className="grid grid-cols-2 gap-3 pl-6">
                        <div>
                            <label htmlFor="saturdayOpeningTime" className="block text-xs text-gray-600 mb-1">
                                Sábado — apertura
                            </label>
                            <input
                                id="saturdayOpeningTime"
                                type="time"
                                value={saturdayOpeningTime}
                                onChange={(e) => setSaturdayOpeningTime(e.target.value)}
                                className="w-full min-h-11 px-3 border border-gray-300 rounded-lg"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="saturdayClosingTime" className="block text-xs text-gray-600 mb-1">
                                Sábado — cierre
                            </label>
                            <input
                                id="saturdayClosingTime"
                                type="time"
                                value={saturdayClosingTime}
                                onChange={(e) => setSaturdayClosingTime(e.target.value)}
                                className="w-full min-h-11 px-3 border border-gray-300 rounded-lg"
                                required
                            />
                        </div>
                    </div>
                )}

                <label className="flex items-center gap-2 text-sm text-gray-800">
                    <input
                        type="checkbox"
                        checked={worksSunday}
                        onChange={(e) => setWorksSunday(e.target.checked)}
                        className="w-4 h-4"
                    />
                    El taller trabaja los domingos
                </label>
            </div>

            {message && (
                <div
                    className={`p-3 text-sm rounded-md ${
                        message.type === 'success'
                            ? 'bg-green-50 text-green-800 border border-green-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                    }`}
                >
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
