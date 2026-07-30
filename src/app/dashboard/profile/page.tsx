// app/dashboard/profile/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import UserProfileForm from "@/components/users/UserProfileForm"; // Importaremos el componente de cliente
import { User as UserIcon } from 'lucide-react';
import prisma from "../../../../lib/prisma";

export default async function UserProfilePage() {
    
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user.id) {
        return <div className="text-red-600 text-sm">Acceso Denegado</div>;
    }
    
    // Obtenemos los datos actuales del usuario directamente desde la DB (Server Component)
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            id: true,
            name: true,
            email: true,
            role: true, // Incluimos el rol solo para mostrarlo, no para editarlo
        }
    });

    console.log(user)

    if (!user) {
        return <div className="text-red-600 text-sm">Usuario no encontrado</div>;
    }
    
    return (
        <>
            <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-3">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                    <UserIcon className="w-6 h-6 mr-2 text-blue-600" />
                    Mi Perfil
                </h1>
            </div>

            <div className="max-w-xl bg-white p-5 rounded-lg shadow-sm border border-gray-200">
                <h2 className="text-base font-semibold mb-3 text-gray-700">Información Personal</h2>
                
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-600">Rol en el Taller</label>
                    <span className={`px-2.5 py-0.5 mt-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${user.role === 'ADMIN' ? 'bg-red-100 text-red-800' : 
                          user.role === 'MECHANIC' ? 'bg-blue-100 text-blue-800' : 
                          'bg-gray-100 text-gray-800'}`}
                    >
                        {user.role}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">
                        Solo los administradores pueden modificar tu rol.
                    </p>
                </div>

                <UserProfileForm 
                    initialName={user.name || ''} 
                    initialEmail={user.email} 
                />
            </div>
        </>
    );
}