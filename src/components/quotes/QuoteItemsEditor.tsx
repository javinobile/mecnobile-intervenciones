'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteQuoteItem, upsertQuoteItem, type QuoteItemRow } from '@/actions/quote.actions';

type ItemType = QuoteItemRow['type'];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
    MANO_DE_OBRA: 'Mano de obra',
    REPUESTO: 'Repuesto',
    TRABAJO_TERCERO: 'Trabajo de tercero',
};

/** Orden en que se muestran los subtotales. */
const TYPE_ORDER: ItemType[] = ['MANO_DE_OBRA', 'REPUESTO', 'TRABAJO_TERCERO'];

const TOTAL_LABELS: Record<ItemType, string> = {
    MANO_DE_OBRA: 'Mano de obra',
    REPUESTO: 'Repuestos',
    TRABAJO_TERCERO: 'Trabajos de terceros',
};

const inputClass =
    'w-full min-h-11 px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-blue-500 focus:border-blue-500';

const formatMoney = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

export default function QuoteItemsEditor({
    quoteId,
    items,
    total,
    totalsByType,
    canEdit,
}: {
    quoteId: string;
    items: QuoteItemRow[];
    total: number;
    totalsByType: Record<ItemType, number>;
    canEdit: boolean;
}) {
    const router = useRouter();
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [type, setType] = useState<ItemType>('MANO_DE_OBRA');
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const resetForm = () => {
        setShowForm(false);
        setEditingId(null);
        setType('MANO_DE_OBRA');
        setDescription('');
        setAmount('');
        setError(null);
    };

    const startEdit = (item: QuoteItemRow) => {
        setEditingId(item.id);
        setType(item.type);
        setDescription(item.description);
        setAmount(String(item.amount));
        setError(null);
        setShowForm(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const result = await upsertQuoteItem({
                quoteId,
                itemId: editingId ?? undefined,
                type,
                description,
                amount,
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
        setError(null);
        try {
            const result = await deleteQuoteItem(itemId, quoteId);
            if (!result.success) throw new Error(result.message);
            if (editingId === itemId) resetForm();
            router.refresh();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error al eliminar');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-800">Ítems del presupuesto</h2>

            {items.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">Todavía no hay ítems cargados.</p>
            ) : (
                <ul className="space-y-2">
                    {items.map((item) => (
                        <li
                            key={item.id}
                            className={`flex items-start justify-between gap-3 p-3 rounded-lg border ${
                                editingId === item.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'
                            }`}
                        >
                            <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase text-blue-700">
                                    {ITEM_TYPE_LABELS[item.type]}
                                </p>
                                <p className="text-sm font-medium text-gray-900 break-words">{item.description}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <span
                                    className={`text-sm font-bold ${item.amount < 0 ? 'text-red-700' : 'text-gray-900'}`}
                                >
                                    {formatMoney(item.amount)}
                                </span>
                                {canEdit && (
                                    <>
                                        <button
                                            type="button"
                                            disabled={loading}
                                            onClick={() => startEdit(item)}
                                            className="p-2 min-h-11 min-w-11 text-blue-600 hover:bg-blue-50 rounded-md"
                                            aria-label="Editar ítem"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={loading}
                                            onClick={() => handleDelete(item.id)}
                                            className="p-2 min-h-11 min-w-11 text-red-600 hover:bg-red-50 rounded-md"
                                            aria-label="Eliminar ítem"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {/* Totales por tipo + general */}
            <dl className="border-t border-gray-200 pt-3 space-y-1 text-sm">
                {TYPE_ORDER.map((t) => (
                    <div key={t} className="flex justify-between text-gray-700">
                        <dt>{TOTAL_LABELS[t]}</dt>
                        <dd className="font-medium">{formatMoney(totalsByType[t])}</dd>
                    </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-gray-200 text-base">
                    <dt className="font-bold text-gray-900">Total</dt>
                    <dd className="font-extrabold text-green-700">{formatMoney(total)}</dd>
                </div>
            </dl>

            {error && (
                <div className="p-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">{error}</div>
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
                <form onSubmit={handleSubmit} className="p-4 border border-blue-200 rounded-xl bg-blue-50/40 space-y-3">
                    <p className="text-sm font-semibold text-gray-800">{editingId ? 'Editar ítem' : 'Nuevo ítem'}</p>
                    <div>
                        <label htmlFor="itemType" className="block text-xs font-medium text-gray-700 mb-1">
                            Tipo
                        </label>
                        <select
                            id="itemType"
                            value={type}
                            onChange={(e) => setType(e.target.value as ItemType)}
                            className={inputClass}
                        >
                            {TYPE_ORDER.map((t) => (
                                <option key={t} value={t}>
                                    {ITEM_TYPE_LABELS[t]}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="itemDescription" className="block text-xs font-medium text-gray-700 mb-1">
                            Descripción
                        </label>
                        <input
                            id="itemDescription"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className={inputClass}
                            required
                            placeholder="Detalle del ítem"
                        />
                    </div>
                    <div>
                        <label htmlFor="itemAmount" className="block text-xs font-medium text-gray-700 mb-1">
                            Importe (ARS)
                        </label>
                        <input
                            id="itemAmount"
                            type="number"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className={inputClass}
                            required
                        />
                        <p className="mt-1 text-xs text-gray-600">
                            Para un descuento, cargá un ítem con importe negativo.
                        </p>
                    </div>
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
                            {loading ? 'Guardando...' : editingId ? 'Guardar ítem' : 'Agregar'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
