// app/dashboard/page.tsx
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { redirect } from 'next/navigation';
import { Car, Users, Settings, DollarSign } from 'lucide-react'; // Íconos para las métricas
import prisma from '../../../lib/prisma';

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
        // 2. Obtener las métricas clave
        const [totalCars, totalClients, lastInterventions] = await prisma.$transaction([
            // Cantidad de Automóviles registrados
            prisma.car.count(),
            // Cantidad de Clientes registrados
            prisma.client.count(),
            // Últimas 5 Intervenciones
            prisma.intervention.findMany({
                take: 5,
                orderBy: { dateOfIntervention: 'desc' },
                select: {
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
                lastInterventions,
            }
        };
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        return { authorized: true, session, data: { totalCars: 0, totalClients: 0, lastInterventions: [] } };
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
            <main className="flex-grow p-8 ml-64 bg-gray-100">
                <div className="text-red-600 p-6 bg-red-100 border border-red-300 rounded-lg">
                    Acceso denegado. Tu rol ({session.user.role}) no tiene permisos para este panel.
                </div>
            </main>
        );
    }

    // Si la data falla por error de DB, usamos 0 y arrays vacíos
    const { totalCars, totalClients, lastInterventions } = data || { totalCars: 0, totalClients: 0, lastInterventions: [] };

    return (
        <>
            <h1 className="text-4xl font-extrabold text-gray-900 mb-6">
                Panel Principal
            </h1>

            <p className="text-gray-600 mb-8">
                Bienvenido, **{session?.user.name}** ({session?.user.role}). Este es el resumen de actividad de tu taller.
            </p>

            {/* Métrica Dinámica */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

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
                    title="Órdenes de Trabajo (Últimos 30 días)"
                    // NOTA: Para obtener este valor, necesitarías una consulta extra a la DB. 
                    // Por ahora, usamos un valor fijo para mantener el diseño.
                    value={"N/A"}
                    color="bg-yellow-600"
                    icon={Settings}
                />
            </div>

            {/* Sección de Actividad Reciente */}
            <div className="mt-10 bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <h2 className="text-2xl font-semibold mb-4 border-b pb-2 text-gray-800">Últimas 5 Intervenciones</h2>

                <InterventionList interventions={lastInterventions as any[]} />

            </div>

        </>
    );
}

// Componente de Tarjeta
const Card = ({ title, value, color, icon: Icon }: DashboardCardProps) => (
    <div className={`p-5 rounded-xl text-white shadow-xl transform hover:scale-[1.02] transition duration-300 ${color}`}>
        <div className="flex items-center justify-between">
            <span className="text-3xl font-bold">{value}</span>
            <Icon className="w-8 h-8 opacity-75" />
        </div>
        <p className="mt-2 text-sm opacity-90">{title}</p>
    </div>
);


// ===============================================
// COMPONENTE DE LISTADO DE INTERVENCIONES
// ===============================================
interface InterventionListProps {
    interventions: {
        otNumber: number;
        description: string;
        dateOfIntervention: Date;
        cost: any; // Decimal de Prisma
        car: { licensePlate: string };
        performedBy: { name: string | null };
    }[];
}

const InterventionList = ({ interventions }: InterventionListProps) => {

    if (interventions.length === 0) {
        return (
            <p className="text-gray-500 py-4 text-center">
                Aún no hay Órdenes de Trabajo registradas.
            </p>
        );
    }

    return (
        <div className="space-y-4">
            {interventions.map((ot, index) => (
                <div key={index} className="flex justify-between items-center p-4 border rounded-lg hover:bg-gray-50 transition duration-150">
                    <div className="flex items-center space-x-4">
                        <span className="text-lg font-bold text-blue-600 min-w-[50px]">OT-{ot.otNumber}</span>
                        <div>
                            <p className="font-semibold text-gray-800">{ot.description}</p>
                            <p className="text-sm text-gray-500">
                                Vehículo: <span className="font-medium">{ot.car.licensePlate}</span> | Mecánico: {ot.performedBy.name || 'N/A'}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-lg font-bold text-green-700">
                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(ot.cost))}
                        </p>
                        <p className="text-xs text-gray-500">
                            {ot.dateOfIntervention.toLocaleDateString()}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
};