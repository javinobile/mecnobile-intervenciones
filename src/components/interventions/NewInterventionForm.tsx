// app/components/interventions/NewInterventionForm.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCarsForSearch } from '@/actions/car.actions';
import { createIntervention } from '@/actions/intervention.actions';

interface CarSearchResult {
    id: string;
    plate: string;
    make: string;
    model: string;
    ownerName: string;
}

export default function NewInterventionForm() {
  const router = useRouter();
  
  // 1. Estado de Formulario (Nombres alineados al esquema de Prisma)
  const [description, setDescription] = useState(''); // Mapea a description
  const [notes, setNotes] = useState('');           // Mapea a notes
  const [mileageKm, setMileageKm] = useState('');   // NUEVO: Mapea a mileageKm

  // 2. Estado de Búsqueda de Vehículo (Mismo)
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<CarSearchResult[]>([]);
  const [selectedCar, setSelectedCar] = useState<CarSearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ... (Efecto para la búsqueda es el mismo) ...
  useEffect(() => {
    if (searchTerm.length < 3) {
      setSearchResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setSearchLoading(true);
      // Usar getCarsForSearch aquí
      const cars = await getCarsForSearch(searchTerm); 
      setSearchResults(cars);
      setSearchLoading(false);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setError(null);

    if (!selectedCar) {
      setError("Debe seleccionar un vehículo.");
      setFormLoading(false);
      return;
    }

    try {
        const data = {
            carId: selectedCar.id,
            description, // Mapeado
            notes,       // Mapeado
            mileageKm,   // Mapeado
        };

        const result = await createIntervention(data);

        if (!result.success) {
            throw new Error(result.message);
        }

        alert(`OT #${result.intervention!.otNumber} abierta con éxito.`);
        router.push(`/dashboard/interventions/${result.intervention!.id}`);

    } catch (err: any) {
        setError(err.message || "Ocurrió un error inesperado al abrir la OT.");
    } finally {
        setFormLoading(false);
    }
  };

  const handleSelectCar = (car: CarSearchResult) => {
    setSelectedCar(car);
    setSearchTerm('');
    setSearchResults([]);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-200">
      
      {/* SECCIÓN 1: SELECCIÓN DEL VEHÍCULO (No cambia) */}
      <section className="border-b border-gray-200 pb-6">
        <h2 className="text-2xl font-semibold text-blue-600 mb-4">
          1. Vehículo y Cliente
        </h2>
        {/* ... (Lógica de selección de selectedCar) ... */}
        {selectedCar ? (
          <div className="p-4 border-2 border-green-300 bg-green-50 rounded-lg flex justify-between items-center">
            <div>
                <p className="text-lg font-bold text-green-800">
                    Seleccionado: {selectedCar.plate}
                </p>
                <p className="text-sm text-green-700">
                    {selectedCar.make} {selectedCar.model} | Dueño: {selectedCar.ownerName}
                </p>
            </div>
            <button 
                type="button" 
                onClick={() => setSelectedCar(null)}
                className="text-red-500 hover:text-red-700 font-medium"
            >
                Cambiar
            </button>
          </div>
        ) : (
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
                Buscar Vehículo (Matrícula o Modelo)
            </label>
            <input
              type="text"
              placeholder="Ej: ABC-123 o Focus"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
              required
            />

            {searchLoading && <p className="mt-2 text-sm text-blue-500">Buscando...</p>}
            {searchResults.length > 0 && (
              <ul className="absolute z-10 w-full mt-2 bg-white border border-gray-300 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                {searchResults.map((car) => (
                  <li
                    key={car.id}
                    onClick={() => handleSelectCar(car)}
                    className="p-3 cursor-pointer hover:bg-blue-50 border-b border-gray-100 transition duration-100"
                  >
                    <p className="font-semibold text-gray-800">{car.plate} - {car.make} {car.model}</p>
                    <p className="text-xs text-gray-500">Dueño: {car.ownerName}</p>
                  </li>
                ))}
              </ul>
            )}
            {searchTerm.length >= 3 && !searchLoading && searchResults.length === 0 && (
                <p className="mt-2 text-sm text-red-500">No se encontraron vehículos. Regístrelo primero.</p>
            )}
          </div>
        )}
      </section>

      {/* SECCIÓN 2: DETALLES DE LA INTERVENCIÓN Y KILOMETRAJE */}
      <section>
        <h2 className="text-2xl font-semibold text-blue-600 mb-4">
          2. Detalle de la Orden
        </h2>
        
        {/* Campo Kilometraje (NUEVO) */}
        <div className="mb-6 max-w-sm">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kilometraje Actual (KM)
              <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={mileageKm}
              onChange={(e) => setMileageKm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ej: 85000"
              required
            />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Descripción (problemaDescription -> description) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción del Problema (Reporte del Cliente)
              <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ej: Hace un ruido en la rueda delantera derecha al frenar."
              required
            />
          </div>

          {/* Notas (initialEstimate -> notes) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas Internas / Estimación Inicial
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ej: Chequear pastillas de freno y rodamiento. Tiempo estimado: 4h."
            />
          </div>
        </div>
      </section>

      {/* Mensaje de Error y Botón de Envío (igual) */}
      {error && (
        <div className="p-3 text-sm font-medium text-red-700 bg-red-100 border border-red-300 rounded-md">
          {error}
        </div>
      )}
      
      <div>
        <button
          type="submit"
          disabled={formLoading || !selectedCar}
          className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-lg hover:bg-blue-700 disabled:opacity-50 transition duration-150"
        >
          {formLoading ? 'Abriendo OT...' : 'Abrir Orden de Trabajo'}
        </button>
      </div>
    </form>
  );
}