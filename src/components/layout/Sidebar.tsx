// app/components/layout/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react'; // <-- AGREGAMOS useSession
import { Car, FileText, Settings, Users, User, LogOut, Home, User2 } from 'lucide-react'; // <-- Usando iconos de Lucide-React (Recomendado)

// Mapeo de ítems de navegación con Lucide-React Icons
const baseNavItems = [
  { name: 'Inicio', href: '/dashboard', icon: Home },
  { name: 'Vehículos', href: '/dashboard/cars', icon: Car },
  { name: 'Órdenes de Trabajo', href: '/dashboard/interventions', icon: Settings },
  { name: 'Clientes', href: '/dashboard/clients', icon: Users },
  // Los ítems 'Mi Perfil' y 'Usuarios' se añadirán condicionalmente
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession(); // <-- OBTENEMOS LA SESIÓN
  
  // 1. Crear la lista de ítems de navegación final
  let navItems = [...baseNavItems];

  // 2. Agregar 'Mi Perfil' al final para todos
  navItems.push({ name: 'Mi Perfil', href: '/dashboard/profile', icon: User }); // <-- NUEVO ENLACE

  // 3. Agregar 'Usuarios' solo para el ADMIN
  const isAdmin = session?.user?.role === 'ADMIN';
  if (isAdmin) {
      navItems.push({ name: 'Usuarios', href: '/dashboard/users', icon: User2 }); // <-- ACCESO CONDICIONAL
  }


  return (
    <div className="flex flex-col w-64 bg-gray-800 text-white h-full fixed top-0 left-0">

      {/* Encabezado del Taller */}
      <div className="p-4 text-2xl font-extrabold border-b border-gray-700">
        Nóbile, Tecnología
      </div>

      {/* Info de Usuario (Opcional, pero útil para MVP) */}
      <div className="p-4 border-b border-gray-700">
        <p className="text-sm font-semibold">{session?.user?.name || 'Cargando...'}</p>
        <p className="text-xs text-gray-400">{session?.user?.email}</p>
        <p className="text-xs mt-1 font-bold text-yellow-300">{session?.user?.role}</p>
      </div>

      {/* Navegación Principal */}
      <nav className="flex-grow p-4 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href) && item.href !== '/dashboard' 
            ? true 
            : pathname === item.href;
          
          const Icon = item.icon; // Componente de Lucide

          return (
            <Link
              key={item.name} href={item.href}
              className={`flex items-center p-3 rounded-lg transition duration-150 ease-in-out ${isActive
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
            >
              {/* Reemplazamos el emoji por el componente Lucide */}
              <Icon className="w-5 h-5 mr-3" />
              <span className="font-medium">{item.name}</span>
            </Link>

          );
        })}
      </nav>

      {/* Pie de página/Logout */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full text-left p-3 rounded-lg text-red-400 hover:bg-gray-700 hover:text-red-300 transition duration-150 ease-in-out flex items-center"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
}