// app/dashboard/clients/[id]/page.tsx
import { notFound } from 'next/navigation';
import { getClientDetails } from '@/actions/client.actions';
import { ClientDetailWrapper } from '@/components/clients/ClientDetailWrapper';


interface ClientDetailPageProps {
    params: {
        id: string;
    };
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {

    const clientId = params.id;
    const details = await getClientDetails(clientId); // Carga de datos en el servidor

    if (!details) {
        return notFound();
    }

    // Pasa los datos cargados al componente de cliente
    return (
        <ClientDetailWrapper details={details} />
    );
}