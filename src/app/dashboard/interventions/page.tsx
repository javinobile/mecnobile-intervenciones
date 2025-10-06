// app/(dashboard)/interventions/page.tsx
import Link from 'next/link';
import { Wrench, PlusCircle, Search, Clock, CheckCircle, XCircle } from 'lucide-react';
import { getInterventions, InterventionListItem } from '@/actions/intervention.actions';

// Hacemos la página ASÍNCRONA (Server Component)
export default async function InterventionsPage() {

    // 1. Obtener la lista de OTs en el servidor
    const interventions = await getInterventions();

    // Función auxiliar para colores del estado (Opcional, mejora la UI)
    const getStatusBadge = (status: InterventionListItem['status']) => {
        switch (status) {
            case 'ABIERTA':
                return <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800"><Clock className="w-4 h-4 mr-1" /> Pendiente Pago</span>;
            case 'CERRADA':
                return <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-green-100 text-green-800"><CheckCircle className="w-4 h-4 mr-1" /> Completada</span>;
            case 'CANCELADA':
                return <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-red-100 text-red-800"><XCircle className="w-4 h-4 mr-1" /> Cancelada</span>;
            default:
                // Si tuvieras un estado PENDING, lo pondrías aquí
                return <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium bg-gray-100 text-gray-800">Desconocido</span>;
        }
    };

    // Función auxiliar para formatear fechas
    const formatDate = (date: Date) => {
        return new Date(date).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    return (
        <>
            <h1 className="text-4xl font-extrabold text-gray-900 mb-2 flex items-center">
                <Wrench className="w-8 h-8 mr-3 text-blue-600" />
                Órdenes de Trabajo Activas
            </h1>
            <p className="text-gray-500 mb-8">
                Vista general de todas las órdenes de trabajo.
            </p>

            {/* Barra de Herramientas: Búsqueda y Botón Añadir */}
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center space-x-3 w-full max-w-lg">
                    {/* Componente de Cliente para búsqueda, si es necesario, o un simple input para el futuro */}
                    <input
                        type="text"
                        placeholder="Buscar OT #, Matrícula o Cliente..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 transition duration-150"
                    />
                    <button className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-150">
                        <Search className="w-5 h-5" />
                    </button>
                </div>
                <Link href="/dashboard/interventions/new" legacyBehavior>
                    <a className="flex items-center px-4 py-2 bg-green-600 text-white font-medium rounded-lg shadow-md hover:bg-green-700 transition duration-150">
                        <PlusCircle className="w-5 h-5 mr-2" />
                        Abrir Nueva OT
                    </a>
                </Link>
            </div>

            {/* Tabla de Listado de Intervenciones */}
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OT #</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Apertura</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehículo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registrada Por</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {interventions.map((i) => (
                            <tr key={i.id} className="hover:bg-gray-50 transition duration-100">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600">
                                    {i.otNumber}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    {getStatusBadge(i.status)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {formatDate(i.dateOfIntervention)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    <span className="font-semibold">{i.carPlate}</span> - {i.carMakeModel}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {i.ownerName}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {i.performedByName}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <Link href={`/dashboard/interventions/${i.id}`} legacyBehavior>
                                        <a className="text-blue-600 hover:text-blue-900 transition duration-150 mr-4">Ver Detalle</a>
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {interventions.length === 0 && (
                    <div className="text-center py-10 text-gray-500">
                        No se encontraron órdenes de trabajo activas.
                    </div>
                )}
            </div>
        </>
    );
}