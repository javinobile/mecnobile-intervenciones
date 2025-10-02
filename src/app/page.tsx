// app/page.tsx
'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Componente para la página raíz
export default function HomePage() {
  // 1. Obtener el estado de la sesión
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Solo actuamos cuando la sesión termina de cargar
    if (status !== 'loading') {
      if (session) {
        // 2. Si hay sesión, redirigir al Dashboard
        router.push('/dashboard');
      } else {
        // 3. Si no hay sesión, redirigir al Login
        router.push('/login');
      }
    }
  }, [status, session, router]);

  // Mientras carga la sesión, mostramos un estado simple
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-xl font-semibold text-gray-600 flex items-center space-x-2">
        <svg 
          className="animate-spin h-5 w-5 text-blue-500" 
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24"
        >
          <circle 
            className="opacity-25" 
            cx="12" 
            cy="12" 
            r="10" 
            stroke="currentColor" 
            strokeWidth="4"
          ></circle>
          <path 
            className="opacity-75" 
            fill="currentColor" 
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <span>Verificando sesión...</span>
      </div>
    </div>
  );
}