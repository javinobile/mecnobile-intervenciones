import NewInterventionForm from '@/components/interventions/NewInterventionForm';
import { getAppointmentForOt } from '@/actions/appointment.actions';
import { formatDateTimeEsAr } from '@/lib/whatsapp/phone';
import { CalendarCheck, Wrench } from 'lucide-react';

interface NewInterventionPageProps {
    searchParams: Promise<{
        appointmentId?: string;
        plate?: string;
        desc?: string;
    }>;
}

export default async function NewInterventionPage({ searchParams }: NewInterventionPageProps) {
    const params = await searchParams;
    const appointment = params.appointmentId
        ? await getAppointmentForOt(params.appointmentId)
        : null;

    const initialPlate = appointment?.licensePlate ?? params.plate ?? '';
    const initialDescription = appointment?.notes ?? params.desc ?? '';

    return (
        <>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-1 flex items-center">
                <Wrench className="w-7 h-7 mr-2 text-blue-600 shrink-0" />
                Abrir Nueva OT
            </h1>
            <p className="text-sm text-gray-500 mb-6">
                Busque por vehículo o propietario. Si no existe, podrá darlo de alta en el mismo flujo.
            </p>

            {params.appointmentId && !appointment && (
                <div className="mb-4 p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900">
                    El turno indicado no está disponible (puede no estar confirmado o ya tener una OT
                    abierta). Puede continuar cargando la OT de forma normal.
                </div>
            )}

            {appointment && (
                <div className="mb-4 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-900">
                    <p className="font-semibold flex items-center gap-1.5">
                        <CalendarCheck className="w-4 h-4" />
                        OT desde turno confirmado
                    </p>
                    <p className="mt-1">
                        {appointment.clientName}
                        {appointment.licensePlate ? ` · ${appointment.licensePlate}` : ''}
                        {' · '}
                        {formatDateTimeEsAr(appointment.startsAt).full}
                    </p>
                    <p className="mt-1 text-xs">
                        Verifique el vehículo y el propietario antes de abrir la OT. Al abrirla, el turno
                        queda vinculado a la orden.
                    </p>
                </div>
            )}

            <NewInterventionForm
                appointmentId={appointment?.id}
                initialPlate={initialPlate}
                initialDescription={initialDescription}
            />
        </>
    );
}
