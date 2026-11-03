'use client';

import { useState } from 'react';
import { Car, Pencil, User } from 'lucide-react';
import type { QuoteDetail } from '@/actions/quote.actions';
import QuoteForm, { type QuoteFormValues } from './QuoteForm';

/** YYYY-MM-DD local para <input type="date">. */
function toDateInput(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function Row({ label, value }: { label: string; value: string | null }) {
    return (
        <div>
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="text-sm text-gray-900 break-words">{value || '—'}</dd>
        </div>
    );
}

/** Datos del cliente, vehículo y trabajo. Muestra el resumen o, si es editable, el formulario. */
export default function QuoteDataPanel({ quote }: { quote: QuoteDetail }) {
    const [editing, setEditing] = useState(false);

    if (editing && quote.editable) {
        const initialValues: QuoteFormValues = {
            clientId: quote.clientId,
            clientLabel: quote.clientLabel,
            carId: quote.carId,
            carLabel: quote.carLabel,
            customerName: quote.customerName,
            customerPhone: quote.customerPhone ?? '',
            customerEmail: quote.customerEmail ?? '',
            vehiclePlate: quote.vehiclePlate ?? '',
            vehicleDescription: quote.vehicleDescription ?? '',
            description: quote.description ?? '',
            notes: quote.notes ?? '',
            validUntil: toDateInput(quote.validUntil),
        };
        return <QuoteForm initialValues={initialValues} quoteId={quote.id} onDone={() => setEditing(false)} />;
    }

    return (
        <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-200 shadow-sm space-y-5">
            <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold text-gray-800">Datos</h2>
                {quote.editable && (
                    <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="flex items-center gap-1.5 min-h-11 px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-lg"
                    >
                        <Pencil className="w-4 h-4" /> Editar datos
                    </button>
                )}
            </div>

            <section>
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
                    <User className="w-4 h-4 text-blue-600" /> Cliente
                    {quote.clientLabel && (
                        <span className="text-xs font-normal text-gray-500">(vinculado: {quote.clientLabel})</span>
                    )}
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Row label="Nombre" value={quote.customerName} />
                    <Row label="Teléfono" value={quote.customerPhone} />
                    <Row label="Email" value={quote.customerEmail} />
                </dl>
            </section>

            <section>
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
                    <Car className="w-4 h-4 text-blue-600" /> Vehículo
                    {quote.carLabel && (
                        <span className="text-xs font-normal text-gray-500">(vinculado: {quote.carLabel})</span>
                    )}
                </h3>
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Row label="Dominio" value={quote.vehiclePlate} />
                    <div className="sm:col-span-2">
                        <Row label="Marca, modelo y año" value={quote.vehicleDescription} />
                    </div>
                </dl>
            </section>

            <dl className="grid grid-cols-1 gap-3">
                <Row label="Trabajo consultado" value={quote.description} />
                <Row label="Observaciones (salen en el PDF)" value={quote.notes} />
            </dl>
        </div>
    );
}
