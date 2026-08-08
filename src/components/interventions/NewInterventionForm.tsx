'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    createIntervention,
    searchCarsForOt,
    searchClientsForOt,
    findExistingCarByPlateOrVin,
    OtCarSearchResult,
    OtClientSearchResult,
    ExistingCarMatch,
} from '@/actions/intervention.actions';

type SearchMode = 'car' | 'client';
type Step = 'search' | 'resolve' | 'details';

const inputClass =
    'w-full min-h-11 px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base';

interface NewInterventionFormProps {
    /** Turno confirmado desde el que se abre la OT (queda vinculado). */
    appointmentId?: string;
    initialPlate?: string;
    initialDescription?: string;
}

export default function NewInterventionForm({
    appointmentId,
    initialPlate = '',
    initialDescription = '',
}: NewInterventionFormProps = {}) {
    const router = useRouter();

    const [step, setStep] = useState<Step>('search');
    const [mode, setMode] = useState<SearchMode>('car');
    const [searchTerm, setSearchTerm] = useState(initialPlate);
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
    /** Autos del propietario elegido (para ofrecer "usar existente" en Confirmar). */
    const [clientCars, setClientCars] = useState<OtClientSearchResult['cars']>([]);

    const [showNewCar, setShowNewCar] = useState(false);
    const [showNewClient, setShowNewClient] = useState(false);
    const [showTransferWarning, setShowTransferWarning] = useState(false);
    const [transferConfirmed, setTransferConfirmed] = useState(false);

    const suggestedPlate = initialPlate.replace(/[-\s]/g, '').toUpperCase();

    const [newCar, setNewCar] = useState({
        plate: suggestedPlate, vin: '', make: '', model: '', year: '', color: '', km: '',
    });
    const [newClient, setNewClient] = useState({
        firstName: '', lastName: '', dni: '', phone: '', email: '',
    });

    /** Auto encontrado al intentar alta nueva (conflicto VIN/patente). */
    const [carConflict, setCarConflict] = useState<ExistingCarMatch | null>(null);
    const [conflictChecking, setConflictChecking] = useState(false);
    const [associateConfirmed, setAssociateConfirmed] = useState(false);

    const [description, setDescription] = useState(initialDescription);
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

    const conflictNeedsTransfer =
        !!carConflict?.ownerId &&
        !!selectedClient?.id &&
        carConflict.ownerId !== selectedClient.id;

    const pickCar = (car: OtCarSearchResult) => {
        setSelectedCar(car);
        setShowNewCar(false);
        setCarConflict(null);
        setAssociateConfirmed(false);
        setClientCars([]);
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

    const pickClientCar = (car: OtClientSearchResult['cars'][0], client: OtClientSearchResult) => {
        setSelectedClient({
            id: client.id,
            fullName: client.fullName,
            dni: client.dni,
            phone: client.phone,
        });
        setClientCars(client.cars);
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
        setCarConflict(null);
        setAssociateConfirmed(false);
        setTransferConfirmed(false);
        setSearchTerm('');
        setClientResults([]);
        setStep('resolve');
    };

    /** Alta nueva de vehículo para un propietario ya existente. */
    const startRegisterNewCarForClient = (client: OtClientSearchResult) => {
        setSelectedClient({
            id: client.id,
            fullName: client.fullName,
            dni: client.dni,
            phone: client.phone,
        });
        setClientCars(client.cars);
        setSelectedCar(null);
        setShowNewCar(true);
        setShowNewClient(false);
        setCarConflict(null);
        setAssociateConfirmed(false);
        setTransferConfirmed(false);
        setNewCar({ plate: suggestedPlate, vin: '', make: '', model: '', year: '', color: '', km: '' });
        setSearchTerm('');
        setClientResults([]);
        setStep('resolve');
    };

    const startNewCarRegistration = () => {
        setShowNewCar(true);
        setSelectedCar(null);
        setCarConflict(null);
        setAssociateConfirmed(false);
        if (!selectedClient) setShowNewClient(true);
        setNewCar({ plate: suggestedPlate, vin: '', make: '', model: '', year: '', color: '', km: '' });
        setStep('resolve');
    };

    const startNewPersonRegistration = () => {
        setShowNewClient(true);
        setSelectedClient(null);
        setShowNewCar(true);
        setSelectedCar(null);
        setClientCars([]);
        setCarConflict(null);
        setAssociateConfirmed(false);
        setStep('resolve');
    };

    const adoptExistingCar = (car: OtCarSearchResult | ExistingCarMatch, transfer: boolean) => {
        setSelectedCar({
            id: car.id,
            plate: car.plate,
            make: car.make,
            model: car.model,
            year: car.year,
            vin: car.vin,
            ownerId: car.ownerId,
            ownerName: car.ownerName,
            ownerDni: car.ownerDni,
            ownerPhone: car.ownerPhone,
        });
        setShowNewCar(false);
        setCarConflict(null);
        setAssociateConfirmed(false);
        setTransferConfirmed(transfer);
        setError(null);
    };

    const startChangeOwner = () => {
        setShowTransferWarning(true);
    };

    const confirmChangeOwnerFlow = () => {
        setShowTransferWarning(false);
        setSelectedClient(null);
        setShowNewClient(false);
        setClientCars([]);
        setTransferConfirmed(false);
        setMode('client');
        setSearchTerm('');
        setStep('search');
    };

    const checkAndGoToDetails = async () => {
        setError(null);

        if (!selectedCar && !showNewCar) {
            setError('Seleccione un vehículo existente o registre uno nuevo.');
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
        if (showNewClient) {
            if (!newClient.firstName || !newClient.lastName || !newClient.dni) {
                setError('Complete nombre, apellido y DNI del propietario.');
                return;
            }
        }

        if (showNewCar) {
            if (!newCar.plate || !newCar.vin || !newCar.make || !newCar.model || !newCar.year || !newCar.km) {
                setError('Complete los datos del vehículo nuevo.');
                return;
            }

            // Si hay un conflicto pendiente, no avanzar hasta asociar o corregir datos
            if (carConflict) {
                setError('El vehículo ya existe. Asócielo al propietario o corrija patente/VIN.');
                return;
            }

            setConflictChecking(true);
            try {
                const existing = await findExistingCarByPlateOrVin({
                    plate: newCar.plate,
                    vin: newCar.vin,
                });

                if (existing) {
                    const sameOwner =
                        !!selectedClient?.id && existing.ownerId === selectedClient.id;

                    if (sameOwner) {
                        // Mismo dueño: reutilizar sin duplicar
                        adoptExistingCar(existing, false);
                        setStep('details');
                        return;
                    }

                    // Otro dueño o sin dueño: mostrar panel de asociación
                    setCarConflict(existing);
                    setAssociateConfirmed(false);
                    setError(null);
                    return;
                }
            } catch {
                setError('No se pudo verificar si el vehículo ya existe. Intente de nuevo.');
                return;
            } finally {
                setConflictChecking(false);
            }
        }

        setStep('details');
    };

    const confirmAssociateAndContinue = () => {
        if (!carConflict) return;

        const hasKnownClient = !!selectedClient?.id;
        const registeringNewClient = showNewClient;
        const needsOwnerTransfer = !!carConflict.ownerId && (
            (hasKnownClient && carConflict.ownerId !== selectedClient!.id) ||
            registeringNewClient
        );

        if (needsOwnerTransfer && !associateConfirmed) {
            setError('Confirme la asociación / transferencia de propiedad para continuar.');
            return;
        }

        if (!hasKnownClient && !registeringNewClient) {
            setError('Seleccione o registre un propietario para asociar este vehículo.');
            return;
        }

        setSelectedCar({
            id: carConflict.id,
            plate: carConflict.plate,
            make: carConflict.make,
            model: carConflict.model,
            year: carConflict.year,
            vin: carConflict.vin,
            ownerId: carConflict.ownerId,
            ownerName: carConflict.ownerName,
            ownerDni: carConflict.ownerDni,
            ownerPhone: carConflict.ownerPhone,
        });
        setShowNewCar(false);
        setCarConflict(null);
        setAssociateConfirmed(false);
        setTransferConfirmed(needsOwnerTransfer);
        setError(null);
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
                appointmentId,
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
                            <div className="mt-2 space-y-2">
                                <ul className="border border-gray-200 rounded-lg overflow-hidden divide-y">
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
                                <button
                                    type="button"
                                    onClick={startNewCarRegistration}
                                    className="w-full min-h-11 rounded-lg border border-dashed border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Ninguno es el correcto — registrar vehículo nuevo
                                </button>
                            </div>
                        )}

                        {mode === 'client' && clientResults.length > 0 && (
                            <ul className="mt-2 border border-gray-200 rounded-lg overflow-hidden divide-y">
                                {clientResults.map((client) => (
                                    <li key={client.id} className="p-3 space-y-3">
                                        <div>
                                            <p className="font-semibold text-gray-900">{client.fullName}</p>
                                            <p className="text-xs text-gray-500">DNI: {client.dni}</p>
                                        </div>

                                        {client.cars.length > 0 ? (
                                            <div className="space-y-1.5">
                                                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                                    Usar un vehículo existente
                                                </p>
                                                {client.cars.map((car) => (
                                                    <button
                                                        key={car.id}
                                                        type="button"
                                                        onClick={() => pickClientCar(car, client)}
                                                        className="block w-full text-left text-sm px-3 py-2.5 min-h-11 rounded-md bg-blue-50 hover:bg-blue-100 border border-blue-100"
                                                    >
                                                        <span className="font-medium text-blue-900">{car.plate}</span>
                                                        <span className="text-blue-800"> — {car.make} {car.model}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
                                                Sin vehículos activos en el sistema.
                                            </p>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => startRegisterNewCarForClient(client)}
                                            className={`w-full min-h-11 rounded-lg font-semibold text-sm ${
                                                client.cars.length === 0
                                                    ? 'bg-green-600 text-white'
                                                    : 'border border-green-600 text-green-700 hover:bg-green-50'
                                            }`}
                                        >
                                            Registrar vehículo nuevo para este propietario
                                        </button>
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
                                        if (mode === 'car') startNewCarRegistration();
                                        else startNewPersonRegistration();
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
                    {/* Owner first when registering new car for known client — clearer context */}
                    {selectedClient && !showNewClient && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-lg font-semibold text-gray-800">Propietario</h2>
                                {selectedCar && (
                                    <button
                                        type="button"
                                        onClick={startChangeOwner}
                                        className="text-sm text-amber-700 font-medium"
                                    >
                                        Cambiar dueño
                                    </button>
                                )}
                            </div>
                            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                                <p className="font-bold text-blue-900">{selectedClient.fullName}</p>
                                <p className="text-sm text-blue-800">DNI: {selectedClient.dni}</p>
                                {needsTransfer && !showNewCar && (
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
                        </div>
                    )}

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
                                <div className="rounded-lg border border-green-200 bg-green-50/50 p-3 space-y-1">
                                    <p className="text-sm font-semibold text-green-900">Registrar vehículo nuevo</p>
                                    <p className="text-xs text-green-800">
                                        El sistema verificará que la patente y el VIN no existan. Si ya están registrados,
                                        podrá asociar ese vehículo al propietario sin duplicarlo.
                                    </p>
                                </div>

                                {/* Ofrecer autos del propietario si los tiene y está en modo alta */}
                                {selectedClient && clientCars.length > 0 && (
                                    <div className="space-y-1.5">
                                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                            O elegir uno de sus vehículos
                                        </p>
                                        {clientCars.map((car) => (
                                            <button
                                                key={car.id}
                                                type="button"
                                                onClick={() => {
                                                    if (!selectedClient) return;
                                                    setSelectedCar({
                                                        id: car.id,
                                                        plate: car.plate,
                                                        make: car.make,
                                                        model: car.model,
                                                        year: car.year,
                                                        vin: '',
                                                        ownerId: selectedClient.id,
                                                        ownerName: selectedClient.fullName,
                                                        ownerDni: selectedClient.dni,
                                                        ownerPhone: selectedClient.phone,
                                                    });
                                                    setShowNewCar(false);
                                                    setCarConflict(null);
                                                    setTransferConfirmed(false);
                                                }}
                                                className="block w-full text-left text-sm px-3 py-2 min-h-11 rounded-md bg-gray-50 hover:bg-blue-50 border border-gray-200"
                                            >
                                                {car.plate} — {car.make} {car.model}
                                            </button>
                                        ))}
                                    </div>
                                )}

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
                                                        value = value.replace(/[-\s]/g, '').toUpperCase();
                                                    }
                                                    if (key === 'vin') {
                                                        value = value.replace(/\s/g, '').toUpperCase();
                                                    }
                                                    setNewCar({ ...newCar, [key]: value });
                                                    // Limpiar conflicto si cambia patente/VIN
                                                    if (key === 'plate' || key === 'vin') {
                                                        setCarConflict(null);
                                                        setAssociateConfirmed(false);
                                                    }
                                                }}
                                            />
                                            {key === 'plate' && (
                                                <p className="mt-1 text-[11px] text-gray-500">
                                                    Sin guiones al cargar (ej. FAM250). Para el sistema FAM-250 y FAM250 son la misma patente.
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Panel de conflicto / asociación */}
                                {carConflict && (
                                    <div className="p-4 rounded-lg border border-amber-300 bg-amber-50 space-y-3">
                                        <p className="text-sm font-semibold text-amber-950">
                                            Vehículo ya registrado por{' '}
                                            {carConflict.matchedBy === 'plate'
                                                ? 'patente (sin distinguir guiones: FAM-250 = FAM250)'
                                                : 'VIN'}
                                        </p>
                                        <div className="text-sm text-amber-900 space-y-0.5">
                                            <p>
                                                <strong>{carConflict.plate}</strong> — {carConflict.make} {carConflict.model}
                                                {carConflict.year ? ` (${carConflict.year})` : ''}
                                            </p>
                                            <p className="text-xs">VIN: {carConflict.vin}</p>
                                            <p>
                                                Dueño actual:{' '}
                                                <strong>{carConflict.ownerName}</strong>
                                                {carConflict.ownerDni ? ` (DNI ${carConflict.ownerDni})` : ''}
                                            </p>
                                        </div>

                                        {selectedClient && conflictNeedsTransfer && (
                                            <label className="flex items-start gap-2 text-sm text-amber-950">
                                                <input
                                                    type="checkbox"
                                                    checked={associateConfirmed}
                                                    onChange={(e) => setAssociateConfirmed(e.target.checked)}
                                                    className="mt-1"
                                                />
                                                <span>
                                                    Asociar este vehículo a <strong>{selectedClient.fullName}</strong>{' '}
                                                    (transferencia de propiedad) y usarlo en esta OT
                                                </span>
                                            </label>
                                        )}

                                        {showNewClient && carConflict.ownerId && (
                                            <label className="flex items-start gap-2 text-sm text-amber-950">
                                                <input
                                                    type="checkbox"
                                                    checked={associateConfirmed}
                                                    onChange={(e) => setAssociateConfirmed(e.target.checked)}
                                                    className="mt-1"
                                                />
                                                <span>
                                                    Asociar este vehículo al propietario nuevo que estoy registrando
                                                    (transferencia de propiedad) y usarlo en esta OT
                                                </span>
                                            </label>
                                        )}

                                        {selectedClient && !carConflict.ownerId && (
                                            <p className="text-sm text-amber-900">
                                                El vehículo no tiene dueño activo. Se asociará a{' '}
                                                <strong>{selectedClient.fullName}</strong>.
                                            </p>
                                        )}

                                        {!selectedClient && !showNewClient && (
                                            <p className="text-sm text-amber-900">
                                                Seleccione o registre un propietario para poder asociar este vehículo.
                                            </p>
                                        )}

                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCarConflict(null);
                                                    setAssociateConfirmed(false);
                                                }}
                                                className="flex-1 min-h-11 rounded-lg border border-amber-400 text-amber-900 font-medium text-sm"
                                            >
                                                Corregir patente / VIN
                                            </button>
                                            <button
                                                type="button"
                                                disabled={
                                                    (!selectedClient && !showNewClient) ||
                                                    ((conflictNeedsTransfer || (showNewClient && !!carConflict.ownerId)) && !associateConfirmed)
                                                }
                                                onClick={confirmAssociateAndContinue}
                                                className="flex-1 min-h-11 rounded-lg bg-amber-600 text-white font-semibold text-sm disabled:opacity-50"
                                            >
                                                Usar este vehículo y continuar
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={() => { setMode('car'); setStep('search'); setShowNewCar(false); setCarConflict(null); }}
                                    className="text-sm text-blue-600"
                                >
                                    Buscar vehículo existente en el sistema
                                </button>
                            </div>
                        )}
                    </div>

                    {/* New owner form (when needed) */}
                    {showNewClient && (
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800 mb-2">Propietario</h2>
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
                                {selectedCar?.ownerId && (
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
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={checkAndGoToDetails}
                        disabled={conflictChecking}
                        className="w-full min-h-11 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50"
                    >
                        {conflictChecking ? 'Verificando vehículo...' : 'Continuar al detalle de la OT'}
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
