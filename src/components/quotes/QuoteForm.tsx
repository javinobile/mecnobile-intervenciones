'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Car, Link2Off, Search, User } from 'lucide-react';
import {
    searchCarsForOt,
    searchClientsForOt,
    type OtCarSearchResult,
    type OtClientSearchResult,
} from '@/actions/intervention.actions';
import { createQuote, updateQuote, type QuoteFormInput } from '@/actions/quote.actions';

export type QuoteFormValues = {
    clientId: string | null;
    clientLabel: string | null;
    carId: string | null;
    carLabel: string | null;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    vehiclePlate: string;
    vehicleDescription: string;
    description: string;
    notes: string;
    /** YYYY-MM-DD */
    validUntil: string;
};

const inputClass =
    'w-full min-h-11 px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-blue-500 focus:border-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
const sectionClass = 'bg-white p-4 sm:p-6 rounded-xl border border-gray-200 shadow-sm space-y-4';

const carText = (c: { make: string; model: string; year: number | null }) =>
    [c.make, c.model, c.year?.toString()].filter((v) => v && v !== 'N/A').join(' ');

/** Búsqueda con debounce (300 ms, mínimo 2 caracteres), igual que en "Abrir OT". */
function useDebouncedSearch<T>(term: string, search: (t: string) => Promise<T[]>) {
    const [results, setResults] = useState<T[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (term.trim().length < 2) {
            setResults([]);
            return;
        }
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                setResults(await search(term));
            } finally {
                setLoading(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [term, search]);

    return { results, loading, clear: () => setResults([]) };
}

/**
 * Alta (sin `quoteId`) o edición de los datos de un presupuesto.
 * En edición, al guardar refresca la página y llama a `onDone`.
 */
export default function QuoteForm({
    initialValues,
    quoteId,
    onDone,
}: {
    initialValues: QuoteFormValues;
    quoteId?: string;
    onDone?: () => void;
}) {
    const router = useRouter();
    const [values, setValues] = useState<QuoteFormValues>(initialValues);
    const [clientTerm, setClientTerm] = useState('');
    const [carTerm, setCarTerm] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Edición: se espera a que el refresh traiga los datos nuevos antes de cerrar el formulario,
    // así el resumen no muestra un instante los valores viejos.
    const [refreshing, startRefresh] = useTransition();
    const [awaitingRefresh, setAwaitingRefresh] = useState(false);

    useEffect(() => {
        if (awaitingRefresh && !refreshing) {
            setAwaitingRefresh(false);
            onDone?.();
        }
    }, [awaitingRefresh, refreshing, onDone]);

    const clientSearch = useDebouncedSearch<OtClientSearchResult>(clientTerm, searchClientsForOt);
    const carSearch = useDebouncedSearch<OtCarSearchResult>(carTerm, searchCarsForOt);

    const set = <K extends keyof QuoteFormValues>(key: K, value: QuoteFormValues[K]) =>
        setValues((v) => ({ ...v, [key]: value }));

    const pickClient = (c: OtClientSearchResult) => {
        setValues((v) => ({
            ...v,
            clientId: c.id,
            clientLabel: `${c.fullName} · DNI ${c.dni}`,
            customerName: c.fullName,
            customerPhone: c.phone ?? '',
            customerEmail: c.email ?? '',
        }));
        setClientTerm('');
        clientSearch.clear();
    };

    const pickCar = (c: OtCarSearchResult) => {
        setValues((v) => ({
            ...v,
            carId: c.id,
            carLabel: `${c.plate} · ${carText(c)}`,
            vehiclePlate: c.plate,
            vehicleDescription: carText(c),
        }));
        setCarTerm('');
        carSearch.clear();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        const input: QuoteFormInput = {
            clientId: values.clientId,
            carId: values.carId,
            customerName: values.customerName,
            customerPhone: values.customerPhone,
            customerEmail: values.customerEmail,
            vehiclePlate: values.vehiclePlate,
            vehicleDescription: values.vehicleDescription,
            description: values.description,
            notes: values.notes,
            validUntil: values.validUntil,
        };
        try {
            const result = quoteId ? await updateQuote(quoteId, input) : await createQuote(input);
            if (!result.success || !result.quote) {
                setError(result.message);
                return;
            }
            if (quoteId) {
                setAwaitingRefresh(true);
                startRefresh(() => router.refresh());
            } else {
                router.push(`/dashboard/presupuestos/${result.quote.id}`);
            }
        } catch {
            setError('Error al guardar el presupuesto.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl">
            {/* Cliente */}
            <section className={sectionClass}>
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-600" /> Cliente
                </h2>

                {values.clientId ? (
                    <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
                        <span>Vinculado a: {values.clientLabel}</span>
                        <button
                            type="button"
                            onClick={() => setValues((v) => ({ ...v, clientId: null, clientLabel: null }))}
                            className="flex items-center gap-1 text-blue-700 hover:text-blue-900 shrink-0"
                        >
                            <Link2Off className="w-4 h-4" /> Quitar vínculo
                        </button>
                    </div>
                ) : (
                    <div className="relative">
                        <label htmlFor="clientSearch" className={labelClass}>
                            Buscar cliente existente (opcional)
                        </label>
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                id="clientSearch"
                                type="text"
                                value={clientTerm}
                                onChange={(e) => setClientTerm(e.target.value)}
                                placeholder="Nombre, DNI, teléfono o email"
                                className={`${inputClass} pl-9`}
                                autoComplete="off"
                            />
                        </div>
                        {clientSearch.loading && <p className="mt-1 text-xs text-gray-500">Buscando…</p>}
                        {clientSearch.results.length > 0 && (
                            <ul className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto">
                                {clientSearch.results.map((c) => (
                                    <li key={c.id}>
                                        <button
                                            type="button"
                                            onClick={() => pickClient(c)}
                                            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                                        >
                                            <span className="font-medium text-gray-900">{c.fullName}</span>
                                            <span className="text-gray-500"> · DNI {c.dni}</span>
                                            {c.phone && <span className="text-gray-500"> · {c.phone}</span>}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="mt-1 text-xs text-gray-500">
                            Si es alguien nuevo, completá los datos abajo sin vincular.
                        </p>
                    </div>
                )}

                <div>
                    <label htmlFor="customerName" className={labelClass}>
                        Nombre y apellido *
                    </label>
                    <input
                        id="customerName"
                        type="text"
                        value={values.customerName}
                        onChange={(e) => set('customerName', e.target.value)}
                        className={inputClass}
                        required
                    />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="customerPhone" className={labelClass}>
                            Teléfono
                        </label>
                        <input
                            id="customerPhone"
                            type="tel"
                            value={values.customerPhone}
                            onChange={(e) => set('customerPhone', e.target.value)}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label htmlFor="customerEmail" className={labelClass}>
                            Email
                        </label>
                        <input
                            id="customerEmail"
                            type="email"
                            value={values.customerEmail}
                            onChange={(e) => set('customerEmail', e.target.value)}
                            className={inputClass}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Si está completo, al emitir se envía el presupuesto por email.
                        </p>
                    </div>
                </div>
            </section>

            {/* Vehículo */}
            <section className={sectionClass}>
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                    <Car className="w-4 h-4 text-blue-600" /> Vehículo
                </h2>

                {values.carId ? (
                    <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
                        <span>Vinculado a: {values.carLabel}</span>
                        <button
                            type="button"
                            onClick={() => setValues((v) => ({ ...v, carId: null, carLabel: null }))}
                            className="flex items-center gap-1 text-blue-700 hover:text-blue-900 shrink-0"
                        >
                            <Link2Off className="w-4 h-4" /> Quitar vínculo
                        </button>
                    </div>
                ) : (
                    <div>
                        <label htmlFor="carSearch" className={labelClass}>
                            Buscar vehículo existente (opcional)
                        </label>
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                id="carSearch"
                                type="text"
                                value={carTerm}
                                onChange={(e) => setCarTerm(e.target.value)}
                                placeholder="Dominio, VIN, marca o modelo"
                                className={`${inputClass} pl-9`}
                                autoComplete="off"
                            />
                        </div>
                        {carSearch.loading && <p className="mt-1 text-xs text-gray-500">Buscando…</p>}
                        {carSearch.results.length > 0 && (
                            <ul className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto">
                                {carSearch.results.map((c) => (
                                    <li key={c.id}>
                                        <button
                                            type="button"
                                            onClick={() => pickCar(c)}
                                            className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                                        >
                                            <span className="font-mono font-medium text-gray-900">{c.plate}</span>
                                            <span className="text-gray-500"> · {carText(c)}</span>
                                            <span className="text-gray-400"> · {c.ownerName}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="vehiclePlate" className={labelClass}>
                            Dominio
                        </label>
                        <input
                            id="vehiclePlate"
                            type="text"
                            value={values.vehiclePlate}
                            onChange={(e) => set('vehiclePlate', e.target.value.toUpperCase())}
                            placeholder="AB123CD"
                            className={`${inputClass} font-mono`}
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <label htmlFor="vehicleDescription" className={labelClass}>
                            Marca, modelo y año
                        </label>
                        <input
                            id="vehicleDescription"
                            type="text"
                            value={values.vehicleDescription}
                            onChange={(e) => set('vehicleDescription', e.target.value)}
                            placeholder="Ej: Volkswagen Gol Trend 2015"
                            className={inputClass}
                        />
                    </div>
                </div>
            </section>

            {/* Trabajo */}
            <section className={sectionClass}>
                <div>
                    <label htmlFor="description" className={labelClass}>
                        Trabajo consultado
                    </label>
                    <textarea
                        id="description"
                        rows={3}
                        value={values.description}
                        onChange={(e) => set('description', e.target.value)}
                        placeholder="Qué pidió el cliente o qué se detectó"
                        className={inputClass}
                    />
                </div>
                <div>
                    <label htmlFor="notes" className={labelClass}>
                        Observaciones (salen en el PDF)
                    </label>
                    <textarea
                        id="notes"
                        rows={2}
                        value={values.notes}
                        onChange={(e) => set('notes', e.target.value)}
                        className={inputClass}
                    />
                </div>
                <div className="sm:max-w-xs">
                    <label htmlFor="validUntil" className={labelClass}>
                        Válido hasta
                    </label>
                    <input
                        id="validUntil"
                        type="date"
                        value={values.validUntil}
                        onChange={(e) => set('validUntil', e.target.value)}
                        className={inputClass}
                        required
                    />
                </div>
            </section>

            {error && (
                <div className="p-3 text-sm rounded-md bg-red-50 text-red-800 border border-red-200">{error}</div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                    type="button"
                    onClick={() => (onDone ? onDone() : router.push('/dashboard/presupuestos'))}
                    className="min-h-11 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={saving || awaitingRefresh}
                    className="min-h-11 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                    {saving || awaitingRefresh ? 'Guardando…' : quoteId ? 'Guardar cambios' : 'Guardar borrador'}
                </button>
            </div>
        </form>
    );
}
