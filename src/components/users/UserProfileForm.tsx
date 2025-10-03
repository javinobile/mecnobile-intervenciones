// app/components/users/UserProfileForm.tsx
'use client';

import { useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { updateUserProfile } from '@/actions/user.actions'; 
// Importa el componente de alerta o Toast que uses (shadcn/ui, etc.)
// import { useToast } from "@/components/ui/use-toast" 

interface UserProfileFormProps {
    initialName: string;
    initialEmail: string;
}

export default function UserProfileForm({ initialName, initialEmail }: UserProfileFormProps) {
    const [name, setName] = useState(initialName);
    const [email, setEmail] = useState(initialEmail);
    // Estados para las contraseñas
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');

    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        // Validación de coincidencia de contraseña
        if (newPassword && newPassword !== confirmNewPassword) {
            setMessage({ type: 'error', text: 'La nueva contraseña y la confirmación no coinciden.' });
            return;
        }

        setIsSubmitting(true);

        const result = await updateUserProfile({
            name: name,
            email: email,
            // Solo incluimos las contraseñas si hay una nueva contraseña
            currentPassword: newPassword ? currentPassword : undefined,
            newPassword: newPassword ? newPassword : undefined,
        });

        if (result.success) {
            setMessage({ type: 'success', text: result.message });
            // Limpiar campos de contraseña después del éxito
            setCurrentPassword('');
            setNewPassword('');
            setConfirmNewPassword('');
        } else {
            setMessage({ type: 'error', text: result.message });
        }
        setIsSubmitting(false);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Mensaje de estado */}
            {message && (
                <div className={`p-3 rounded-md text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {message.text}
                </div>
            )}
            
            {/* Campos Nombre y Email (Mantienen la lógica de solo enviar cambios) */}
            <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nombre Completo</label>
                <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
            </div>

            <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Correo Electrónico</label>
                <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
            </div>

            <hr className="my-4" />

            <h3 className="text-xl font-semibold text-gray-700">Cambiar Contraseña</h3>
            <p className="text-sm text-gray-500">Solo llena estos campos si deseas cambiar tu contraseña.</p>

            {/* Campo Contraseña Actual */}
            <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">Contraseña Actual</label>
                <input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    // Es requerido SOLAMENTE si se llena newPassword
                    required={!!newPassword} 
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
            </div>

            {/* Campo Nueva Contraseña */}
            <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">Nueva Contraseña (mínimo 6 caracteres)</label>
                <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
            </div>

            {/* Campo Confirmar Nueva Contraseña */}
            <div>
                <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700">Confirmar Nueva Contraseña</label>
                <input
                    id="confirmNewPassword"
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    required={!!newPassword} // Es requerido si se llena newPassword
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
            </div>
            
            {/* Botón de Guardar */}
            <div className="pt-4">
                <button
                    type="submit"
                    className="flex items-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-50 transition duration-150"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                    Guardar Cambios
                </button>
            </div>
        </form>
    );
}