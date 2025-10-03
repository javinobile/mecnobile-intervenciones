// app/components/cars/CarEditForm.tsx
'use client';

import { useState } from 'react';
import { Settings, X, Loader2, Save } from 'lucide-react';
import { updateCar, UpdateCarData } from '@/actions/client.actions';

interface CarDetails {
    id: string;
    licensePlate: string;
    vin: string;
    engineNumber: string | null;
    color: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
    initialKm: number;
}

export default function CarEditForm({ car }: { car: CarDetails }) {
    const [isOpen, setIsOpen] = useState(false);
    const [formData, setFormData] = useState<UpdateCarData>({
        licensePlate: car.licensePlate,
        vin: car.vin,
        engineNumber: car.engineNumber,
        color: car.color,
        make: car.make,
        model: car.model,
        year: car.year,
        initialKm: car.initialKm,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ 
            ...prev, 
            [name]: name === 'year' || name === 'initialKm' ? parseInt(value || '0') : value 
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Limpieza de datos (ej: convertir strings vacíos a null para campos opcionales)
        const dataToSend: UpdateCarData = {
            ...formData,
            engineNumber: formData.engineNumber?.trim() || null,
            color: formData.color?.trim() || null,
            // ... otros campos
        };

        const result = await updateCar(car.id, dataToSend);
        
        setLoading(false);
        
        if (result.success) {
            setIsOpen(false);
            // La función updateCar ya revalida la ruta, lo que refrescará los datos en la página.
        } else {
            setError(result.message);
        }
    };
    
    // --- Renderizado del Modal ---
    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center px-3 py-1 bg-yellow-500 text-white text-sm font-medium rounded-lg shadow-md hover:bg-yellow-600 transition"
                aria-label="Editar vehículo"
            >
                <Settings className="w-4 h-4 mr-1" />
                Editar Datos
            </button>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
                
                {/* Encabezado del Modal */}
                <div className="flex justify-between items-center p-5 border-b">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center">
                        <Settings className="w-6 h-6 mr-2 text-yellow-600" />
                        Modificar Datos del Vehículo
                    </h3>
                    <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Formulario */}
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    
                    {error && <div className="p-3 bg-red-100 text-red-700 text-sm rounded-md">{error}</div>}

                    {/* Fila 1: Matrícula y VIN */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Matrícula</label>
                            <input name="licensePlate" value={formData.licensePlate} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">VIN (Chasis)</label>
                            <input name="vin" value={formData.vin} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                        </div>
                    </div>
                    
                    {/* Fila 2: Marca, Modelo y Año */}
                    <div className="grid grid-cols-3 gap-4">
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Marca</label>
                            <input name="make" value={formData.make || ''} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Modelo</label>
                            <input name="model" value={formData.model || ''} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Año</label>
                            <input name="year" type="number" value={formData.year || ''} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                        </div>
                    </div>

                    {/* Fila 3: Motor, Color y KM Inicial */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">N° Motor</label>
                            <input name="engineNumber" value={formData.engineNumber || ''} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Color</label>
                            <input name="color" value={formData.color || ''} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">KM Inicial</label>
                            <input name="initialKm" type="number" value={formData.initialKm} onChange={handleChange} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2" />
                        </div>
                    </div>

                    {/* Botones de Acción */}
                    <div className="flex justify-end pt-4 space-x-3">
                        <button 
                            type="button" 
                            onClick={() => setIsOpen(false)} 
                            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                            disabled={loading}
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            className="flex items-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:opacity-50"
                            disabled={loading}
                        >
                            {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
                            Guardar Cambios
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}