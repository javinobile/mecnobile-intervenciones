'use client';

import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, X } from 'lucide-react';
import { setInterventionIsService, setServiceCheck } from '@/actions/intervention.actions';
import type {
    ServiceCatalogItemDto,
    ServiceCheckDto,
    ServiceCheckStatusValue,
} from '@/lib/service-checklist';

/**
 * Checkbox "Es service" + checklist de puntos (SPEC 02).
 *
 * Modos:
 * - `controlled`: el padre guarda el valor (alta de OT, se envía junto con la creación).
 * - `autosave`: cada cambio se guarda al instante contra la OT (detalle de OT abierta).
 * - `readOnly` (en cualquiera de los dos): solo muestra; deja ver los puntos marcados.
 *
 * Presentación: en línea van el checkbox y un resumen de lo marcado; la tabla de puntos se abre
 * en un popup (al tildar "Es service" o con el botón "Abrir checklist").
 */

export type ServiceChecklistValue = {
    isService: boolean;
    /** checklistItemId → estado. Los puntos sin marcar no están en el mapa. */
    statuses: Record<string, ServiceCheckStatusValue>;
};

export const EMPTY_SERVICE_CHECKLIST: ServiceChecklistValue = { isService: false, statuses: {} };

type CommonProps = {
    /** Puntos activos del catálogo. */
    catalog: ServiceCatalogItemDto[];
    readOnly?: boolean;
};

type ControlledProps = CommonProps & {
    mode: 'controlled';
    value: ServiceChecklistValue;
    onChange: (value: ServiceChecklistValue) => void;
};

type AutosaveProps = CommonProps & {
    mode: 'autosave';
    interventionId: string;
    initialIsService: boolean;
    /** Puntos ya marcados en la OT (pueden incluir puntos hoy inactivos). */
    initialChecks: ServiceCheckDto[];
};

export type ServiceChecklistProps = ControlledProps | AutosaveProps;

type Row = { key: string; checklistItemId: string | null; name: string; sortOrder: number; inactive: boolean };

const STATUS_OPTIONS: { value: ServiceCheckStatusValue | null; label: string }[] = [
    { value: null, label: 'Sin marcar' },
    { value: 'REVISADO', label: 'Revisado' },
    { value: 'CAMBIADO', label: 'Cambiado' },
];

function statusesFromChecks(checks: ServiceCheckDto[]): Record<string, ServiceCheckStatusValue> {
    const out: Record<string, ServiceCheckStatusValue> = {};
    for (const c of checks) if (c.checklistItemId) out[c.checklistItemId] = c.status;
    return out;
}

/** Filas = catálogo activo ∪ puntos ya marcados en la OT (aunque estén inactivos). */
function buildRows(catalog: ServiceCatalogItemDto[], checks: ServiceCheckDto[]): Row[] {
    const rows = new Map<string, Row>();
    for (const item of catalog) {
        rows.set(item.id, { key: item.id, checklistItemId: item.id, name: item.name, sortOrder: item.sortOrder, inactive: false });
    }
    for (const check of checks) {
        if (check.checklistItemId && rows.has(check.checklistItemId)) continue;
        const key = check.checklistItemId ?? `snapshot:${check.name}`;
        rows.set(key, {
            key,
            checklistItemId: check.checklistItemId,
            // Para puntos fuera del catálogo activo se muestra el nombre guardado en la OT.
            name: check.name,
            sortOrder: check.sortOrder,
            inactive: true,
        });
    }
    return [...rows.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'));
}

export default function ServiceChecklist(props: ServiceChecklistProps) {
    const { catalog, readOnly = false } = props;

    // Estado local solo para el modo autosave; en modo controlado manda el padre.
    const [autoValue, setAutoValue] = useState<ServiceChecklistValue>(() =>
        props.mode === 'autosave'
            ? { isService: props.initialIsService, statuses: statusesFromChecks(props.initialChecks) }
            : EMPTY_SERVICE_CHECKLIST
    );
    const [pending, setPending] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);

    // Esc cierra el popup.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    const value = props.mode === 'controlled' ? props.value : autoValue;
    const initialChecks = props.mode === 'autosave' ? props.initialChecks : [];

    // Snapshots (nombre/orden) de los puntos marcados: sirven para mostrar puntos inactivos.
    const rows = useMemo(() => buildRows(catalog, initialChecks), [catalog, initialChecks]);
    const visibleRows = readOnly
        ? rows.filter((r) => r.checklistItemId && value.statuses[r.checklistItemId])
        : rows.filter((r) => !r.inactive || (r.checklistItemId && value.statuses[r.checklistItemId]));

    const markedCount = Object.keys(value.statuses).length;
    const changedCount = Object.values(value.statuses).filter((s) => s === 'CAMBIADO').length;
    const reviewedCount = markedCount - changedCount;
    const togglePending = pending.has('__isService');

    const setPendingKey = (key: string, on: boolean) =>
        setPending((prev) => {
            const next = new Set(prev);
            if (on) next.add(key);
            else next.delete(key);
            return next;
        });

    const handleToggleService = async (checked: boolean) => {
        if (readOnly) return;
        setError(null);

        if (!checked && markedCount > 0) {
            const ok = confirm(
                `Hay ${markedCount} punto(s) marcado(s) en el checklist. Si destildás "Es service" se van a borrar. ¿Continuar?`
            );
            if (!ok) return;
        }

        const next: ServiceChecklistValue = { isService: checked, statuses: checked ? value.statuses : {} };

        if (props.mode === 'controlled') {
            props.onChange(next);
            setOpen(checked);
            return;
        }

        const previous = autoValue;
        setAutoValue(next);
        setOpen(checked);
        setPendingKey('__isService', true);
        try {
            const result = await setInterventionIsService(props.interventionId, checked);
            if (!result.success) {
                setAutoValue(previous);
                setOpen(false);
                setError(result.message);
            }
        } catch {
            setAutoValue(previous);
            setOpen(false);
            setError('Error de conexión. No se guardó el cambio.');
        } finally {
            setPendingKey('__isService', false);
        }
    };

    const handleStatus = async (checklistItemId: string, status: ServiceCheckStatusValue | null) => {
        if (readOnly || !value.isService) return;
        if ((value.statuses[checklistItemId] ?? null) === status) return;
        setError(null);

        const statuses = { ...value.statuses };
        if (status) statuses[checklistItemId] = status;
        else delete statuses[checklistItemId];
        const next: ServiceChecklistValue = { ...value, statuses };

        if (props.mode === 'controlled') {
            props.onChange(next);
            return;
        }

        // Se aplica solo sobre este punto (update funcional) para no pisar
        // cambios optimistas de otros puntos que se estén guardando en paralelo.
        const applyToRow = (rowStatus: ServiceCheckStatusValue | null | undefined) =>
            setAutoValue((current) => {
                const updated = { ...current.statuses };
                if (rowStatus) updated[checklistItemId] = rowStatus;
                else delete updated[checklistItemId];
                return { ...current, statuses: updated };
            });

        const previousStatus = autoValue.statuses[checklistItemId];
        applyToRow(status);
        setPendingKey(checklistItemId, true);

        const revert = () => applyToRow(previousStatus);

        try {
            const result = await setServiceCheck(props.interventionId, checklistItemId, status);
            if (!result.success) {
                revert();
                setError(result.message);
            }
        } catch {
            revert();
            setError('Error de conexión. No se guardó el punto.');
        } finally {
            setPendingKey(checklistItemId, false);
        }
    };

    return (
        <div className="space-y-3">
            <label
                className={`flex items-center gap-3 min-h-11 text-base font-semibold text-gray-800 ${
                    readOnly ? 'cursor-default' : 'cursor-pointer'
                }`}
            >
                <input
                    type="checkbox"
                    className="w-5 h-5"
                    checked={value.isService}
                    disabled={readOnly || togglePending}
                    onChange={(e) => handleToggleService(e.target.checked)}
                />
                <ClipboardCheck className="w-5 h-5 text-blue-600" />
                Es service
            </label>

            {value.isService && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-8">
                    <span className="text-sm text-gray-600">
                        {markedCount === 0
                            ? 'Sin puntos marcados'
                            : [
                                  changedCount > 0 && `${changedCount} cambiado${changedCount === 1 ? '' : 's'}`,
                                  reviewedCount > 0 && `${reviewedCount} revisado${reviewedCount === 1 ? '' : 's'}`,
                              ]
                                  .filter(Boolean)
                                  .join(' · ')}
                    </span>
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="min-h-9 px-3 rounded-lg border border-blue-300 text-sm font-medium text-blue-700 hover:bg-blue-50"
                    >
                        {readOnly ? 'Ver checklist' : 'Abrir checklist'}
                    </button>
                </div>
            )}

            {value.isService && open && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4"
                    onClick={() => setOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="service-checklist-title"
                        className="bg-white w-full sm:max-w-xl max-h-[92vh] flex flex-col rounded-t-xl sm:rounded-xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
                            <h2 id="service-checklist-title" className="text-lg font-bold text-gray-800 flex items-center">
                                <ClipboardCheck className="w-5 h-5 mr-2 text-blue-600" />
                                Checklist de service
                            </h2>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="min-h-9 min-w-9 inline-flex items-center justify-center text-gray-400 hover:text-gray-600"
                                aria-label="Cerrar checklist"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {visibleRows.length === 0 ? (
                                <p className="p-3 text-sm text-gray-500">
                                    {readOnly ? 'Sin puntos registrados.' : 'No hay puntos activos en el catálogo.'}
                                </p>
                            ) : (
                                <ul className="divide-y divide-gray-100">
                                    {visibleRows.map((row) => {
                                        const id = row.checklistItemId;
                                        const current = id ? value.statuses[id] ?? null : null;
                                        const rowPending = id ? pending.has(id) : false;
                                        const disabled = readOnly || !id || rowPending;
                                        return (
                                            <li
                                                key={row.key}
                                                className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2"
                                            >
                                                <span className="flex-1 text-sm text-gray-900">
                                                    {row.name}
                                                    {row.inactive && (
                                                        <span className="ml-2 text-xs text-gray-400">(fuera del catálogo)</span>
                                                    )}
                                                </span>
                                                <div
                                                    role="radiogroup"
                                                    aria-label={`Estado de ${row.name}`}
                                                    className="inline-flex rounded-lg border border-gray-300 overflow-hidden self-start sm:self-auto"
                                                >
                                                    {STATUS_OPTIONS.map((opt) => {
                                                        const selected = current === opt.value;
                                                        const selectedClass =
                                                            opt.value === 'CAMBIADO'
                                                                ? 'bg-green-600 text-white'
                                                                : opt.value === 'REVISADO'
                                                                  ? 'bg-blue-600 text-white'
                                                                  : 'bg-gray-200 text-gray-800';
                                                        return (
                                                            <button
                                                                key={opt.label}
                                                                type="button"
                                                                role="radio"
                                                                aria-checked={selected}
                                                                disabled={disabled}
                                                                onClick={() => id && handleStatus(id, opt.value)}
                                                                className={`min-h-9 px-3 text-xs font-medium border-l border-gray-300 first:border-l-0 disabled:cursor-not-allowed ${
                                                                    selected ? selectedClass : 'bg-white text-gray-600 hover:bg-gray-50'
                                                                } ${disabled && !selected ? 'opacity-50' : ''}`}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                        {error && (
                            <p role="alert" className="mx-4 mt-3 p-3 text-sm rounded-md bg-red-50 text-red-800">
                                {error}
                            </p>
                        )}
                        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t">
                            <span className="text-xs text-gray-500">
                                {readOnly
                                    ? 'Solo lectura.'
                                    : props.mode === 'autosave'
                                      ? 'Cada cambio se guarda automáticamente.'
                                      : 'Se guarda al crear la OT.'}
                            </span>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="min-h-11 px-5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
                            >
                                Listo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {error && !open && (
                <p role="alert" className="p-3 text-sm rounded-md bg-red-50 text-red-800">
                    {error}
                </p>
            )}
        </div>
    );
}
