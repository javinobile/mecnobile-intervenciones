// app/dashboard/clients/[id]/CarAssignmentForm.tsx
'use client';

import { useState } from 'react';
import { getCarsForSearch } from '@/actions/car.actions'; // Importamos la acción de búsqueda existente
import { assignCarToClient } from '@/actions/client.actions';
import { Search, CheckCircle, XCircle } from 'lucide-react';

interface CarSearchResult {
    id: string;
    plate: string;
    make: string;
    model: string;
    ownerName: string; 
}

export default function CarAssignmentForm({ clientId }: { clientId: string }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<CarSearchResult[]>([]);
    const [selectedCar, setSelectedCar] = useState<CarSearchResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (searchTerm.trim().length < 3) return;
        setLoading(true);
        setSelectedCar(null);
        setMessage(null);

        const results = await getCarsForSearch(searchTerm);
        setSearchResults(results);
        setLoading(false);
    };

    const handleAssignCar = async () => {
        if (!selectedCar) return;
        setLoading(true);
        setMessage(null);

        const result = await assignCarToClient(clientId, selectedCar.id);
        
        if (result.success) {
            setMessage({ type: 'success', text: result.message });
            // Forzar recarga de la página para ver el cambio de propiedad
            window.location.reload(); 
        } else {
            setMessage({ type: 'error', text: result.message });
        }

        setLoading(false);
    };

    return (
        <div className="space-y-4">
            {/* Formulario de Búsqueda */}
            <form onSubmit={handleSearch} className="flex space-x-2">
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Matrícula, Marca o Modelo..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    disabled={loading}
                />
                <button
                    type="submit"
                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    disabled={loading || searchTerm.trim().length < 3}
                >
                    <Search className="w-5 h-5" />
                </button>
            </form>

            {/* Resultados de Búsqueda */}
            <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-2 space-y-1">
                {loading && <p className="text-sm text-gray-500">Buscando...</p>}
                
                {!loading && searchResults.length > 0 && searchResults.map(car => (
                    <div 
                        key={car.id} 
                        className={`p-2 rounded-lg cursor-pointer transition flex justify-between items-center ${selectedCar?.id === car.id ? 'bg-indigo-100 border-indigo-500 border-2' : 'hover:bg-gray-50 border border-transparent'}`}
                        onClick={() => setSelectedCar(car)}
                    >
                        <div>
                            <p className="font-semibold text-sm">{car.plate} - {car.make} {car.model}</p>
                            <p className="text-xs text-gray-500">Dueño actual: {car.ownerName}</p>
                        </div>
                        {selectedCar?.id === car.id && <CheckCircle className="w-4 h-4 text-indigo-600" />}
                    </div>
                ))}

                {!loading && searchTerm.trim().length >= 3 && searchResults.length === 0 && (
                    <p className="text-sm text-gray-500">No se encontraron vehículos.</p>
                )}
            </div>

            {/* Coche Seleccionado y Botón de Asignación */}
            {selectedCar && (
                <div className="pt-2 border-t border-gray-200">
                    <p className="text-sm font-medium mb-2">Vehículo a asignar:</p>
                    <p className="font-bold text-lg text-green-700">{selectedCar.plate}</p>
                    <p className="text-sm text-gray-600">Propietario anterior: {selectedCar.ownerName}</p>

                    <button
                        onClick={handleAssignCar}
                        className="mt-3 w-full px-4 py-2 bg-purple-600 text-white font-medium rounded-lg shadow-md hover:bg-purple-700 disabled:opacity-50 transition"
                        disabled={loading}
                    >
                        {loading ? 'Asignando...' : `Confirmar Asignación a ${selectedCar.plate}`}
                    </button>
                </div>
            )}
            
            {/* Mensajes */}
            {message && (
                <div className={`p-3 text-sm font-medium rounded-md flex items-center ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {message.type === 'success' ? <CheckCircle className="w-4 h-4 mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                    {message.text}
                </div>
            )}
        </div>
    );
}