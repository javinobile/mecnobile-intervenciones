// app/dashboard/cars/[id]/page.tsx
import { notFound } from 'next/navigation';
import { getCarDetails } from '@/actions/car.actions';
import Link from 'next/link';
import { Car, User, Settings, FileText, PlusCircle, Calendar } from 'lucide-react';
import CarEditForm from '@/components/cars/CarEditForm';

interface CarDetailPageProps {
    params: {
        id: string;
    };
}

// Función auxiliar para formatear fechas
const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-AR', { year: 'numeric', month: 'short', day: 'numeric' });
};

// Función auxiliar para formatear KM
const formatKm = (km: number) => {
    return km.toLocaleString('es-AR') + ' km';
};

export default async function CarDetailPage({ params }: CarDetailPageProps) {

    const carId = params.id;
    const details = await getCarDetails(carId);

    if (!details) {
        return notFound();
    }

    const { car, currentOwner, interventions } = details;

    // Preparamos los datos del coche para pasarlos al componente de cliente
    const carDetailsForEdit = {
        id: car.id,
        licensePlate: car.licensePlate,
        vin: car.vin,
        engineNumber: car.engineNumber,
        color: car.color,
        make: car.make,
        model: car.model,
        year: car.year,
        initialKm: car.initialKm,
    };

    return (
        <>

            {/* Encabezado y Botones de Acción */}
            <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h1 className="text-4xl font-extrabold text-gray-900 flex items-center">
                    <Car className="w-8 h-8 mr-3 text-blue-600" />
                    Detalle del Vehículo: <span className="ml-2 text-blue-700">{car.licensePlate}</span>
                </h1>

                {/* CONTENEDOR DE BOTONES (flex) */}
                <div className="flex space-x-3">

                    {/* BOTÓN 1: EDITAR VEHÍCULO */}
                    {/* El componente CarEditForm ya incluye el botón y el modal. */}
                    <CarEditForm car={carDetailsForEdit} />

                    {/* BOTÓN 2: ABRIR NUEVA OT */}
                    <Link href={`/dashboard/interventions/new?carId=${car.id}`} className="flex items-center px-4 py-2 bg-purple-600 text-white font-medium rounded-lg shadow-md hover:bg-purple-700 transition duration-150">
                        <PlusCircle className="w-5 h-5 mr-2" />
                        Abrir Nueva OT
                    </Link>
                </div>
            </div>

            {/* Contenido Principal: 2 Columnas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* COLUMNA IZQUIERDA: Datos Básicos y Propietario */}
                <div className="lg:col-span-1 space-y-8">

                    {/* Tarjeta 1: Datos del Vehículo */}
                    <DataCard title="Datos del Automóvil" icon={Settings}>
                        <DataRow label="Matrícula" value={car.licensePlate} />
                        <DataRow label="Color" value={car.color || ''} />
                        <DataRow label="VIN (Chasis)" value={car.vin} />
                        <DataRow label="Motor" value={car.engineNumber || ''} />
                        <DataRow label="Marca y Modelo" value={`${car.make} ${car.model}`} />
                        <DataRow label="Año / Color" value={`${car.year || 'N/A'} / ${car.color || 'N/A'}`} />
                        <DataRow label="Km Inicial" value={formatKm(car.initialKm || 0)} />
                    </DataCard>

                    {/* Tarjeta 2: Propietario Actual */}
                    <DataCard title="Propietario Actual" icon={User}>
                        {currentOwner ? (
                            <>
                                <DataRow label="Nombre" value={`${currentOwner.firstName} ${currentOwner.lastName}`} />
                                <DataRow label="DNI/CUIT" value={currentOwner.dni || 'N/A'} />
                                <DataRow label="Teléfono" value={currentOwner.phone || 'N/A'} />
                                <DataRow label="Email" value={currentOwner.email || 'N/A'} />
                                {/* Enlace al detalle del cliente (futura implementación) */}
                                <Link href={`/dashboard/clients/${currentOwner.id}`} className="text-sm text-blue-600 hover:text-blue-800 mt-2 block">
                                    Ver Perfil del Cliente
                                </Link>
                            </>
                        ) : (
                            <p className="text-gray-500">No hay un propietario actual registrado.</p>
                        )}
                    </DataCard>

                </div>

                {/* COLUMNA DERECHA: Historial de Intervenciones (OTs) */}
                <div className="lg:col-span-2">
                    <InterventionHistoryCard interventions={interventions} />
                </div>
            </div>

        </>
    );
}


// ----------------------------------------------------------------------
// COMPONENTES AUXILIARES
// ----------------------------------------------------------------------

// Componente Tarjeta de Datos
const DataCard = ({ title, icon: Icon, children }: any) => (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <Icon className="w-5 h-5 mr-2 text-blue-600" />
            {title}
        </h2>
        <div className="space-y-3">
            {children}
        </div>
    </div>
);

// Componente Fila de Datos
const DataRow = ({ label, value }: { label: string, value: string | number }) => (
    <div className="flex justify-between items-center border-b border-gray-100 pb-2 last:border-b-0 last:pb-0">
        <span className="text-sm font-medium text-gray-600">{label}:</span>
        <span className="text-sm font-semibold text-gray-800">{value}</span>
    </div>
);

// Componente Historial de Intervenciones
const InterventionHistoryCard = ({ interventions }: { interventions: any[] }) => (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 h-full">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center border-b pb-3">
            <FileText className="w-5 h-5 mr-2 text-red-600" />
            Historial de Órdenes de Trabajo ({interventions.length})
        </h2>

        {interventions.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
                Aún no hay Órdenes de Trabajo registradas para este vehículo.
            </div>
        ) : (
            <div className="space-y-4">
                {interventions.map((ot) => (
                    <Link href={`/dashboard/interventions/${ot.id}`} key={ot.id} className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition duration-100 cursor-pointer">
                        <div className="flex justify-between items-start">
                            <span className="text-lg font-bold text-blue-700">OT #{ot.otNumber}</span>
                            {renderStatusBadge(ot.status)}
                        </div>
                        <p className="text-sm text-gray-700 mt-1 truncate">{ot.description}</p>
                        <div className="flex justify-between text-xs text-gray-500 mt-2">
                            <div className="flex items-center">
                                <Calendar className="w-3 h-3 mr-1" />
                                <span>{formatDate(ot.createdAt)}</span>
                            </div>
                            <span>{formatKm(ot.mileageKm)}</span>
                            <span>Por: {ot.performedBy?.name}</span>
                        </div>
                    </Link>
                ))}
            </div>
        )}
    </div>
);

// Componente para el badge de estado de la OT
const renderStatusBadge = (status: string) => {
    let classes = 'px-2 py-0.5 rounded-full text-xs font-medium ';
    let text = status;

    switch (status) {
        case 'CERRADA':
            classes += 'bg-green-100 text-green-800';
            text = 'Completada';
            break;
        case 'ABIERTA':
            classes += 'bg-yellow-100 text-yellow-800';
            text = 'Abierta';
            break;
        case 'CANCELADA':
            classes += 'bg-red-100 text-red-800';
            text = 'Cancelada';
            break;
        default:
            classes += 'bg-gray-100 text-gray-800';
            break;
    }

    return <span className={classes}>{text}</span>;
};