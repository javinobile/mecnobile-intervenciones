import { getInterventionDetail } from '@/actions/intervention.actions';
import { getWorkshopSettings } from '@/actions/settings.actions';
import InterventionEditForm from '@/components/interventions/InterventionsForm';
import InterventionItemsEditor from '@/components/interventions/InterventionItemsEditor';
import { OtCarEditPanel, OtOwnerEditPanel } from '@/components/interventions/OtContextEditPanels';
import PdfGeneratorButton from '@/components/interventions/PdfGeneratorButton';
import { Wrench, Car, User, DollarSign, Hash } from 'lucide-react';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

interface InterventionDetailPageProps {
    params: Promise<{ id: string }>;
}

const statusClasses: Record<string, string> = {
    CERRADA: 'bg-green-100 text-green-800',
    ABIERTA: 'bg-yellow-100 text-yellow-800',
    CANCELADA: 'bg-red-100 text-red-800',
    PENDIENTE_CANCELACION: 'bg-orange-100 text-orange-900',
};

const statusLabels: Record<string, string> = {
    CERRADA: 'Cerrada',
    ABIERTA: 'Abierta',
    CANCELADA: 'Cancelada',
    PENDIENTE_CANCELACION: 'Pend. cancelación',
};

export default async function InterventionDetailPage({ params }: InterventionDetailPageProps) {
    const resolved = await params;
    const session = await getServerSession(authOptions);
    const intervention = await getInterventionDetail(resolved.id);
    const settings = await getWorkshopSettings();

    if (!intervention) {
        return (
            <div className="text-center py-20">
                <h1 className="text-2xl text-red-600">OT no encontrada</h1>
                <Link href="/dashboard/interventions" className="mt-4 inline-block text-blue-600 hover:underline">
                    Volver al listado de OTs
                </Link>
            </div>
        );
    }

    const formatDate = (date: Date) => new Date(date).toLocaleDateString('es-AR');
    const isAdmin = session?.user?.role === 'ADMIN';

    return (
        <>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6 border-b pb-4">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 flex items-center">
                    <Wrench className="w-7 h-7 mr-2 text-blue-600 shrink-0" />
                    OT #{intervention.otNumber}
                </h1>
                <span className={`self-start px-3 py-1.5 text-sm font-semibold rounded-full ${statusClasses[intervention.displayStatus]}`}>
                    {statusLabels[intervention.displayStatus] || intervention.displayStatus}
                </span>
            </div>

            {intervention.displayStatus === 'PENDIENTE_CANCELACION' && isAdmin && (
                <div className="mb-4 p-3 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-900">
                    El mecánico solicitó cancelar esta OT. Autorizá o rechazá la solicitud en la sección de detalles.
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <section className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200">
                        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                            <Hash className="w-5 h-5 mr-2 text-blue-500" />
                            Detalles
                        </h2>
                        <div className="space-y-3 text-sm sm:text-base mb-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <h3 className="font-semibold text-gray-700">Registrada por</h3>
                                    <p className="text-gray-600">
                                        {intervention.performedBy.name} ({intervention.performedBy.role})
                                    </p>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-700">Apertura</h3>
                                    <p className="text-gray-600">{formatDate(intervention.createdAt)}</p>
                                </div>
                            </div>
                        </div>

                        <InterventionEditForm
                            interventionId={intervention.id}
                            initialNotes={intervention.notes}
                            initialDescription={intervention.description}
                            initialMileageKm={intervention.mileageKm}
                            canEditContent={intervention.canEditContent}
                            canClose={intervention.canClose}
                            canRequestCancel={intervention.canRequestCancel}
                            canResolveCancel={intervention.canResolveCancel}
                            displayStatus={intervention.displayStatus}
                            isAdmin={!!isAdmin}
                        />
                    </section>

                    <section className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center gap-2 mb-2">
                            <DollarSign className="w-5 h-5 text-green-500" />
                            <span className="text-sm text-gray-500">Total calculado automáticamente</span>
                        </div>
                        <InterventionItemsEditor
                            interventionId={intervention.id}
                            items={intervention.items}
                            totalCost={intervention.costNumber}
                            hourlyRate={settings.hourlyRate}
                            canEdit={intervention.canEditContent}
                        />
                    </section>
                </div>

                <div className="space-y-6">
                    <section className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200">
                        <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                            <Car className="w-5 h-5 mr-2 text-red-500" />
                            Vehículo
                        </h2>
                        <div className="space-y-1 text-gray-700">
                            <p className="text-xl font-extrabold text-red-600">{intervention.car.licensePlate}</p>
                            <p>{intervention.car.make} {intervention.car.model} ({intervention.car.year})</p>
                            <p className="text-sm">VIN: {intervention.car.vin}</p>
                            <p className="text-sm">Color: {intervention.car.color || 'N/A'}</p>
                            <p className="text-sm">Km al ingreso: {intervention.mileageKm.toLocaleString('es-AR')}</p>
                        </div>
                        {isAdmin && (
                            <Link
                                href={`/dashboard/cars/${intervention.car.id}`}
                                className="mt-3 inline-block text-blue-600 hover:underline text-sm"
                            >
                                Ver en maestros
                            </Link>
                        )}
                        <OtCarEditPanel
                            interventionId={intervention.id}
                            car={intervention.car}
                            canEdit={intervention.canEditMasters}
                        />
                    </section>

                    {intervention.isClosed && (
                        <div>
                            <PdfGeneratorButton interventionId={intervention.id} />
                        </div>
                    )}
                    {intervention.isOpen && (
                        <p className="text-xs text-gray-500 px-1">
                            El comprobante PDF estará disponible cuando la OT se cierre.
                        </p>
                    )}

                    <section className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200">
                        <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                            <User className="w-5 h-5 mr-2 text-orange-500" />
                            Propietario (de esta OT)
                        </h2>
                        <div className="space-y-1 text-gray-700">
                            <p className="text-lg font-semibold">{intervention.owner.name}</p>
                            <p className="text-sm">DNI: {intervention.owner.dni}</p>
                            <p className="text-sm">Tel: {intervention.owner.phone || 'N/A'}</p>
                            <p className="text-sm">Email: {intervention.owner.email || 'N/A'}</p>
                        </div>
                        {isAdmin && (
                            <Link
                                href={`/dashboard/clients/${intervention.owner.id}`}
                                className="mt-3 inline-block text-blue-600 hover:underline text-sm"
                            >
                                Ver en maestros
                            </Link>
                        )}
                        <OtOwnerEditPanel
                            interventionId={intervention.id}
                            owner={intervention.owner}
                            canEdit={intervention.canEditMasters}
                        />
                    </section>

                    {intervention.isClosed && (
                        <p className="text-xs text-gray-500 px-1">
                            OT cerrada: queda como comprobante y no se puede modificar.
                        </p>
                    )}
                    {intervention.isCancelled && (
                        <p className="text-xs text-red-600 px-1">
                            OT cancelada: no se puede reabrir ni modificar.
                        </p>
                    )}
                </div>
            </div>
        </>
    );
}
