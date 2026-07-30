'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    createIntervention,
    searchCarsForOt,
    searchClientsForOt,
    OtCarSearchResult,
    OtClientSearchResult,
} from '@/actions/intervention.actions';

type SearchMode = 'car' | 'client';
type Step = 'search' | 'resolve' | 'details';

const inputClass =
    'w-full min-h-11 px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base';

export default function NewInterventionForm() {
    const router = useRouter();

    const [step, setStep] = useState<Step>('search');
    const [mode, setMode] = useState<SearchMode>('car');
    const [searchTerm, setSearchTerm] = useState('');
    const [carResults, setCarResults] = useState<OtCarSearchResult[]>([]);
    const [clientResults, setClientResults] = useState<OtClientSearchResult[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);

    const [selectedCar, setSelectedCar] = useState<OtCarSearchResult | null>(null);
    const [selectedClient, setSelectedClient] = useState<{
        id: string;
        fullName: string;
        dni: string;
        phone: string | null;
    } | null>(null);

    const [showNewCar, setShowNewCar] = useState(false);
    const [showNewClient, setShowNewClient] = useState(false);
    const [showTransferWarning, setShowTransferWarning] = useState(false);
    const [transferConfirmed, setTransferConfirmed] = useState(false);

    const [newCar, setNewCar] = useState({
        plate: '', vin: '', make: '', model: '', year: '', color: '', km: '',
    });
    const [newClient, setNewClient] = useState({
        firstName: '', lastName: '', dni: '', phone: '', email: '',
    });

    const [description, setDescription] = useState('');
    const [notes, setNotes] = useState('');
    const [mileageKm, setMileageKm] = useState('');

    const [formLoading, setFormLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (searchTerm.length < 2) {
            setCarResults([]);
            setClientResults([]);
            return;
        }

        const t = setTimeout(async () => {
            setSearchLoading(true);
            if (mode === 'car') {
                setCarResults(await searchCarsForOt(searchTerm));
            } else {
                setClientResults(await searchClientsForOt(searchTerm));
            }
            setSearchLoading(false);
        }, 400);

        return () => clearTimeout(t);
    }, [searchTerm, mode]);

    const needsTransfer =
        !!selectedCar?.ownerId &&
        !!selectedClient?.id &&
        selectedCar.ownerId !== selectedClient.id;

    const pickCar = (car: OtCarSearchResult) => {
        setSelectedCar(car);
        setShowNewCar(false);
        if (car.ownerId) {
            setSelectedClient({
                id: car.ownerId,
                fullName: car.ownerName,
                dni: car.ownerDni || '',
                phone: car.ownerPhone,
            });
            setShowNewClient(false);
        } else {
            setSelectedClient(null);
            setShowNewClient(true);
        }
        setSearchTerm('');
        setCarResults([]);
        setTransferConfirmed(false);
        setStep('resolve');
    };

    const pickClient = (client: OtClientSearchResult) => {
        setSelectedClient({
            id: client.id,
            fullName: client.fullName,
            dni: client.dni,
            phone: client.phone,
        });
        setShowNewClient(false);
        setSelectedCar(null);
        setShowNewCar(false);
        setSearchTerm('');
        setClientResults([]);
        setTransferConfirmed(false);
        setStep('resolve');
    };

    const pickClientCar = (car: OtClientSearchResult['cars'][0], client: OtClientSearchResult) => {
        setSelectedClient({
            id: client.id,
            fullName: client.fullName,
            dni: client.dni,
            phone: client.phone,
        });
        setSelectedCar({
            id: car.id,
            plate: car.plate,
            make: car.make,
            model: car.model,
            year: car.year,
            vin: '',
            ownerId: client.id,
            ownerName: client.fullName,
            ownerDni: client.dni,
            ownerPhone: client.phone,
        });
        setShowNewCar(false);
        setShowNewClient(false);
        setTransferConfirmed(false);
        setStep('resolve');
    };

    const startChangeOwner = () => {
        setShowTransferWarning(true);
    };

    const confirmChangeOwnerFlow = () => {
        setShowTransferWarning(false);
        setSelectedClient(null);
        setShowNewClient(false);
        setTransferConfirmed(false);
        setMode('client');
        setSearchTerm('');
        setStep('search');
    };

    const goToDetails = () => {
        setError(null);
        if (!selectedCar && !showNewCar) {
            setError('Seleccione o registre un vehículo.');
            return;
        }
        if (!selectedClient && !showNewClient) {
            setError('Seleccione o registre un propietario.');
            return;
        }
        if (needsTransfer && !transferConfirmed) {
            setError('Confirme la transferencia de propiedad para continuar.');
            return;
        }
        if (showNewClient && selectedCar?.ownerId && !transferConfirmed) {
            setError('Confirme la transferencia de propiedad para continuar.');
            return;
        }
        if (showNewCar) {
            if (!newCar.plate || !newCar.vin || !newCar.make || !newCar.model || !newCar.year || !newCar.km) {
                setError('Complete los datos del vehículo nuevo.');
                return;
            }
        }
        if (showNewClient) {
            if (!newClient.firstName || !newClient.lastName || !newClient.dni) {
                setError('Complete nombre, apellido y DNI del propietario.');
                return;
            }
        }
        setStep('details');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);
        setError(null);

        try {
            const willTransfer =
                transferConfirmed &&
                !!selectedCar?.ownerId &&
                (needsTransfer || showNewClient);

            const result = await createIntervention({
                carId: showNewCar ? undefined : selectedCar?.id,
                clientId: showNewClient ? undefined : selectedClient?.id,
                transferOwnership: willTransfer,
                newCar: showNewCar ? newCar : undefined,
                newClient: showNewClient ? newClient : undefined,
                description,
                notes,
                mileageKm,
            });

            if (!result.success) throw new Error(result.message);

            router.push(`/dashboard/interventions/${result.intervention!.id}`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error al abrir la OT.');
        } finally {
            setFormLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Steps indicator */}
            <div className="flex gap-2 text-xs sm:text-sm font-medium">
                {(['search', 'resolve', 'details'] as Step[]).map((s, i) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => {
                            if (s === 'search') setStep('search');
                            if (s === 'resolve' && (selectedCar || selectedClient || showNewCar || showNewClient)) setStep('resolve');
                        }}
                        className={`flex-1 min-h-11 rounded-lg px-2 py-2 ${
                            step === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                        }`}
                    >
                        {i + 1}. {s === 'search' ? 'Buscar' : s === 'resolve' ? 'Confirmar' : 'Detalle'}
                    </button>
                ))}
            </div>

            {error && (
                <div className="p-3 text-sm font-medium text-red-700 bg-red-100 border border-red-300 rounded-md">
                    {error}
                </div>
            )}

            {/* Transfer warning modal */}
            {showTransferWarning && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-xl shadow-xl p-5 max-w-md w-full space-y-4">
                        <h3 className="text-lg font-bold text-gray-900">Transferencia de propiedad</h3>
                        <p className="text-sm text-gray-600">
                            Al cambiar el dueño, <strong>en adelante</strong> esta persona quedará asociada
                            al vehículo {selectedCar?.plate}. Las órdenes de trabajo ya cerradas conservan
                            el dueño que tenían en su momento.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <button
                                type="button"
                                onClick={() => setShowTransferWarning(false)}
                                className="flex-1 min-h-11 rounded-lg border border-gray-300 text-gray-700 font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmChangeOwnerFlow}
                                className="flex-1 min-h-11 rounded-lg bg-amber-600 text-white font-semibold"
                            >
                                Entendido, cambiar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {step === 'search' && (
                <section className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => { setMode('car'); setSearchTerm(''); }}
                            className={`min-h-11 rounded-lg font-medium text-sm ${
                                mode === 'car' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                            }`}
                        >
                            Por vehículo
                        </button>
                        <button
                            type="button"
                            onClick={() => { setMode('client'); setSearchTerm(''); }}
                            className={`min-h-11 rounded-lg font-medium text-sm ${
                                mode === 'client' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                            }`}
                        >
                            Por propietario
                        </button>
                    </div>

                    <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {mode === 'car' ? 'Patente, VIN, marca o modelo' : 'DNI, nombre o teléfono'}
                        </label>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={mode === 'car' ? 'Ej: AA123BB o FAM-250' : 'Ej: 30111222 o Pérez'}
                            className={inputClass}
                            autoFocus
                        />
                        {searchLoading && <p className="mt-2 text-sm text-blue-500">Buscando...</p>}

                        {mode === 'car' && carResults.length > 0 && (
                            <ul className="mt-2 border border-gray-200 rounded-lg overflow-hidden divide-y">
                                {carResults.map((car) => (
                                    <li key={car.id}>
                                        <button
                                            type="button"
                                            onClick={() => pickCar(car)}
                                            className="w-full text-left p-3 min-h-11 hover:bg-blue-50"
                                        >
                                            <p className="font-semibold text-gray-900">{car.plate} — {car.make} {car.model}</p>
                                            <p className="text-xs text-gray-500">Dueño: {car.ownerName}</p>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {mode === 'client' && clientResults.length > 0 && (
                            <ul className="mt-2 border border-gray-200 rounded-lg overflow-hidden divide-y">
                                {clientResults.map((client) => (
                                    <li key={client.id} className="p-3 space-y-2">
                                        <button
                                            type="button"
                                            onClick={() => pickClient(client)}
                                            className="w-full text-left"
                                        >
                                            <p className="font-semibold text-gray-900">{client.fullName}</p>
                                            <p className="text-xs text-gray-500">DNI: {client.dni}</p>
                                        </button>
                                        {client.cars.length > 0 ? (
                                            <div className="pl-2 space-y-1">
                                                <p className="text-xs font-medium text-gray-500">Sus vehículos:</p>
                                                {client.cars.map((car) => (
                                                    <button
                                                        key={car.id}
                                                        type="button"
                                                        onClick={() => pickClientCar(car, client)}
                                                        className="block w-full text-left text-sm px-3 py-2 min-h-11 rounded-md bg-gray-50 hover:bg-blue-50 border border-gray-100"
                                                    >
                                                        {car.plate} — {car.make} {car.model}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-amber-600">Sin vehículos activos. Podrá registrar uno.</p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}

                        {searchTerm.length >= 2 && !searchLoading &&
                            ((mode === 'car' && carResults.length === 0) ||
                                (mode === 'client' && clientResults.length === 0)) && (
                            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                                <p className="text-sm text-amber-800">No se encontraron resultados.</p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (mode === 'car') {
                                            setShowNewCar(true);
                                            setSelectedCar(null);
                                            if (!selectedClient) setShowNewClient(true);
                                        } else {
                                            setShowNewClient(true);
                                            setSelectedClient(null);
                                            setShowNewCar(true);
                                        }
                                        setStep('resolve');
                                    }}
                                    className="w-full min-h-11 rounded-lg bg-green-600 text-white font-semibold text-sm"
                                >
                                    Dar de alta {mode === 'car' ? 'vehículo' : 'persona'} y continuar
                                </button>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {step === 'resolve' && (
                <section className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 space-y-5">
                    {/* Vehicle */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-lg font-semibold text-gray-800">Vehículo</h2>
                            {!showNewCar && selectedCar && (
                                <button
                                    type="button"
                                    onClick={() => { setSelectedCar(null); setMode('car'); setStep('search'); }}
                                    className="text-sm text-blue-600 font-medium"
                                >
                                    Cambiar
                                </button>
                            )}
                        </div>

                        {selectedCar && !showNewCar ? (
                            <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                                <p className="font-bold text-green-900">{selectedCar.plate}</p>
                                <p className="text-sm text-green-800">{selectedCar.make} {selectedCar.model}</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-sm text-gray-600">Registrar vehículo nuevo</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {([
                                        ['plate', 'Patente *'],
                                        ['vin', 'VIN *'],
                                        ['make', 'Marca *'],
                                        ['model', 'Modelo *'],
                                        ['year', 'Año *'],
                                        ['km', 'Km *'],
                                        ['color', 'Color'],
                                    ] as const).map(([key, label]) => (
                                        <div key={key}>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                                            <input
                                                className={inputClass}
                                                value={newCar[key]}
                                                placeholder={key === 'plate' ? 'AA123BB o ABC123' : undefined}
                                                onChange={(e) => {
                                                    let value = e.target.value;
                                                    if (key === 'plate') {
                                                        // Altas nuevas: sin guiones/espacios, mayúsculas
                                                        value = value.replace(/[-\s]/g, '').toUpperCase();
                                                    }
                                                    setNewCar({ ...newCar, [key]: value });
                                                }}
                                            />
                                            {key === 'plate' && (
                                                <p className="mt-1 text-[11px] text-gray-500">
                                                    Sin guiones. Formato Mercosur AA123BB o anterior ABC123.
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {selectedClient && !selectedCar && (
                                    <button
                                        type="button"
                                        onClick={() => { setMode('car'); setStep('search'); setShowNewCar(false); }}
                                        className="text-sm text-blue-600"
                                    >
                                        Buscar vehículo existente en su lugar
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Owner */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-lg font-semibold text-gray-800">Propietario</h2>
                            {selectedCar && selectedClient && !showNewClient && (
                                <button
                                    type="button"
                                    onClick={startChangeOwner}
                                    className="text-sm text-amber-700 font-medium"
                                >
                                    Cambiar dueño
                                </button>
                            )}
                        </div>

                        {selectedClient && !showNewClient ? (
                            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                                <p className="font-bold text-blue-900">{selectedClient.fullName}</p>
                                <p className="text-sm text-blue-800">DNI: {selectedClient.dni}</p>
                                {needsTransfer && (
                                    <div className="mt-3 p-3 bg-amber-50 border border-amber-300 rounded-lg space-y-2">
                                        <p className="text-sm text-amber-900">
                                            El dueño actual del vehículo es <strong>{selectedCar?.ownerName}</strong>.
                                            Confirme la transferencia: en adelante este vehículo quedará a nombre de{' '}
                                            <strong>{selectedClient.fullName}</strong>.
                                        </p>
                                        <label className="flex items-start gap-2 text-sm text-amber-900">
                                            <input
                                                type="checkbox"
                                                checked={transferConfirmed}
                                                onChange={(e) => setTransferConfirmed(e.target.checked)}
                                                className="mt-1"
                                            />
                                            Confirmo la transferencia de propiedad
                                        </label>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-sm text-gray-600">Registrar propietario nuevo</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {([
                                        ['firstName', 'Nombre *'],
                                        ['lastName', 'Apellido *'],
                                        ['dni', 'DNI *'],
                                        ['phone', 'Teléfono'],
                                        ['email', 'Email'],
                                    ] as const).map(([key, label]) => (
                                        <div key={key} className={key === 'email' ? 'sm:col-span-2' : ''}>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                                            <input
                                                className={inputClass}
                                                value={newClient[key]}
                                                onChange={(e) => setNewClient({ ...newClient, [key]: e.target.value })}
                                            />
                                        </div>
                                    ))}
                                </div>
                                {selectedCar?.ownerId && showNewClient && (
                                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg">
                                        <p className="text-sm text-amber-900 mb-2">
                                            El vehículo tiene dueño actual (<strong>{selectedCar.ownerName}</strong>).
                                            Al dar de alta esta persona se transferirá la propiedad.
                                        </p>
                                        <label className="flex items-start gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={transferConfirmed}
                                                onChange={(e) => setTransferConfirmed(e.target.checked)}
                                                className="mt-1"
                                            />
                                            Confirmo la transferencia
                                        </label>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={goToDetails}
                        className="w-full min-h-11 rounded-lg bg-blue-600 text-white font-semibold"
                    >
                        Continuar al detalle de la OT
                    </button>
                </section>
            )}

            {step === 'details' && (
                <form onSubmit={handleSubmit} className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                    <div className="p-3 rounded-lg bg-gray-50 text-sm text-gray-700 space-y-1">
                        <p>
                            <span className="font-medium">Vehículo:</span>{' '}
                            {showNewCar ? `${newCar.plate} (nuevo)` : `${selectedCar?.plate} — ${selectedCar?.make} ${selectedCar?.model}`}
                        </p>
                        <p>
                            <span className="font-medium">Propietario:</span>{' '}
                            {showNewClient ? `${newClient.firstName} ${newClient.lastName} (nuevo)` : selectedClient?.fullName}
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Kilometraje actual *
                        </label>
                        <input
                            type="number"
                            value={mileageKm}
                            onChange={(e) => setMileageKm(e.target.value)}
                            className={inputClass}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Descripción del problema *
                        </label>
                        <textarea
                            rows={4}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className={inputClass}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Notas internas
                        </label>
                        <textarea
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className={inputClass}
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                        <button
                            type="button"
                            onClick={() => setStep('resolve')}
                            className="flex-1 min-h-11 rounded-lg border border-gray-300 font-medium"
                        >
                            Volver
                        </button>
                        <button
                            type="submit"
                            disabled={formLoading}
                            className="flex-1 min-h-11 rounded-lg bg-green-600 text-white font-semibold disabled:opacity-50"
                        >
                            {formLoading ? 'Abriendo...' : 'Abrir Orden de Trabajo'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
