// app/dashboard/clients/[id]/ClientEditForm.tsx
'use client';

import { useState } from 'react';
import { updateClient, ClientDetails } from '@/actions/client.actions';
import { Save, X, CheckCircle, XCircle } from 'lucide-react';

// Se crea un tipo basado en ClientDetails para los campos editables
type EditableClientData = Omit<ClientDetails, 'carHistory'>;

export default function ClientEditForm({ client, onClose }: { client: EditableClientData, onClose: () => void }) {
    
    const [formData, setFormData] = useState({
        firstName: client.firstName,
        lastName: client.lastName,
        dni: client.dni || '',
        phone: client.phone || '',
        email: client.email || '',
        address: client.address || '',
    });

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        const dataToSend = {
            clientId: client.id,
            ...formData,
        };

        const result = await updateClient(dataToSend);
        
        if (result.success) {
            setMessage({ type: 'success', text: result.message });
            // Cierra el formulario y recarga los datos después de un breve delay
            setTimeout(() => {
                onClose();
                window.location.reload(); 
            }, 1000);
        } else {
            setMessage({ type: 'error', text: result.message });
        }

        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Mensajes de Estado */}
            {message && (
                <div className={`p-3 text-sm font-medium rounded-md flex items-center ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {message.type === 'success' ? <CheckCircle className="w-4 h-4 mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                    {message.text}
                </div>
            )}

            <div className="grid grid-cols-2 gap-4">
                <InputField label="Nombre" name="firstName" value={formData.firstName} onChange={handleChange} required />
                <InputField label="Apellido" name="lastName" value={formData.lastName} onChange={handleChange} required />
                <InputField label="DNI / CUIT" name="dni" value={formData.dni} onChange={handleChange} required />
                <InputField label="Teléfono" name="phone" value={formData.phone} onChange={handleChange} type="tel" required />
                <InputField label="Email" name="email" value={formData.email} onChange={handleChange} type="email" />
                <InputField label="Dirección" name="address" value={formData.address} onChange={handleChange} />
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300 transition"
                    disabled={loading}
                >
                    <X className="w-5 h-5 mr-2" />
                    Cancelar
                </button>
                <button
                    type="submit"
                    className="flex items-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-50 transition"
                    disabled={loading}
                >
                    <Save className="w-5 h-5 mr-2" />
                    {loading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </div>
        </form>
    );
}

// Componente utilitario de campo de entrada simple
const InputField = ({ label, name, value, onChange, type = 'text', required = false }: any) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input
            type={type}
            name={name}
            value={value}
            onChange={onChange}
            required={required}
            className="block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-800"
        />
    </div>
);