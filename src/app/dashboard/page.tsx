// app/dashboard/page.tsx
'use client';

import Sidebar from '@/components/layout/Sidebar';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';

export default function DashboardPage() {
    const { data: session, status } = useSession();

    // 1. Manejo del estado de carga
    if (status === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center">
                Cargando Dashboard...
            </div>
        );
    }

    // 2. Redirección si no está autenticado (aunque el middleware lo hará primero)
    if (status === 'unauthenticated') {
        redirect('/login');
        return null; // Evitar renderizado
    }

    // 3. Autorización basada en Rol (ADMIN es la clave para arrancar)
    const userRole = session?.user.role;

    // Podríamos poner una autorización más estricta aquí si solo ADMINs pueden ver la raíz:
    if (userRole !== 'ADMIN' && userRole !== 'MECHANIC') {
        return (
            <div className="min-h-screen p-8 ml-64 bg-gray-100">
                <div className="text-red-600 p-6 bg-red-100 border border-red-300 rounded-lg">
                    Acceso denegado. Tu rol ({userRole}) no tiene permisos para este panel.
                </div>
            </div>
        );
    }


    return (
        <div className="flex-grow p-8 ml-64 bg-gray-100">
            {/* ml-64 compensa el ancho de la sidebar */}
            <h1 className="text-4xl font-extrabold text-gray-900 mb-6">
                Panel Principal
            </h1>

            <p className="text-gray-600 mb-8">
                Bienvenido, **{session?.user.name}** ({userRole}). Este es el resumen de actividad de tu taller.
            </p>

            {/* Métrica Moderna (Ejemplo) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card
                    title="Intervenciones Pendientes"
                    value="12"
                    color="bg-red-500"
                    icon="🚨"
                />
                <Card
                    title="Automóviles en Taller"
                    value="35"
                    color="bg-yellow-500"
                    icon="🚗"
                />
                <Card
                    title="Ganancia del Mes"
                    value="$15.500"
                    color="bg-green-500"
                    icon="💰"
                />
            </div>

            {/* Sección de Actividad Reciente */}
            <div className="mt-10 bg-white p-6 rounded-lg shadow-lg">
                <h2 className="text-2xl font-semibold mb-4 border-b pb-2">Últimas 5 Intervenciones</h2>
                <p className="text-gray-500">Aquí se listarán los trabajos más recientes cargados al sistema.</p>
            </div>

        </div>
    );
}

// Componente simple de tarjeta para métricas
const Card = ({ title, value, color, icon }: { title: string, value: string, color: string, icon: string }) => (
    <div className={`p-5 rounded-xl text-white shadow-xl transform hover:scale-[1.02] transition duration-300 ${color}`}>
        <div className="flex items-center justify-between">
            <span className="text-3xl font-bold">{value}</span>
            <span className="text-4xl">{icon}</span>
        </div>
        <p className="mt-2 text-sm opacity-90">{title}</p>
    </div>
);