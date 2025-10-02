// app/components/interventions/InterventionEditForm.tsx
'use client';

import { useState } from 'react';
import { Intervention } from '../../../generated/prisma';
import { updateIntervention } from '@/actions/intervention.actions';

// Props simplificadas para facilitar el paso de datos
interface InterventionEditFormProps {
    initialNotes: string | null;
    initialCost: number;
    initialStatus: Intervention['status'];
    interventionId: string;
}

const statusOptions = [
    { value: 'PENDING_PAYMENT', label: 'Pendiente Pago' },
    { value: 'COMPLETED', label: 'Completada' },
    { value: 'CANCELLED', label: 'Cancelada' },
    // Si agregas PENDING o IN_PROGRESS, añádelos aquí:
    // { value: 'PENDING', label: 'Pendiente de Inicio' },
];


export default function InterventionEditForm({ 
    initialNotes, 
    initialCost, 
    initialStatus, 
    interventionId 
}: InterventionEditFormProps) {
    
    const [notes, setNotes] = useState(initialNotes || '');
    // El costo lo manejamos como string en el estado para el input
    const [cost, setCost] = useState(initialCost.toString()); 
    const [status, setStatus] = useState(initialStatus);

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            const data = {
                id: interventionId,
                notes,
                cost,
                status,
            };

            const result = await updateIntervention(data);

            if (!result.success) {
                throw new Error(result.message);
            }

            // Éxito: El revalidatePath se encargará de refrescar los datos en la página de servidor.
            setMessage({ type: 'success', text: result.message });

        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Error al guardar los cambios.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            
            {/* 1. Notas de Actualización */}
            <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                    Notas de Taller / Seguimiento
                </label>
                <textarea
                    id="notes"
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500"
                    placeholder="Detalles sobre el proceso de reparación, piezas utilizadas, etc."
                />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                {/* 2. Costo Total */}
                <div>
                    <label htmlFor="cost" className="block text-sm font-medium text-gray-700">
                        Costo Total (Mano de Obra + Repuestos)
                    </label>
                    <input
                        id="cost"
                        type="number"
                        step="0.01"
                        value={cost}
                        onChange={(e) => setCost(e.target.value)}
                        className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500"
                        placeholder="Ej: 55000.00"
                        required
                    />
                </div>
                
                {/* 3. Estado de la OT */}
                <div>
                    <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                        Cambiar Estado
                    </label>
                    <select
                        id="status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as Intervention['status'])}
                        className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg shadow-sm focus:ring-purple-500 focus:border-purple-500"
                        required
                    >
                        {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Mensaje de estado */}
            {message && (
                <div className={`p-3 text-sm font-medium rounded-md ${message.type === 'success' ? 'text-green-700 bg-green-100 border border-green-300' : 'text-red-700 bg-red-100 border border-red-300'}`}>
                    {message.text}
                </div>
            )}

            {/* Botón de Envío */}
            <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 disabled:opacity-50 transition duration-150"
            >
                {loading ? 'Guardando...' : 'Guardar Cambios y Actualizar OT'}
            </button>
        </form>
    );
}