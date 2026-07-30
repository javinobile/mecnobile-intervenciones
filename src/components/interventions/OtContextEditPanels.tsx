'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    updateOtCar,
    updateOtClient,
    transferOtOwner,
    searchClientsForOt,
    OtClientSearchResult,
} from '@/actions/intervention.actions';

const inputClass =
    'w-full min-h-11 px-3 py-2 border border-gray-300 rounded-lg text-base focus:ring-blue-500 focus:border-blue-500';

type CarData = {
    id: string;
    licensePlate: string;
    vin: string;
    make: string | null;
    model: string | null;
    year: number | null;
    color: string | null;
    engineNumber: string | null;
    initialKm: number;
};

type OwnerData = {
    id: string;
    firstName: string;
    lastName: string;
    dni: string;
    phone: string | null;
    email: string | null;
    address: string | null;
};

export function OtCarEditPanel({
    interventionId,
    car,
    canEdit,
}: {
    interventionId: string;
    car: CarData;
    canEdit: boolean;
}) {
    const router = useRouter();
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        licensePlate: car.licensePlate,
        vin: car.vin,
        make: car.make || '',
        model: car.model || '',
        year: car.year?.toString() || '',
        color: car.color || '',
        engineNumber: car.engineNumber || '',
        initialKm: car.initialKm.toString(),
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    if (!canEdit) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);
        try {
            const result = await updateOtCar(interventionId, {
                licensePlate: form.licensePlate,
                vin: form.vin,
                make: form.make || null,
                model: form.model || null,
                year: form.year ? parseInt(form.year, 10) : null,
                color: form.color || null,
                engineNumber: form.engineNumber || null,
                initialKm: parseInt(form.initialKm, 10) || car.initialKm,
            });
            if (!result.success) throw new Error(result.message);
            setMessage(result.message);
            setEditing(false);
            router.refresh();
        } catch (err: unknown) {
            setMessage(err instanceof Error ? err.message : 'Error');
        } finally {
            setLoading(false);
        }
    };

    if (!editing) {
        return (
            <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-3 w-full min-h-11 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
            >
                Editar vehículo
            </button>
        );
    }

    return (
        <form onSubmit={handleSave} className="mt-3 space-y-2 border-t pt-3">
            {([
                ['licensePlate', 'Patente'],
                ['vin', 'VIN'],
                ['make', 'Marca'],
                ['model', 'Modelo'],
                ['year', 'Año'],
                ['color', 'Color'],
                ['engineNumber', 'Nº motor'],
                ['initialKm', 'Km inicial'],
            ] as const).map(([key, label]) => (
                <div key={key}>
                    <label className="text-xs text-gray-600">{label}</label>
                    <input
                        className={inputClass}
                        value={form[key]}
                        placeholder={key === 'licensePlate' ? 'AA123BB' : undefined}
                        onChange={(e) => {
                            let value = e.target.value;
                            if (key === 'licensePlate') {
                                value = value.replace(/[-\s]/g, '').toUpperCase();
                            }
                            setForm({ ...form, [key]: value });
                        }}
                    />
                    {key === 'licensePlate' && (
                        <p className="text-[11px] text-gray-500 mt-0.5">Sin guiones ni espacios.</p>
                    )}
                </div>
            ))}
            {message && <p className="text-xs text-gray-700">{message}</p>}
            <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(false)} className="flex-1 min-h-11 border rounded-lg text-sm">
                    Cancelar
                </button>
                <button type="submit" disabled={loading} className="flex-1 min-h-11 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                    Guardar
                </button>
            </div>
        </form>
    );
}

export function OtOwnerEditPanel({
    interventionId,
    owner,
    canEdit,
}: {
    interventionId: string;
    owner: OwnerData;
    canEdit: boolean;
}) {
    const router = useRouter();
    const [editing, setEditing] = useState(false);
    const [changingOwner, setChangingOwner] = useState(false);
    const [showWarning, setShowWarning] = useState(false);
    const [form, setForm] = useState({
        firstName: owner.firstName,
        lastName: owner.lastName,
        dni: owner.dni,
        phone: owner.phone || '',
        email: owner.email || '',
        address: owner.address || '',
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<OtClientSearchResult[]>([]);
    const [newClient, setNewClient] = useState({ firstName: '', lastName: '', dni: '', phone: '', email: '' });
    const [mode, setMode] = useState<'search' | 'new'>('search');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!changingOwner || searchTerm.length < 2) {
            setResults([]);
            return;
        }
        const t = setTimeout(async () => {
            setResults(await searchClientsForOt(searchTerm));
        }, 400);
        return () => clearTimeout(t);
    }, [searchTerm, changingOwner]);

    if (!canEdit) return null;

    const handleSaveOwner = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);
        try {
            const result = await updateOtClient(interventionId, {
                firstName: form.firstName,
                lastName: form.lastName,
                dni: form.dni,
                phone: form.phone || null,
                email: form.email || null,
                address: form.address || null,
            });
            if (!result.success) throw new Error(result.message);
            setMessage(result.message);
            setEditing(false);
            router.refresh();
        } catch (err: unknown) {
            setMessage(err instanceof Error ? err.message : 'Error');
        } finally {
            setLoading(false);
        }
    };

    const doTransfer = async (payload: {
        newClientId?: string;
        newClient?: typeof newClient;
    }) => {
        setLoading(true);
        setMessage(null);
        try {
            const result = await transferOtOwner({
                interventionId,
                newClientId: payload.newClientId,
                newClient: payload.newClient,
            });
            if (!result.success) throw new Error(result.message);
            setChangingOwner(false);
            setShowWarning(false);
            router.refresh();
        } catch (err: unknown) {
            setMessage(err instanceof Error ? err.message : 'Error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mt-3 space-y-2">
            {!editing && !changingOwner && (
                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="w-full min-h-11 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
                    >
                        Editar datos del propietario
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowWarning(true)}
                        className="w-full min-h-11 text-sm font-medium text-amber-800 border border-amber-200 rounded-lg hover:bg-amber-50"
                    >
                        Cambiar dueño del vehículo
                    </button>
                </div>
            )}

            {showWarning && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg space-y-2">
                    <p className="text-sm text-amber-900">
                        En adelante la persona elegida quedará asociada a este vehículo.
                        Las OT ya cerradas conservan su dueño histórico.
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setShowWarning(false)}
                            className="flex-1 min-h-11 border rounded-lg text-sm"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowWarning(false); setChangingOwner(true); }}
                            className="flex-1 min-h-11 bg-amber-600 text-white rounded-lg text-sm font-semibold"
                        >
                            Continuar
                        </button>
                    </div>
                </div>
            )}

            {editing && (
                <form onSubmit={handleSaveOwner} className="space-y-2 border-t pt-3">
                    {([
                        ['firstName', 'Nombre'],
                        ['lastName', 'Apellido'],
                        ['dni', 'DNI'],
                        ['phone', 'Teléfono'],
                        ['email', 'Email'],
                        ['address', 'Dirección'],
                    ] as const).map(([key, label]) => (
                        <div key={key}>
                            <label className="text-xs text-gray-600">{label}</label>
                            <input
                                className={inputClass}
                                value={form[key]}
                                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                                required={key === 'firstName' || key === 'lastName' || key === 'dni'}
                            />
                        </div>
                    ))}
                    {message && <p className="text-xs">{message}</p>}
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setEditing(false)} className="flex-1 min-h-11 border rounded-lg text-sm">Cancelar</button>
                        <button type="submit" disabled={loading} className="flex-1 min-h-11 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">Guardar</button>
                    </div>
                </form>
            )}

            {changingOwner && (
                <div className="space-y-3 border-t pt-3">
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setMode('search')}
                            className={`min-h-11 rounded-lg text-sm font-medium ${mode === 'search' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
                        >
                            Buscar
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('new')}
                            className={`min-h-11 rounded-lg text-sm font-medium ${mode === 'new' ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
                        >
                            Alta nueva
                        </button>
                    </div>

                    {mode === 'search' ? (
                        <div>
                            <input
                                className={inputClass}
                                placeholder="DNI o nombre..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <ul className="mt-2 divide-y border rounded-lg overflow-hidden">
                                {results.map((c) => (
                                    <li key={c.id}>
                                        <button
                                            type="button"
                                            disabled={loading || c.id === owner.id}
                                            onClick={() => doTransfer({ newClientId: c.id })}
                                            className="w-full text-left p-3 min-h-11 hover:bg-blue-50 disabled:opacity-40"
                                        >
                                            <p className="font-medium text-sm">{c.fullName}</p>
                                            <p className="text-xs text-gray-500">DNI {c.dni}</p>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                doTransfer({ newClient });
                            }}
                            className="space-y-2"
                        >
                            {([
                                ['firstName', 'Nombre *'],
                                ['lastName', 'Apellido *'],
                                ['dni', 'DNI *'],
                                ['phone', 'Teléfono'],
                                ['email', 'Email'],
                            ] as const).map(([key, label]) => (
                                <div key={key}>
                                    <label className="text-xs text-gray-600">{label}</label>
                                    <input
                                        className={inputClass}
                                        value={newClient[key]}
                                        onChange={(e) => setNewClient({ ...newClient, [key]: e.target.value })}
                                        required={key === 'firstName' || key === 'lastName' || key === 'dni'}
                                    />
                                </div>
                            ))}
                            <button type="submit" disabled={loading} className="w-full min-h-11 bg-amber-600 text-white rounded-lg font-semibold disabled:opacity-50">
                                Transferir a esta persona
                            </button>
                        </form>
                    )}

                    {message && <p className="text-xs text-red-700">{message}</p>}
                    <button
                        type="button"
                        onClick={() => setChangingOwner(false)}
                        className="w-full min-h-11 border rounded-lg text-sm"
                    >
                        Cancelar
                    </button>
                </div>
            )}
        </div>
    );
}
