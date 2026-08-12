import { redirect } from 'next/navigation';
import { FileText } from 'lucide-react';
import { requireAdmin } from '@/lib/auth-guards';
import { listCarHistoryRequests } from '@/actions/car-history.actions';
import HistoryRequestsTable from '@/components/cars/HistoryRequestsTable';
import { isMailConfigured } from '@/lib/mail/smtp';

export default async function HistorialSolicitudesPage() {
    const session = await requireAdmin();
    if (!session) {
        redirect('/dashboard');
    }

    const requests = await listCarHistoryRequests();
    const mailOk = isMailConfigured();

    return (
        <div className="space-y-6">
            <div className="border-b pb-4">
                <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-3">
                    <FileText className="w-8 h-8 text-blue-600" />
                    Solicitudes de historial
                </h1>
                <p className="mt-2 text-sm text-gray-600 max-w-2xl">
                    Pedidos de historial del vehículo hechos por WhatsApp. Solo un administrador puede
                    autorizar el envío del PDF al correo indicado por el cliente.
                </p>
            </div>

            {!mailOk ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    SMTP no configurado. Para autorizar envíos, completá{' '}
                    <code className="font-mono text-xs">SMTP_HOST</code>,{' '}
                    <code className="font-mono text-xs">SMTP_USER</code>,{' '}
                    <code className="font-mono text-xs">SMTP_PASS</code> y{' '}
                    <code className="font-mono text-xs">SMTP_FROM</code> en el entorno del servidor.
                    Podés seguir imprimiendo el historial desde la ficha del vehículo.
                </div>
            ) : null}

            <HistoryRequestsTable initialRequests={requests} />
        </div>
    );
}
