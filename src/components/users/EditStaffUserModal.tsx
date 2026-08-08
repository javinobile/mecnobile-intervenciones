'use client';

import { useEffect, useState } from 'react';
import { X, Pencil, Loader2 } from 'lucide-react';
import { adminUpdateStaffUser, UserListItem } from '@/actions/user.actions';

interface EditStaffUserModalProps {
    user: UserListItem | null;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (success: boolean, message: string) => void;
}

const STAFF_ROLES = ['MECHANIC', 'VIEWER'] as const;

export default function EditStaffUserModal({ user, isOpen, onClose, onSuccess }: EditStaffUserModalProps) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<'MECHANIC' | 'VIEWER'>('MECHANIC');
    const [newPassword, setNewPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'error'; text: string } | null>(null);

    useEffect(() => {
        if (user && isOpen) {
            setName(user.name || '');
            setEmail(user.email);
            setRole(user.role === 'VIEWER' ? 'VIEWER' : 'MECHANIC');
            setNewPassword('');
            setMessage(null);
            setIsSubmitting(false);
        }
    }, [user, isOpen]);

    if (!isOpen || !user) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        setIsSubmitting(true);

        const result = await adminUpdateStaffUser(user.id, {
            name,
            email,
            role,
            newPassword: newPassword.trim() || undefined,
        });

        if (result.success) {
            onSuccess(true, result.message);
        } else {
            setMessage({ type: 'error', text: result.message });
        }
        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
                <div className="flex justify-between items-center border-b pb-3 mb-4">
                    <h2 className="text-xl font-bold flex items-center text-gray-800">
                        <Pencil className="w-5 h-5 mr-2 text-blue-600" />
                        Editar usuario
                    </h2>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {message && (
                    <div className="p-3 mb-4 rounded-md text-sm bg-red-100 text-red-700">
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700">Nombre completo</label>
                        <input
                            id="edit-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                        />
                    </div>

                    <div>
                        <label htmlFor="edit-email" className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                            id="edit-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                        />
                    </div>

                    <div>
                        <label htmlFor="edit-role" className="block text-sm font-medium text-gray-700">Rol</label>
                        <select
                            id="edit-role"
                            value={role}
                            onChange={(e) => setRole(e.target.value as 'MECHANIC' | 'VIEWER')}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                        >
                            {STAFF_ROLES.map((r) => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="edit-password" className="block text-sm font-medium text-gray-700">
                            Nueva contraseña (opcional)
                        </label>
                        <input
                            id="edit-password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Dejar vacío para no cambiarla"
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Usá esto para setear o reiniciar la contraseña. Luego el usuario puede cambiarla en Mi Perfil.
                        </p>
                    </div>

                    <div className="pt-2 flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex items-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isSubmitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Pencil className="w-5 h-5 mr-2" />}
                            Guardar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
