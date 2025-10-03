// app/components/users/CreateUserModal.tsx
'use client';

import { useState } from 'react';
import { X, UserPlus, Loader2 } from 'lucide-react';
import { createUser } from '@/actions/user.actions';

interface CreateUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (success: boolean, message: string) => void;
}

const ROLES = ['MECHANIC', 'ADMIN', 'VIEWER'];

export default function CreateUserModal({ isOpen, onClose, onSuccess }: CreateUserModalProps) {
    if (!isOpen) return null;

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'ADMIN' | 'MECHANIC' | 'VIEWER'>('MECHANIC');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'error', text: string } | null>(null);

    const resetForm = () => {
        setName('');
        setEmail('');
        setPassword('');
        setRole('MECHANIC');
        setMessage(null);
        setIsSubmitting(false);
    }

    const handleInternalClose = () => {
        resetForm();
        onClose();
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setIsSubmitting(true);
        
        const result = await createUser({ name, email, password, role });
        
        if (result.success) {
            onSuccess(true, result.message);
            resetForm();
        } else {
            setMessage({ type: 'error', text: result.message });
        }

        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 transition-opacity">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
                
                {/* Encabezado */}
                <div className="flex justify-between items-center border-b pb-3 mb-4">
                    <h2 className="text-2xl font-bold flex items-center text-gray-800">
                        <UserPlus className="w-6 h-6 mr-2 text-blue-600" />
                        Crear Nuevo Usuario
                    </h2>
                    <button onClick={handleInternalClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Mensaje de Error */}
                {message && (
                    <div className="p-3 mb-4 rounded-md text-sm bg-red-100 text-red-700">
                        {message.text}
                    </div>
                )}

                {/* Formulario */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    
                    {/* Nombre */}
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nombre Completo</label>
                        <input type="text" id="name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                    </div>

                    {/* Email */}
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                        <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                    </div>

                    {/* Contraseña */}
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700">Contraseña Temporal (mín. 6)</label>
                        <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                    </div>

                    {/* Rol */}
                    <div>
                        <label htmlFor="role" className="block text-sm font-medium text-gray-700">Rol de Usuario</label>
                        <select id="role" value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'MECHANIC' | 'VIEWER')} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2">
                            {ROLES.map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>

                    {/* Botón de Creación */}
                    <div className="pt-2 flex justify-end space-x-3">
                        <button type="button" onClick={handleInternalClose} disabled={isSubmitting} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50">
                            Cancelar
                        </button>
                        <button type="submit" disabled={isSubmitting} className="flex items-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-50 transition duration-150">
                            {isSubmitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <UserPlus className="w-5 h-5 mr-2" />}
                            Crear Usuario
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}