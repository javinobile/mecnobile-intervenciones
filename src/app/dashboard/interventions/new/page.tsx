import NewInterventionForm from '@/components/interventions/NewInterventionForm';
import { getAppointmentForOt } from '@/actions/appointment.actions';
import { getQuoteForOt } from '@/actions/quote.actions';
import { formatDateTimeEsAr } from '@/lib/whatsapp/phone';
import { Calculator, CalendarCheck, Wrench } from 'lucide-react';

interface NewInterventionPageProps {
    searchParams: Promise<{
        appointmentId?: string;
        plate?: string;
        desc?: string;
        /** Id de un presupuesto ACEPTADO a convertir en OT */
        presupuesto?: string;
    }>;
}

export default async function NewInterventionPage({ searchParams }: NewInterventionPageProps) {
    const params = await searchParams;
    const appointment = params.appointmentId
        ? await getAppointmentForOt(params.appointmentId)
        : null;

    const quote = params.presupuesto ? await getQuoteForOt(params.presupuesto) : null;

    const initialPlate = quote?.vehiclePlate ?? appointment?.licensePlate ?? params.plate ?? '';
    const initialDescription = quote
        ? quote.description || `Según presupuesto Nº ${quote.quoteNumber}`
        : appointment?.notes ?? params.desc ?? '';

    // Datos libres del presupuesto → precarga del alta de propietario (nombre / apellido por la primera palabra).
    const [firstName, ...rest] = (quote?.customerName ?? '').trim().split(/\s+/);
    const initialNewClient = quote
        ? {
              firstName: firstName ?? '',
              lastName: rest.join(' '),
              phone: quote.customerPhone ?? '',
              email: quote.customerEmail ?? '',
          }
        : undefined;

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

            {params.presupuesto && !quote && (
                <div className="mb-4 p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900">
                    El presupuesto indicado no está disponible para convertir (tiene que estar aceptado y no
                    haber sido convertido antes). Puede continuar cargando la OT de forma normal.
                </div>
            )}

            {quote && (
                <div className="mb-4 p-3 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-900">
                    <p className="font-semibold flex items-center gap-1.5">
                        <Calculator className="w-4 h-4" />
                        OT desde el presupuesto Nº {quote.quoteNumber}
                    </p>
                    <p className="mt-1">
                        {quote.customerName}
                        {quote.vehiclePlate ? ` · ${quote.vehiclePlate}` : ''}
                        {quote.vehicleDescription ? ` · ${quote.vehicleDescription}` : ''}
                        {' · '}
                        {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(quote.total)}
                    </p>
                    <p className="mt-1 text-xs">
                        {quote.car
                            ? 'Verifique el vehículo y el propietario antes de abrir la OT.'
                            : 'El presupuesto no tiene un vehículo del padrón: búsquelo o dé de alta auto y propietario (los datos del cliente ya están precargados).'}{' '}
                        {quote.items.length === 0
                            ? 'El presupuesto no tiene ítems para copiar; queda vinculado a la OT.'
                            : quote.items.length === 1
                              ? 'Al abrirla se copia el ítem del presupuesto y queda vinculado a la OT.'
                              : `Al abrirla se copian los ${quote.items.length} ítems del presupuesto y queda vinculado a la OT.`}
                    </p>
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
                quoteId={quote?.id}
                initialCar={quote?.car}
                initialClient={quote?.client}
                initialNewClient={initialNewClient}
                initialNotes={quote?.notes ?? ''}
                quoteItems={quote?.items}
            />
        </>
    );
}
