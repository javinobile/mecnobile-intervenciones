'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, ClipboardCheck, Pencil, Plus, X } from 'lucide-react';
import {
    createServiceChecklistItem,
    listServiceChecklistItems,
    moveServiceChecklistItem,
    renameServiceChecklistItem,
    ServiceChecklistItemDto,
    setServiceChecklistItemActive,
} from '@/actions/service-checklist.actions';

type Message = { type: 'success' | 'error'; text: string } | null;

/** Catálogo de puntos del checklist de service (SPEC 02). Solo ADMIN. */
export default function ServiceChecklistSettings({ initialItems }: { initialItems: ServiceChecklistItemDto[] }) {
    const [items, setItems] = useState(initialItems);
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<Message>(null);

    /** Ejecuta una action, muestra su mensaje y recarga el catálogo desde la base. */
    const run = async (action: () => Promise<{ success: boolean; message: string }>, onSuccess?: () => void) => {
        setBusy(true);
        setMessage(null);
        try {
            const result = await action();
            if (!result.success) {
                setMessage({ type: 'error', text: result.message });
                return;
            }
            onSuccess?.();
            setItems(await listServiceChecklistItems({ includeInactive: true }));
            setMessage({ type: 'success', text: result.message });
        } catch {
            setMessage({ type: 'error', text: 'Error de conexión. Intente nuevamente.' });
        } finally {
            setBusy(false);
        }
    };

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        run(() => createServiceChecklistItem(newName), () => setNewName(''));
    };

    const startEdit = (item: ServiceChecklistItemDto) => {
        setEditingId(item.id);
        setEditingName(item.name);
        setMessage(null);
    };

    const saveEdit = (id: string) => {
        run(() => renameServiceChecklistItem(id, editingName), () => setEditingId(null));
    };

    const iconButton =
        'inline-flex items-center justify-center min-h-9 min-w-9 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed';

    return (
        <section className="bg-white p-4 sm:p-6 rounded-xl border border-gray-200 shadow-sm w-full max-w-lg lg:max-w-none space-y-4">
            <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <ClipboardCheck className="w-5 h-5 mr-2 text-blue-600" />
                    Checklist de service
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                    Puntos que se ofrecen al marcar una OT como service. Renombrar o desactivar un punto no cambia las OT
                    donde ya fue marcado.
                </p>
            </div>

            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                {items.length === 0 && <li className="p-3 text-sm text-gray-500">No hay puntos cargados.</li>}
                {items.map((item, index) => (
                    <li
                        key={item.id}
                        className={`flex items-center gap-2 p-2 ${item.active ? '' : 'bg-gray-50'}`}
                    >
                        <div className="flex gap-1">
                            <button
                                type="button"
                                className={iconButton}
                                onClick={() => run(() => moveServiceChecklistItem(item.id, 'up'))}
                                disabled={busy || index === 0}
                                aria-label={`Subir ${item.name}`}
                                title="Subir"
                            >
                                <ArrowUp className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                className={iconButton}
                                onClick={() => run(() => moveServiceChecklistItem(item.id, 'down'))}
                                disabled={busy || index === items.length - 1}
                                aria-label={`Bajar ${item.name}`}
                                title="Bajar"
                            >
                                <ArrowDown className="w-4 h-4" />
                            </button>
                        </div>

                        {editingId === item.id ? (
                            <form
                                className="flex flex-1 items-center gap-1"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    saveEdit(item.id);
                                }}
                            >
                                <input
                                    type="text"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    maxLength={80}
                                    autoFocus
                                    aria-label={`Nuevo nombre para ${item.name}`}
                                    className="flex-1 min-w-0 min-h-9 px-3 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                                />
                                <button type="submit" className={iconButton} disabled={busy} aria-label="Guardar nombre" title="Guardar">
                                    <Check className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    className={iconButton}
                                    onClick={() => setEditingId(null)}
                                    disabled={busy}
                                    aria-label="Cancelar edición"
                                    title="Cancelar"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </form>
                        ) : (
                            <>
                                <span
                                    className={`flex-1 min-w-0 text-sm truncate ${
                                        item.active ? 'text-gray-900' : 'text-gray-400 line-through'
                                    }`}
                                >
                                    {item.name}
                                    {!item.active && <span className="ml-2 text-xs no-underline">(inactivo)</span>}
                                </span>
                                <button
                                    type="button"
                                    className={iconButton}
                                    onClick={() => startEdit(item)}
                                    disabled={busy}
                                    aria-label={`Renombrar ${item.name}`}
                                    title="Renombrar"
                                >
                                    <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => run(() => setServiceChecklistItemActive(item.id, !item.active))}
                                    disabled={busy}
                                    className="min-h-9 px-3 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                                >
                                    {item.active ? 'Desactivar' : 'Reactivar'}
                                </button>
                            </>
                        )}
                    </li>
                ))}
            </ul>

            <form onSubmit={handleAdd} className="flex gap-2">
                <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={80}
                    placeholder="Nuevo punto (ej. Filtro de aceite)"
                    aria-label="Nombre del nuevo punto"
                    className="flex-1 min-w-0 min-h-11 px-4 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                    type="submit"
                    disabled={busy || !newName.trim()}
                    className="inline-flex items-center gap-1 min-h-11 px-4 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                    <Plus className="w-4 h-4" />
                    Agregar
                </button>
            </form>

            {message && (
                <div
                    role={message.type === 'error' ? 'alert' : 'status'}
                    className={`p-3 text-sm rounded-md ${
                        message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                    }`}
                >
                    {message.text}
                </div>
            )}
        </section>
    );
}
