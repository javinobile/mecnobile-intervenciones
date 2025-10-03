// app/dashboard/cars/new/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle, Car as CarIcon, User } from 'lucide-react';
import { createClientAndCar } from '@/actions/car.actions';

export default function NewCarPage() {
  const router = useRouter();

  // 1. Estado para el Cliente (dueño)
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerDni, setOwnerDni] = useState('');

  // 2. Estado para el Vehículo (ACTUALIZADO: Añadimos VIN)
  const [plate, setPlate] = useState('');
  const [vin, setVin] = useState(''); // ¡NUEVO ESTADO VIN!
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [km, setKm] = useState('');

  // ... (Estados de loading, error, success) ...
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const formData = {
      ownerName, ownerPhone, ownerEmail, ownerDni,
      plate, vin, make, model, year, color, km, // ¡AÑADIDO VIN!
    };

    // Llamada a la Server Action
    const result = await createClientAndCar(formData);

    // ... (Manejo de resultado) ...
    if (result.success) {
      setSuccess(result.message);

      setTimeout(() => {
        router.push(`/dashboard/cars/${result.carId}`);
      }, 1500);

    } else {
      setError(result.message);
    }

    setLoading(false);
  };

  return (
    <main className="flex-grow p-8 ml-64 bg-gray-50">

      {/* ... (Encabezados y Sección 1: Propietario) ... */}

      <form onSubmit={handleSubmit} className="space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-200 max-w-4xl mx-auto">

        <section className="border-b border-gray-200 pb-6">
          <h2 className="text-2xl font-semibold text-blue-600 mb-4 flex items-center">
            <User className="w-5 h-5 mr-2" />
            1. Datos del Propietario (Cliente)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <InputField label="Nombre Completo" value={ownerName} onChange={setOwnerName} required />
            <InputField label="DNI / CUIT" value={ownerDni} onChange={setOwnerDni} required />
            <InputField label="Teléfono" value={ownerPhone} onChange={setOwnerPhone} type="tel" required />
            <InputField label="Email" value={ownerEmail} onChange={setOwnerEmail} type="email" />
          </div>
          <p className="text-sm text-gray-500 mt-2">
            *El sistema buscará al cliente por DNI o por Email.
          </p>
        </section>

        {/* SECCIÓN 2: DATOS DEL VEHÍCULO (ACTUALIZADO) */}
        <section>
          <h2 className="text-2xl font-semibold text-blue-600 mb-4 flex items-center">
            <CarIcon className="w-5 h-5 mr-2" />
            2. Datos del Automóvil
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <InputField label="Matrícula/Placa" value={plate} onChange={setPlate} required />
            <InputField label="VIN (N° de Chasis)" value={vin} onChange={setVin} required /> {/* ¡NUEVO CAMPO VIN! */}
            <InputField label="Marca" value={make} onChange={setMake} required />
            <InputField label="Modelo" value={model} onChange={setModel} required />
            <InputField label="Año" value={year} onChange={setYear} type="number" required />
            <InputField label="Color" value={color} onChange={setColor} />
            <InputField label="Kilometraje Inicial (KM)" value={km} onChange={setKm} type="number" required />
          </div>
          <p className="text-sm text-gray-500 mt-2">
            *El sistema chequeará la unicidad del vehículo por **Matrícula** y **VIN**.
          </p>
        </section>

        {/* ... (Mensajes de error y botón de envío) ... */}
        {error && (
          <div className="p-3 text-sm font-medium text-red-700 bg-red-100 border border-red-300 rounded-md">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 text-sm font-medium text-green-700 bg-green-100 border border-green-300 rounded-md">
            {success} Redireccionando al detalle...
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 disabled:opacity-50 transition duration-150"
          >
            {loading ? 'Guardando...' : 'Registrar Vehículo y Cliente'}
          </button>
        </div>
      </form>
    </main>
  );
}

// ... (Componente InputField) ...
const InputField = ({ label, value, onChange, type = 'text', required = false }: any) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className="block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-800"
    />
  </div>
);