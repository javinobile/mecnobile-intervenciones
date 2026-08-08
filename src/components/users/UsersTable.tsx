// app/components/users/UserTable.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { UserListItem, updateUserRole, deleteUser } from '@/actions/user.actions';
import { Trash2, ChevronLeft, ChevronRight, Search, Loader2, Pencil, Shield } from 'lucide-react';
import CreateUserModal from './CreateUserModal';
import EditStaffUserModal from './EditStaffUserModal';

const STAFF_ROLES = ['MECHANIC', 'VIEWER'] as const;
type StaffRole = 'MECHANIC' | 'VIEWER';

interface UserTableProps {
    users: UserListItem[];
    totalPages: number;
    currentPage: number;
    query: string;
    currentUserId: string;
}

export default function UserTable({ users, totalPages, currentPage, query, currentUserId }: UserTableProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [searchQuery, setSearchQuery] = useState(query);
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [isActionPending, setIsActionPending] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserListItem | null>(null);

    const handleNavigation = (page: number, q: string = searchQuery) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', page.toString());
        if (q) {
            params.set('query', q);
        } else {
            params.delete('query');
        }
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleRoleChange = async (userId: string, newRole: StaffRole) => {
        setIsActionPending(true);
        setActionMessage(null);

        const result = await updateUserRole(userId, newRole);

        if (result.success) {
            setActionMessage({ type: 'success', text: result.message });
            handleNavigation(currentPage);
        } else {
            setActionMessage({ type: 'error', text: result.message });
        }
        setIsActionPending(false);
    };

    const handleDelete = async (userId: string, userName: string | null) => {
        if (!confirm(`¿Estás seguro de que quieres eliminar al usuario ${userName}? Esta acción es irreversible y requiere que el usuario no tenga OTs asociadas.`)) {
            return;
        }

        setIsActionPending(true);
        setActionMessage(null);

        const result = await deleteUser(userId);

        if (result.success) {
            setActionMessage({ type: 'success', text: result.message });
            handleNavigation(currentPage);
        } else {
            setActionMessage({ type: 'error', text: result.message });
        }
        setIsActionPending(false);
    };

    const handleCreationResult = (success: boolean, message: string) => {
        setIsCreateModalOpen(false);
        setActionMessage({ type: success ? 'success' : 'error', text: message });
        if (success) {
            handleNavigation(1);
        }
    };

    const handleEditResult = (success: boolean, message: string) => {
        setEditingUser(null);
        setActionMessage({ type: success ? 'success' : 'error', text: message });
        if (success) {
            handleNavigation(currentPage);
        }
    };

    return (
        <div className="space-y-4">

            {actionMessage && (
                <div className={`p-2.5 rounded-md text-sm ${actionMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {actionMessage.text}
                </div>
            )}

            <p className="text-sm text-gray-600">
                Podés crear y editar mecánicos/viewers (incluida la contraseña inicial).
                Los administradores solo gestionan su propia cuenta desde{' '}
                <a href="/dashboard/profile" className="text-blue-600 font-medium hover:underline">Mi Perfil</a>.
            </p>

            <div className="flex justify-between items-start gap-3 flex-wrap">

                <div className="flex space-x-2 items-center flex-wrap gap-y-2">
                    <form onSubmit={(e) => { e.preventDefault(); handleNavigation(1); }} className="flex space-x-2">
                        <input
                            type="text"
                            placeholder="Buscar por nombre o email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md w-72"
                        />
                        <button type="submit" className="p-1.5 bg-gray-100 rounded-md hover:bg-gray-200">
                            <Search className="w-4 h-4 text-gray-700" />
                        </button>
                    </form>

                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="flex items-center px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-green-700 transition duration-150"
                    >
                        + Nuevo Usuario
                    </button>
                </div>

                <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">Página {currentPage} de {totalPages}</span>
                    <button
                        onClick={() => handleNavigation(currentPage - 1)}
                        disabled={currentPage <= 1 || isActionPending}
                        className="p-1.5 bg-gray-100 rounded-md disabled:opacity-50 hover:bg-gray-200"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => handleNavigation(currentPage + 1)}
                        disabled={currentPage >= totalPages || isActionPending}
                        className="p-1.5 bg-gray-100 rounded-md disabled:opacity-50 hover:bg-gray-200"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Creado</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {users.map((user) => {
                            const isSelf = user.id === currentUserId;
                            const isPeerAdmin = user.role === 'ADMIN' && !isSelf;
                            const isStaff = user.role === 'MECHANIC' || user.role === 'VIEWER';

                            return (
                                <tr key={user.id} className={isSelf ? 'bg-yellow-50' : isPeerAdmin ? 'bg-gray-50' : ''}>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-sm font-medium text-gray-900">{user.name || 'N/A'}</td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-sm">
                                        {isStaff ? (
                                            <select
                                                value={user.role}
                                                onChange={(e) => handleRoleChange(user.id, e.target.value as StaffRole)}
                                                disabled={isActionPending}
                                                className={`p-1 rounded text-xs font-semibold border cursor-pointer
                                                    ${user.role === 'MECHANIC' ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-gray-100 text-gray-800 border-gray-300'}
                                                `}
                                            >
                                                {STAFF_ROLES.map((role) => (
                                                    <option key={role} value={role}>{role}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
                                                <Shield className="w-3 h-3" />
                                                ADMIN
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-500">
                                        {user.createdAt.toLocaleDateString()}
                                    </td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-right text-sm font-medium">
                                        {isSelf ? (
                                            <a href="/dashboard/profile" className="text-xs text-yellow-700 font-medium hover:underline">
                                                Mi Perfil
                                            </a>
                                        ) : isPeerAdmin ? (
                                            <span className="text-xs text-gray-500">Perfil propio</span>
                                        ) : (
                                            <div className="inline-flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingUser(user)}
                                                    disabled={isActionPending}
                                                    title="Editar datos / contraseña"
                                                    className="text-blue-600 hover:text-blue-900 p-1.5 rounded-full hover:bg-blue-50 disabled:opacity-50"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(user.id, user.name)}
                                                    disabled={isActionPending}
                                                    title="Eliminar"
                                                    className="text-red-600 hover:text-red-900 p-1.5 rounded-full hover:bg-red-50 disabled:opacity-50"
                                                >
                                                    {isActionPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {users.length === 0 && (
                    <div className="text-center py-8 text-sm text-gray-500">
                        No se encontraron usuarios que coincidan con la búsqueda.
                    </div>
                )}
            </div>
            <CreateUserModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSuccess={handleCreationResult}
            />
            <EditStaffUserModal
                user={editingUser}
                isOpen={!!editingUser}
                onClose={() => setEditingUser(null)}
                onSuccess={handleEditResult}
            />
            <div className="flex justify-center pt-2">
                <span className="text-sm text-gray-600">Página {currentPage} de {totalPages}</span>
            </div>
        </div>
    );
}
