// app/dashboard/cars/new/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewCarPage() {
  const router = useRouter();
  
  // 1. Estado para el Cliente (dueño)
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');

  // 2. Estado para el Vehículo
  const [plate, setPlate] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [km, setKm] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // En un proyecto real, aquí harías una petición POST a /api/cars/new
    // que se encargaría de:
    // 1. Buscar/Crear el Cliente (si no existe un cliente con ese email).
    // 2. Crear el Vehículo, vinculándolo al ID del Cliente.
    
    try {
        // Simulación:
        console.log("Registrando nuevo cliente y vehículo...");

        // Aquí iría la llamada a la API
        // const response = await fetch('/api/cars', { ... }); 
        // if (!response.ok) throw new Error('Error al registrar.');

        await new Promise(resolve => setTimeout(resolve, 1500)); // Simular delay
        
        alert('Vehículo y Cliente registrados con éxito (simulación).');
        router.push('/dashboard/cars');

    } catch (err: any) {
        setError(err.message || "Ocurrió un error desconocido al registrar.");
    } finally {
        setLoading(false);
    }
  };

  return (
      <main className="flex-grow p-8 ml-64 bg-gray-50">
        
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Registro de Nuevo Vehículo
        </h1>

        <form onSubmit={handleSubmit} className="space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-200">
          
          {/* SECCIÓN 1: DATOS DEL PROPIETARIO (CLIENTE) */}
          <section className="border-b border-gray-200 pb-6">
            <h2 className="text-2xl font-semibold text-blue-600 mb-4">
              1. Datos del Propietario (Cliente)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <InputField label="Nombre Completo" value={ownerName} onChange={setOwnerName} required />
              <InputField label="Teléfono" value={ownerPhone} onChange={setOwnerPhone} type="tel" required />
              <InputField label="Email" value={ownerEmail} onChange={setOwnerEmail} type="email" required />
            </div>
          </section>

          {/* SECCIÓN 2: DATOS DEL VEHÍCULO */}
          <section>
            <h2 className="text-2xl font-semibold text-blue-600 mb-4">
              2. Datos del Automóvil
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <InputField label="Matrícula/Placa" value={plate} onChange={setPlate} required />
              <InputField label="Marca" value={make} onChange={setMake} required />
              <InputField label="Modelo" value={model} onChange={setModel} required />
              <InputField label="Año" value={year} onChange={setYear} type="number" required />
              <InputField label="Color" value={color} onChange={setColor} />
              <InputField label="Kilometraje (KM)" value={km} onChange={setKm} type="number" />
            </div>
          </section>

          {/* Mensaje de Error */}
          {error && (
            <div className="p-3 text-sm font-medium text-red-700 bg-red-100 border border-red-300 rounded-md">
              {error}
            </div>
          )}
          
          {/* Botón de Envío */}
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

// Componente utilitario de campo de entrada simple
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
            className="block w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
    </div>
);