// app/dashboard/profile/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import UserProfileForm from "@/components/users/UserProfileForm"; // Importaremos el componente de cliente
import { User as UserIcon } from 'lucide-react';
import prisma from "../../../../lib/prisma";

export default async function UserProfilePage() {
    
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user.id) {
        return <main className="p-8 ml-64 bg-gray-50"><h1 className="text-3xl text-red-600">Acceso Denegado</h1></main>;
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
        return <main className="p-8 ml-64 bg-gray-50"><h1 className="text-3xl text-red-600">Usuario no encontrado</h1></main>;
    }
    
    return (
        <main className="flex-grow p-8 ml-64 bg-gray-50">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h1 className="text-4xl font-extrabold text-gray-900 flex items-center">
                    <UserIcon className="w-8 h-8 mr-3 text-blue-600" />
                    Mi Perfil de Usuario
                </h1>
            </div>

            <div className="max-w-xl bg-white p-8 rounded-xl shadow-lg border border-gray-200">
                <h2 className="text-2xl font-semibold mb-4 text-gray-700">Información Personal</h2>
                
                {/* Visualización del Rol (Solo Lectura) */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-600">Rol en el Taller</label>
                    <span className={`px-3 py-1 mt-1 inline-flex text-sm leading-5 font-semibold rounded-full 
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

                {/* Formulario de Cliente para la Edición */}
                <UserProfileForm 
                    initialName={user.name || ''} 
                    initialEmail={user.email} 
                />
            </div>
        </main>
    );
}