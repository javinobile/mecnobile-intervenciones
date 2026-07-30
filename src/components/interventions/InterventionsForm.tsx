'use client';

import { useEffect, useState } from 'react';
import {
    updateIntervention,
    closeIntervention,
    requestCancelIntervention,
    approveCancelIntervention,
    rejectCancelIntervention,
} from '@/actions/intervention.actions';
import { useRouter } from 'next/navigation';

interface InterventionEditFormProps {
    interventionId: string;
    initialNotes: string | null;
    initialDescription: string;
    initialMileageKm: number;
    canEditContent: boolean;
    canClose: boolean;
    canRequestCancel: boolean;
    canResolveCancel: boolean;
    displayStatus: string;
    isAdmin: boolean;
}

type FormSnapshot = {
    notes: string;
    description: string;
    mileageKm: string;
};

const inputClass =
    'w-full min-h-11 px-4 py-2 mt-1 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base';

function snapshotsEqual(a: FormSnapshot, b: FormSnapshot) {
    return (
        a.notes === b.notes &&
        a.description === b.description &&
        a.mileageKm === b.mileageKm
    );
}

export default function InterventionEditForm({
    initialNotes,
    interventionId,
    initialDescription,
    initialMileageKm,
    canEditContent,
    canClose,
    canRequestCancel,
    canResolveCancel,
    displayStatus,
    isAdmin,
}: InterventionEditFormProps) {
    const router = useRouter();
    const [notes, setNotes] = useState(initialNotes || '');
    const [description, setDescription] = useState(initialDescription);
    const [mileageKm, setMileageKm] = useState(initialMileageKm.toString());
    const [saved, setSaved] = useState<FormSnapshot>({
        notes: initialNotes || '',
        description: initialDescription,
        mileageKm: initialMileageKm.toString(),
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [confirmClose, setConfirmClose] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(false);

    // Si el servidor refresca props (tras guardar u otra acción), sincronizar baseline
    useEffect(() => {
        const next: FormSnapshot = {
            notes: initialNotes || '',
            description: initialDescription,
            mileageKm: initialMileageKm.toString(),
        };
        setSaved(next);
        setNotes(next.notes);
        setDescription(next.description);
        setMileageKm(next.mileageKm);
    }, [initialNotes, initialDescription, initialMileageKm]);

    const current: FormSnapshot = { notes, description, mileageKm };
    const isDirty = !snapshotsEqual(current, saved);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canEditContent || !isDirty) return;
        setLoading(true);
        setMessage(null);

        try {
            const result = await updateIntervention({
                id: interventionId,
                notes,
                description,
                mileageKm,
            });

            if (!result.success) throw new Error(result.message);
            setSaved(current);
            setMessage({ type: 'success', text: result.message });
            router.refresh();
        } catch (err: unknown) {
            setMessage({
                type: 'error',
                text: err instanceof Error ? err.message : 'Error al guardar los cambios.',
            });
        } finally {
            setLoading(false);
        }
    };

    const runAction = async (action: () => Promise<{ success: boolean; message: string }>) => {
        if (isDirty) {
            setMessage({
                type: 'error',
                text: 'Hay cambios sin guardar. Guardalos o descartalos antes de continuar.',
            });
            setConfirmClose(false);
            setConfirmCancel(false);
            return;
        }
        setLoading(true);
        setMessage(null);
        setConfirmClose(false);
        setConfirmCancel(false);
        try {
            const result = await action();
            if (!result.success) throw new Error(result.message);
            setMessage({ type: 'success', text: result.message });
            router.refresh();
        } catch (err: unknown) {
            setMessage({
                type: 'error',
                text: err instanceof Error ? err.message : 'Error al procesar la acción.',
            });
        } finally {
            setLoading(false);
        }
    };

    const discardChanges = () => {
        setNotes(saved.notes);
        setDescription(saved.description);
        setMileageKm(saved.mileageKm);
        setMessage(null);
    };

    return (
        <div className="mt-4 space-y-4">
            {canEditContent ? (
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                            Descripción del problema
                        </label>
                        <textarea
                            id="description"
                            rows={3}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label htmlFor="mileageKm" className="block text-sm font-medium text-gray-700">
                            Kilometraje
                        </label>
                        <input
                            id="mileageKm"
                            type="number"
                            value={mileageKm}
                            onChange={(e) => setMileageKm(e.target.value)}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                            Notas de taller / seguimiento
                        </label>
                        <textarea
                            id="notes"
                            rows={4}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className={inputClass}
                            placeholder="Detalles sobre el proceso de reparación..."
                        />
                    </div>

                    {isDirty && (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 text-sm rounded-md bg-amber-50 text-amber-900 border border-amber-200">
                            <span className="font-medium">Hay cambios sin guardar.</span>
                            <button
                                type="button"
                                onClick={discardChanges}
                                className="text-amber-800 underline font-medium text-left sm:text-right"
                            >
                                Descartar cambios
                            </button>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !isDirty}
                        className={`w-full min-h-11 px-4 py-2 font-semibold rounded-lg shadow-md transition duration-150 disabled:cursor-not-allowed ${
                            isDirty
                                ? 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                                : 'bg-gray-200 text-gray-500'
                        }`}
                    >
                        {loading ? 'Guardando...' : isDirty ? 'Guardar cambios' : 'Sin cambios para guardar'}
                    </button>
                </form>
            ) : (
                <div className="space-y-3 text-sm text-gray-600">
                    <div>
                        <h3 className="font-semibold text-gray-700">Descripción</h3>
                        <p className="whitespace-pre-wrap">{description}</p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-700">Km</h3>
                        <p>{Number(mileageKm).toLocaleString('es-AR')}</p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-700">Notas</h3>
                        <p className="whitespace-pre-wrap">{notes || 'Sin notas.'}</p>
                    </div>
                    {displayStatus === 'CANCELADA' && (
                        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
                            Esta OT está cancelada y no se puede modificar ni reabrir.
                        </p>
                    )}
                    {displayStatus === 'CERRADA' && (
                        <p className="text-xs text-gray-500">
                            OT cerrada: queda como comprobante y no se puede modificar.
                        </p>
                    )}
                </div>
            )}

            {/* Admin: resolver cancelación pendiente */}
            {canResolveCancel && (
                <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 space-y-3">
                    <p className="text-sm text-amber-900 font-medium">
                        Hay una solicitud de cancelación pendiente de autorización.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => runAction(() => rejectCancelIntervention(interventionId))}
                            className="flex-1 min-h-11 rounded-lg border border-gray-300 bg-white font-semibold text-gray-800 disabled:opacity-50"
                        >
                            Volver a abierta
                        </button>
                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => runAction(() => approveCancelIntervention(interventionId))}
                            className="flex-1 min-h-11 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-50"
                        >
                            Autorizar cancelación
                        </button>
                    </div>
                </div>
            )}

            {/* Cerrar / Cancelar */}
            {(canClose || canRequestCancel) && (
                <div className="pt-2 border-t border-gray-200 space-y-2">
                    {canClose && !confirmClose && (
                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => setConfirmClose(true)}
                            className="w-full min-h-11 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50"
                        >
                            Cerrar orden de trabajo
                        </button>
                    )}

                    {confirmClose && (
                        <div className="p-4 rounded-xl border border-green-300 bg-green-50 space-y-3">
                            <p className="text-sm text-green-900">
                                ¿Confirmás el cierre? Una vez cerrada, <strong>no se podrá volver a abrir</strong> ni
                                modificar desde el rol mecánico. Solo un administrador podrá introducir cambios.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <button
                                    type="button"
                                    onClick={() => setConfirmClose(false)}
                                    className="flex-1 min-h-11 rounded-lg border border-gray-300 bg-white font-medium"
                                >
                                    Volver
                                </button>
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => runAction(() => closeIntervention(interventionId))}
                                    className="flex-1 min-h-11 rounded-lg bg-green-600 text-white font-semibold disabled:opacity-50"
                                >
                                    Sí, cerrar OT
                                </button>
                            </div>
                        </div>
                    )}

                    {canRequestCancel && !confirmCancel && (
                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => setConfirmCancel(true)}
                            className="w-full min-h-11 rounded-lg border border-red-300 text-red-700 font-semibold hover:bg-red-50 disabled:opacity-50"
                        >
                            {isAdmin ? 'Cancelar orden de trabajo' : 'Solicitar cancelación'}
                        </button>
                    )}

                    {confirmCancel && (
                        <div className="p-4 rounded-xl border border-red-300 bg-red-50 space-y-3">
                            <p className="text-sm text-red-900">
                                {isAdmin ? (
                                    <>
                                        ¿Confirmás la cancelación? Una OT cancelada <strong>no se puede reabrir ni modificar</strong>.
                                    </>
                                ) : (
                                    <>
                                        ¿Solicitar cancelación? La OT te figurará como cancelada, pero{' '}
                                        <strong>solo quedará cancelada cuando el administrador la autorice</strong>.
                                        Una vez autorizada, no se podrá reabrir ni modificar.
                                    </>
                                )}
                            </p>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <button
                                    type="button"
                                    onClick={() => setConfirmCancel(false)}
                                    className="flex-1 min-h-11 rounded-lg border border-gray-300 bg-white font-medium"
                                >
                                    Volver
                                </button>
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => runAction(() => requestCancelIntervention(interventionId))}
                                    className="flex-1 min-h-11 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-50"
                                >
                                    {isAdmin ? 'Sí, cancelar OT' : 'Sí, solicitar cancelación'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {message && (
                <div className={`p-3 text-sm font-medium rounded-md ${message.type === 'success' ? 'text-green-700 bg-green-100 border border-green-300' : 'text-red-700 bg-red-100 border border-red-300'}`}>
                    {message.text}
                </div>
            )}
        </div>
    );
}
