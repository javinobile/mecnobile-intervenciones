// app/dashboard/clients/[id]/ClientDetailWrapper.tsx
'use client';

import { useState } from 'react';
import { User, Phone, Mail, MapPin, Car, History, RotateCw, Edit, X } from 'lucide-react';
import Link from 'next/link';
import ClientEditForm from './ClientEditForm';
import { ClientDetails } from '@/actions/client.actions'; // Asumimos que ClientDetails está exportado
import CarAssignmentForm from '../cars/CarAssignmentForm';

const formatDate = (date: Date) => new Date(date).toLocaleDateString('es-ES');

export function ClientDetailWrapper({ details }: { details: ClientDetails }) {

    const [isEditing, setIsEditing] = useState(false);

    const { carHistory, ...client } = details;
    const activeCars = carHistory.filter(c => c.isActive);
    const inactiveCars = carHistory.filter(c => !c.isActive);

    // Tipo de datos para el formulario de edición
    const editableClientData = client as Omit<ClientDetails, 'carHistory'>;

    return (
        <main className="flex-grow p-8 ml-64 bg-gray-50">

            {/* Encabezado */}
            <div className="flex justify-between items-center mb-6 border-b pb-4">
                <h1 className="text-4xl font-extrabold text-gray-900 flex items-center">
                    <User className="w-8 h-8 mr-3 text-blue-600" />
                    Detalle del Cliente: <span className="ml-2 text-blue-700">{client.firstName} {client.lastName}</span>
                </h1>

                <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center px-4 py-2 bg-yellow-600 text-white font-medium rounded-lg shadow-md hover:bg-yellow-700 transition duration-150"
                >
                    <Edit className="w-5 h-5 mr-2" />
                    Editar Datos
                </button>
            </div>

            {/* Contenido Principal: 3 Columnas (Datos, Asignación, Historial) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* COLUMNA 1: Datos Básicos del Cliente */}
                <div className="lg:col-span-1 space-y-8">
                    <DataCard title="Datos de Contacto" icon={User}>
                        <DataRow icon={User} label="DNI/CUIT" value={client.dni || 'N/A'} />
                        <DataRow icon={Phone} label="Teléfono" value={client.phone || 'N/A'} />
                        <DataRow icon={Mail} label="Email" value={client.email || 'N/A'} />
                        <DataRow icon={MapPin} label="Dirección" value={client.address || 'Pendiente'} />
                    </DataCard>

                    <DataCard title="Vehículos Activos" icon={Car}>
                        {/* ... (Coches Activos) ... */}
                        {activeCars.length > 0 ? (
                            <div className="space-y-3">
                                {activeCars.map(car => (
                                    <Link key={car.carId} href={`/dashboard/cars/${car.carId}`} className="block p-3 border border-blue-200 rounded-lg bg-blue-50 hover:bg-blue-100 transition">
                                        <p className="font-semibold text-blue-800">{car.plate}</p>
                                        <p className="text-sm text-gray-600">{car.make} {car.model} ({car.year})</p>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500">Este cliente no tiene vehículos asignados actualmente.</p>
                        )}
                    </DataCard>
                </div>

                {/* COLUMNA 2: Asignar Vehículo */}
                <div className="lg:col-span-1">
                    <DataCard title="Asignar Nuevo Vehículo" icon={RotateCw}>
                        <p className="text-sm text-gray-600 mb-4">
                            Busque un coche existente para asignarlo como propiedad actual de este cliente.
                        </p>
                        <CarAssignmentForm clientId={client.id} />
                    </DataCard>
                </div>

                {/* COLUMNA 3: Historial de Propiedad */}
                <div className="lg:col-span-1">
                    <HistoryCard carHistory={inactiveCars} />
                </div>
            </div>

            {/* MODAL DE EDICIÓN */}
            {isEditing && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-2xl">
                        <div className="flex justify-between items-center border-b pb-3 mb-4">
                            <h2 className="text-2xl font-bold text-gray-800">Editar Perfil del Cliente</h2>
                            <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <ClientEditForm client={editableClientData} onClose={() => setIsEditing(false)} />
                    </div>
                </div>
            )}
        </main>
    );
}

// ----------------------------------------------------------------------
// CÓDIGO DE COMPONENTES AUXILIARES DEL PASO ANTERIOR (Mover aquí)
// ----------------------------------------------------------------------

// Reemplaza estas funciones con la implementación completa de DataCard, DataRow y HistoryCard 
// que usaste en el paso anterior.
// Ya que 'ClientDetailWrapper' es 'use client', los componentes auxiliares deben ser definidos
// dentro o importados.

// IMPLEMENTACIÓN DE DATA CARD Y DATA ROW
const DataCard = ({ title, icon: Icon, children }: any) => (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 h-full">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <Icon className="w-5 h-5 mr-2 text-blue-600" />
            {title}
        </h2>
        <div className="space-y-3">
            {children}
        </div>
    </div>
);

const DataRow = ({ label, value, icon: Icon }: { label: string, value: string | number, icon?: any }) => (
    <div className="flex items-center border-b border-gray-100 pb-2 last:border-b-0 last:pb-0">
        {Icon && <Icon className="w-4 h-4 mr-2 text-gray-400" />}
        <span className="text-sm font-medium text-gray-600">{label}:</span>
        <span className="text-sm font-semibold text-gray-800 ml-2">{value}</span>
    </div>
);

const HistoryCard = ({ carHistory }: { carHistory: any[] }) => (

    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 h-full">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center border-b pb-3">
            <History className="w-5 h-5 mr-2 text-gray-600" />
            Historial de Propiedad ({carHistory.length})
        </h2>

        {carHistory.length === 0 ? (
            <div className="text-center py-5 text-gray-500">
                Solo el vehículo(s) actual(es) está(n) registrado(s).
            </div>
        ) : (
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {carHistory.map((history) => (
                    <div key={history.ownershipId} className="p-3 border border-gray-100 rounded-lg">
                        <Link href={`/dashboard/cars/${history.carId}`} className="font-semibold text-gray-800 hover:text-blue-600">
                            {history.plate} ({history.make} {history.model})
                        </Link>
                        <p className="text-xs text-gray-500 mt-1">
                            De: {formatDate(history.startDate)}
                            {' '}
                            a: {formatDate(history.endDate)}
                        </p>
                    </div>
                ))}
            </div>
        )}
    </div>
);