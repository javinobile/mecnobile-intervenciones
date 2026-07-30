'use client';

import { useState } from 'react';
import {
    upsertInterventionItem,
    deleteInterventionItem,
} from '@/actions/intervention.actions';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';

export type ItemRow = {
    id: string;
    type: string;
    description: string;
    hours: number | null;
    unitPrice: number;
    amount: number;
};

const TYPE_LABELS: Record<string, string> = {
    REPUESTO: 'Repuesto',
    MANO_DE_OBRA: 'Mano de obra',
    TRABAJO_TERCERO: 'Trabajo de tercero',
};

const inputClass =
    'w-full min-h-11 px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-blue-500 focus:border-blue-500';

export default function InterventionItemsEditor({
    interventionId,
    items,
    totalCost,
    hourlyRate,
    canEdit,
}: {
    interventionId: string;
    items: ItemRow[];
    totalCost: number;
    hourlyRate: number;
    canEdit: boolean;
}) {
    const router = useRouter();
    const [showForm, setShowForm] = useState(false);
    const [type, setType] = useState<string>('REPUESTO');
    const [description, setDescription] = useState('');
    const [hours, setHours] = useState('');
    const [unitPrice, setUnitPrice] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const formatMoney = (n: number) =>
        new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

    const previewAmount =
        type === 'MANO_DE_OBRA'
            ? (parseFloat(hours) || 0) * hourlyRate
            : parseFloat(unitPrice) || 0;

    const resetForm = () => {
        setDescription('');
        setHours('');
        setUnitPrice('');
        setType('REPUESTO');
        setShowForm(false);
        setError(null);
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const result = await upsertInterventionItem({
                interventionId,
                type,
                description,
                hours: type === 'MANO_DE_OBRA' ? hours : undefined,
                unitPrice: type !== 'MANO_DE_OBRA' ? unitPrice : undefined,
            });
            if (!result.success) throw new Error(result.message);
            resetForm();
            router.refresh();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error al guardar');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (itemId: string) => {
        if (!confirm('¿Eliminar este ítem?')) return;
        setLoading(true);
        try {
            const result = await deleteInterventionItem(itemId, interventionId);
            if (!result.success) throw new Error(result.message);
            router.refresh();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error al eliminar');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold text-gray-800">Ítems de la OT</h2>
                <p className="text-lg font-extrabold text-green-700">{formatMoney(totalCost)}</p>
            </div>

            {items.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">Todavía no hay ítems cargados.</p>
            ) : (
                <ul className="space-y-2">
                    {items.map((item) => (
                        <li
                            key={item.id}
                            className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50"
                        >
                            <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase text-blue-700">
                                    {TYPE_LABELS[item.type] || item.type}
                                </p>
                                <p className="text-sm font-medium text-gray-900">{item.description}</p>
                                {item.hours != null && (
                                    <p className="text-xs text-gray-500">
                                        {item.hours} h × {formatMoney(item.unitPrice)}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-sm font-bold text-gray-900">
                                    {formatMoney(item.amount)}
                                </span>
                                {canEdit && (
                                    <button
                                        type="button"
                                        disabled={loading}
                                        onClick={() => handleDelete(item.id)}
                                        className="p-2 min-h-11 min-w-11 text-red-600 hover:bg-red-50 rounded-md"
                                        aria-label="Eliminar ítem"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {error && (
                <div className="p-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
                    {error}
                </div>
            )}

            {canEdit && !showForm && (
                <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="w-full min-h-11 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-blue-300 text-blue-700 font-semibold hover:bg-blue-50"
                >
                    <Plus className="w-4 h-4" />
                    Agregar ítem
                </button>
            )}

            {canEdit && showForm && (
                <form onSubmit={handleAdd} className="p-4 border border-blue-200 rounded-xl bg-blue-50/40 space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            className={inputClass}
                        >
                            <option value="REPUESTO">Repuesto</option>
                            <option value="MANO_DE_OBRA">Mano de obra</option>
                            <option value="TRABAJO_TERCERO">Trabajo de tercero</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
                        <input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className={inputClass}
                            required
                            placeholder="Detalle del ítem"
                        />
                    </div>

                    {type === 'MANO_DE_OBRA' ? (
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Horas trabajadas (tarifa {formatMoney(hourlyRate)}/h)
                            </label>
                            <input
                                type="number"
                                step="0.25"
                                min="0.25"
                                value={hours}
                                onChange={(e) => setHours(e.target.value)}
                                className={inputClass}
                                required
                            />
                            <p className="mt-1 text-xs text-gray-600">
                                Subtotal: {formatMoney(previewAmount)}
                            </p>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Importe (ARS)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={unitPrice}
                                onChange={(e) => setUnitPrice(e.target.value)}
                                className={inputClass}
                                required
                            />
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                        <button
                            type="button"
                            onClick={resetForm}
                            className="flex-1 min-h-11 rounded-lg border border-gray-300 font-medium"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 min-h-11 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50"
                        >
                            {loading ? 'Guardando...' : 'Agregar'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
