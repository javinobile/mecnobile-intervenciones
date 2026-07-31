// app/dashboard/page.tsx
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { redirect } from 'next/navigation';
import { Car, Users, Settings } from 'lucide-react';
import prisma from '../../../lib/prisma';
import RecentInterventionsList, { RecentInterventionItem } from '@/components/dashboard/RecentInterventionsList';

// Tipo de dato para las tarjetas
interface DashboardCardProps {
    title: string;
    value: string | number;
    color: string;
    icon: React.ElementType; // Usamos React.ElementType para los componentes de Lucide
}

// ===============================================
// SERVER ACTION para obtener TODOS los datos del Dashboard
// ===============================================
async function getDashboardData() {
    // 1. Obtener la sesión (Verificación de Auth en el servidor)
    const session = await getServerSession(authOptions);

    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC')) {
        return { authorized: false, session: null, data: null };
    }

    try {
        const isAdmin = session.user.role === 'ADMIN';
        const ownershipFilter = isAdmin ? {} : { performedById: session.user.id };

        // 2. Obtener las métricas clave
        const [totalCars, totalClients, openInterventions, lastInterventions] = await prisma.$transaction([
            // Cantidad de Automóviles registrados
            prisma.car.count(),
            // Cantidad de Clientes registrados
            prisma.client.count(),
            // Cantidad de OTs que siguen en curso (mecánico: solo las suyas)
            prisma.intervention.count({
                where: { status: 'ABIERTA', ...ownershipFilter },
            }),
            // Las 5 OTs abiertas más recientes: panorama actual del taller
            prisma.intervention.findMany({
                where: { status: 'ABIERTA', ...ownershipFilter },
                take: 5,
                orderBy: { dateOfIntervention: 'desc' },
                select: {
                    id: true,
                    otNumber: true,
                    description: true,
                    dateOfIntervention: true,
                    cost: true,
                    car: { select: { licensePlate: true } },
                    performedBy: { select: { name: true } },
                }
            })
        ]);

        return {
            authorized: true,
            session,
            data: {
                totalCars,
                totalClients,
                openInterventions,
                // El campo `cost` es un Decimal de Prisma y no es serializable hacia Client Components
                lastInterventions: lastInterventions.map((ot) => ({
                    ...ot,
                    cost: ot.cost.toNumber(),
                })),
            }
        };
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        return {
            authorized: true,
            session,
            data: { totalCars: 0, totalClients: 0, openInterventions: 0, lastInterventions: [] }
        };
    }
}


// ===============================================
// COMPONENTE PRINCIPAL (Server Component)
// ===============================================
export default async function DashboardPage() {

    // Obtener todos los datos necesarios en el servidor
    const { authorized, session, data } = await getDashboardData();

    // Redirección si no está autenticado (aunque el middleware lo hará primero)
    if (!session) {
        redirect('/login');
    }

    // Autorización basada en Rol (la lógica de getDashboardData ya lo maneja)
    if (!authorized) {
        return (
            <main className="flex-grow">
                <div className="text-red-600 p-4 bg-red-50 border border-red-200 rounded-md text-sm">
                    Acceso denegado. Tu rol ({session.user.role}) no tiene permisos para este panel.
                </div>
            </main>
        );
    }

    // Si la data falla por error de DB, usamos 0 y arrays vacíos
    const { totalCars, totalClients, openInterventions, lastInterventions } = data || {
        totalCars: 0,
        totalClients: 0,
        openInterventions: 0,
        lastInterventions: [] as RecentInterventionItem[]
    };

    return (
        <>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
                Panel Principal
            </h1>

            <p className="text-sm text-gray-600 mb-5">
                Bienvenido, <span className="font-semibold">{session?.user.name}</span> ({session?.user.role}). Resumen de actividad del taller.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

                <Card
                    title="Automóviles Registrados"
                    value={totalCars}
                    color="bg-blue-600"
                    icon={Car}
                />
                <Card
                    title="Clientes Registrados"
                    value={totalClients}
                    color="bg-green-600"
                    icon={Users}
                />
                <Card
                    title="Órdenes de Trabajo en Curso"
                    value={openInterventions}
                    color="bg-yellow-600"
                    icon={Settings}
                />
            </div>

            <div className="mt-6 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <RecentInterventionsList interventions={lastInterventions} />
            </div>

        </>
    );
}

const Card = ({ title, value, color, icon: Icon }: DashboardCardProps) => (
    <div className={`p-4 rounded-lg text-white shadow-sm ${color}`}>
        <div className="flex items-center justify-between">
            <span className="text-2xl font-bold">{value}</span>
            <Icon className="w-6 h-6 opacity-75" />
        </div>
        <p className="mt-1.5 text-xs opacity-90">{title}</p>
    </div>
);