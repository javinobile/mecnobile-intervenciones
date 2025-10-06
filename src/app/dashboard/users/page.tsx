// app/dashboard/users/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getUsersPage, UserListItem } from "@/actions/user.actions";
import { Users, AlertTriangle } from 'lucide-react';
import UserTable from "@/components/users/UsersTable";

interface UsersPageProps {
    searchParams: {
        page?: string;
        query?: string;
    };
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
    
    const session = await getServerSession(authOptions);
    
    // 1. Verificación de Rol (Server Side)
    if (!session || session.user.role !== 'ADMIN') {
        return (
            <>
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4" role="alert">
                    <p className="font-bold flex items-center"><AlertTriangle className="w-5 h-5 mr-2"/> Acceso Restringido</p>
                    <p>Esta sección es solo para administradores.</p>
                </div>
            </>
        );
    }

    // 2. Obtención de Datos
    const currentPage = parseInt(searchParams.page || '1');
    const query = searchParams.query || '';
    
    const { users, totalPages, currentPage: actualPage } = await getUsersPage(currentPage, query);

    return (
        <>
            <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h1 className="text-4xl font-extrabold text-gray-900 flex items-center">
                    <Users className="w-8 h-8 mr-3 text-red-600" />
                    Gestión de Usuarios
                </h1>
                {/* Aquí podría ir un botón para crear un nuevo usuario si lo tienes */}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <UserTable 
                    users={users} 
                    totalPages={totalPages} 
                    currentPage={actualPage} 
                    query={query}
                    currentUserId={session.user.id} // Necesario para evitar que el Admin se modifique a sí mismo
                />
            </div>
        </>
    );
}