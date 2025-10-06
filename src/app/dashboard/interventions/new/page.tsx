// app/(dashboard)/interventions/new/page.tsx

import NewInterventionForm from '@/components/interventions/NewInterventionForm';
import { Wrench } from 'lucide-react';
// Asegúrate que la ruta de importación sea correcta si moviste el archivo:

// Esta es una página de Servidor, aunque solo renderiza el componente de Cliente.
export default function NewInterventionPage() {
    return (
        <>
            <h1 className="text-4xl font-extrabold text-gray-900 mb-2 flex items-center">
                <Wrench className="w-8 h-8 mr-3 text-blue-600" />
                Abrir Nueva Orden de Trabajo (OT)
            </h1>
            <p className="text-gray-500 mb-8">
                Selecciona el vehículo e ingresa el detalle de la intervención a realizar.
            </p>

            {/* Renderizamos el formulario que contiene toda la lógica de estado */}
            <NewInterventionForm />
        </>
    );
}