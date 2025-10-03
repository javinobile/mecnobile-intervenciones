// ------------------------------------------------------------------
// COMPONENTES AUXILIARES DE CLIENTE (Manejan la URL de forma interactiva)
// NOTA: Se recomienda extraer estos componentes a un archivo aparte (ej: client-interaction.tsx)
// Si ya tienes un archivo de interacción de cliente, úsalo, sino, déjalo aquí con 'use client'.
// ------------------------------------------------------------------

// Usamos los mismos componentes de cliente que creamos en el paso anterior (SearchForm y PaginationLink)
// Para que esto funcione, DEBES haber extraído esos componentes a un archivo con 'use client'. 
// Para simplificar, los incluyo aquí con la directiva 'use client' forzada:

'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ClientListItem, getClientsPage } from '@/actions/client.actions';
import { Search } from 'lucide-react';

export default function SearchForm({ initialQuery }: { initialQuery: string }) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const q = formData.get('q') as string;

        const params = new URLSearchParams(searchParams.toString());
        if (q.trim() === '') {
            params.delete('q');
        } else {
            params.set('q', q.trim());
        }
        params.set('page', '1');

        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <form onSubmit={handleSubmit} className="flex items-center space-x-3 w-full max-w-md">
            <input
                type="text"
                name="q"
                placeholder="Buscar por Nombre, DNI, Teléfono o Email..."
                defaultValue={initialQuery}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 transition duration-150 text-gray-800"
            />
            <button
                type="submit"
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-150"
            >
                <Search className="w-5 h-5" />
            </button>
        </form>
    );
}