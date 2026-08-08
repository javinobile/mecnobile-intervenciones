import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import { authOptions } from '@/auth';
import TurnosCalendar from '@/components/turnos/TurnosCalendar';

export default async function TurnosPage() {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role;

    if (!session || (role !== 'ADMIN' && role !== 'MECHANIC')) {
        redirect('/dashboard');
    }

    return (
        <>
            <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center">
                <CalendarDays className="w-6 h-6 mr-2 text-blue-600" />
                Turnos
            </h1>
            <p className="text-sm text-gray-500 mb-4">
                Agenda del taller: día y hora de llegada. Confirmá cada cita para avisar al cliente por WhatsApp,
                o proponé otros horarios si no podés recibir el auto.
            </p>
            <TurnosCalendar />
        </>
    );
}
