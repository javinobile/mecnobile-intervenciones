import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { redirect } from 'next/navigation';
import { Cog } from 'lucide-react';
import { getWorkshopSettings } from '@/actions/settings.actions';
import SettingsForm from '@/components/settings/SettingsForm';

export default async function SettingsPage() {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        redirect('/dashboard');
    }

    const settings = await getWorkshopSettings();

    return (
        <>
            <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center">
                <Cog className="w-6 h-6 mr-2 text-blue-600" />
                Configuración del taller
            </h1>
            <p className="text-sm text-gray-500 mb-6">
                Parámetros generales usados en las órdenes de trabajo y en la agenda de turnos.
            </p>
            <SettingsForm initialSettings={settings} />
        </>
    );
}
