import NewInterventionForm from '@/components/interventions/NewInterventionForm';
import { Wrench } from 'lucide-react';

export default function NewInterventionPage() {
    return (
        <>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-1 flex items-center">
                <Wrench className="w-7 h-7 mr-2 text-blue-600 shrink-0" />
                Abrir Nueva OT
            </h1>
            <p className="text-sm text-gray-500 mb-6">
                Busque por vehículo o propietario. Si no existe, podrá darlo de alta en el mismo flujo.
            </p>
            <NewInterventionForm />
        </>
    );
}
