import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { Calculator } from 'lucide-react';
import { authOptions } from '@/auth';
import { getWorkshopSettings } from '@/actions/settings.actions';
import QuoteForm, { type QuoteFormValues } from '@/components/quotes/QuoteForm';

/** Fecha local (hora del taller) en formato YYYY-MM-DD para <input type="date">. */
function toDateInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default async function NewPresupuestoPage() {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role;
    if (!session || (role !== 'ADMIN' && role !== 'MECHANIC')) {
        redirect('/dashboard');
    }

    const { quoteValidityDays } = await getWorkshopSettings();
    const now = new Date();
    const defaultValidUntil = new Date(now.getFullYear(), now.getMonth(), now.getDate() + quoteValidityDays);

    const initialValues: QuoteFormValues = {
        clientId: null,
        clientLabel: null,
        carId: null,
        carLabel: null,
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        vehiclePlate: '',
        vehicleDescription: '',
        description: '',
        notes: '',
        validUntil: toDateInput(defaultValidUntil),
    };

    return (
        <>
            <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center">
                <Calculator className="w-6 h-6 mr-2 text-blue-600" />
                Nuevo presupuesto
            </h1>
            <p className="text-sm text-gray-500 mb-6">
                Cargá los datos del cliente y del vehículo. Los ítems (mano de obra, repuestos y trabajos de
                terceros) se agregan en el paso siguiente, desde el detalle del presupuesto.
            </p>
            <QuoteForm initialValues={initialValues} />
        </>
    );
}
