// app/(dashboard)/interventions/[id]/page.tsx
import { getInterventionDetail } from '@/actions/intervention.actions';
import InterventionEditForm from '@/components/interventions/InterventionsForm';
import PdfGeneratorButton from '@/components/interventions/PdfGeneratorButton';
import { Wrench, Car, User, DollarSign, Clock, Hash } from 'lucide-react';
import Link from 'next/link';

// Componente de Cliente para la edición (lo crearemos a continuación)
// import InterventionEditForm from '@/app/components/interventions/InterventionEditForm'; 

interface InterventionDetailPageProps {
    params: {
        id: string;
    };
}

// Hacemos la página ASÍNCRONA y obtenemos el ID de los params
export default async function InterventionDetailPage({ params }: InterventionDetailPageProps) {

    const intervention = await getInterventionDetail(params.id);

    if (!intervention) {
        return (
            <div className="text-center py-20">
                <h1 className="text-3xl text-red-600">OT no encontrada</h1>
                <p className="text-gray-500 mt-2">
                    La Orden de Trabajo con ID "{params.id}" no existe.
                </p>
                <Link href="/dashboard/interventions" className="mt-4 inline-block text-blue-600 hover:underline">
                    Volver al listado de OTs
                </Link>
            </div>
        );
    }

    // Funciones auxiliares (podrían ir en un archivo de utilidades)
    const formatDate = (date: Date) => new Date(date).toLocaleDateString('es-ES');
    const formatCost = (cost: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(cost);

    // Asignación de colores de estado (igual que en el listado)
    const statusClasses = {
        CERRADA: 'bg-green-100 text-green-800',
        ABIERTA: 'bg-yellow-100 text-yellow-800',
        CANCELADA: 'bg-red-100 text-red-800',
    };
    const statusBadge = (
        <span className={`px-3 py-1 text-sm font-semibold rounded-full ${statusClasses[intervention.status]}`}>
            {intervention.status.replace('_', ' ')}
        </span>
    );

    return (
        <>

            <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h1 className="text-4xl font-extrabold text-gray-900 flex items-center">
                    <Wrench className="w-8 h-8 mr-3 text-blue-600" />
                    OT #{intervention.otNumber}
                </h1>
                {statusBadge}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* COLUMNA 1: DETALLE DE LA OT */}
                <div className="lg:col-span-2 space-y-8">
                    <section className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                            <Hash className="w-5 h-5 mr-2 text-blue-500" />
                            Detalles de la Intervención
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-700">Descripción del Trabajo</h3>
                                <p className="text-gray-600 whitespace-pre-wrap">{intervention.description}</p>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-gray-700">Notas / Diagnóstico Inicial</h3>
                                <p className="text-gray-600 whitespace-pre-wrap">{intervention.notes || 'No hay notas iniciales.'}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-700">Registrada Por</h3>
                                    <p className="text-gray-600">{intervention.performedBy.name} ({intervention.performedBy.role})</p>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-700">Fecha de Apertura</h3>
                                    <p className="text-gray-600">{formatDate(intervention.createdAt)}</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Sección de Costo y Finalización - Se actualizaría con un formulario de cliente */}
                    <section className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                            <DollarSign className="w-5 h-5 mr-2 text-green-500" />
                            Facturación y Actualización
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-700">Costo Actual</h3>
                                {/* Mostrar el costo como solo lectura antes del formulario */}
                                <p className="text-3xl font-extrabold text-green-600">{formatCost(intervention.cost.toNumber())}</p>
                            </div>

                            {/* Componente de Cliente para la edición */}
                            <InterventionEditForm
                                interventionId={intervention.id}
                                initialNotes={intervention.notes}
                                initialCost={intervention.cost.toNumber()} // Pasamos el Decimal de Prisma como número
                                initialStatus={intervention.status}
                            />

                        </div>
                    </section>
                </div>

                {/* COLUMNA 2: INFORMACIÓN DEL VEHÍCULO Y CLIENTE */}
                <div className="lg:col-span-1 space-y-8">

                    {/* Tarjeta del Vehículo */}
                    <section className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                            <Car className="w-5 h-5 mr-2 text-red-500" />
                            Vehículo
                        </h2>
                        <div className="space-y-2 text-gray-700">
                            <p className="text-2xl font-extrabold text-red-600">{intervention.car.licensePlate}</p>
                            <p>{intervention.car.make} {intervention.car.model} ({intervention.car.year})</p>
                            <p>VIN: {intervention.car.vin}</p>
                            <p>Color: {intervention.car.color}</p>
                            <p>Km al ingreso: {intervention.mileageKm.toLocaleString('es-ES')} KM</p>
                        </div>
                        <Link href={`/dashboard/cars/${intervention.car.id}`} className="mt-4 inline-block text-blue-600 hover:underline text-sm">
                            Ver historial del vehículo
                        </Link>
                    </section>

                                       {/* BOTÓN DE GENERACIÓN DE PDF (AQUÍ LO INSERTAMOS) */}
                    <div className="pt-4 border-t border-gray-200">
                         <PdfGeneratorButton interventionId={intervention.id} />
                    </div>

                    {/* Tarjeta del Cliente */}
                    {intervention.owner && (
                        <section className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                                <User className="w-5 h-5 mr-2 text-orange-500" />
                                Cliente (Dueño Actual)
                            </h2>
                            <div className="space-y-2 text-gray-700">
                                <p className="text-lg font-semibold">{intervention.owner.name}</p>
                                <p>Teléfono: {intervention.owner.phone || 'N/A'}</p>
                                <p>Email: {intervention.owner.email || 'N/A'}</p>
                            </div>
                            <Link href={`/dashboard/clients/${intervention.owner.id}`} className="mt-4 inline-block text-blue-600 hover:underline text-sm">
                                Ver ficha completa del cliente
                            </Link>
                        </section>
                    )}
                </div>
            </div>
        </>
    );
}