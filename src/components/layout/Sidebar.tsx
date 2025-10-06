// app/components/layout/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { Car, FileText, Settings, Users, User, LogOut, Home, User2, History, LucideProps } from 'lucide-react'; // <-- AÑADIR 'History' para el icono
import { ForwardRefExoticComponent, RefAttributes } from 'react';

interface LinkItem {
  name: string
  href: string
  icon: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>, // Icono de historial o flecha
  isExternal?: boolean // Flag para identificar que es un enlace externo
}

// Mapeo de ítems de navegación con Lucide-React Icons
const baseNavItems: LinkItem[] = [
  { name: 'Inicio', href: '/dashboard', icon: Home },
  { name: 'Vehículos', href: '/dashboard/cars', icon: Car },
  { name: 'Órdenes de Trabajo', href: '/dashboard/interventions', icon: Settings },
  { name: 'Clientes', href: '/dashboard/clients', icon: Users },

  // Los ítems 'Mi Perfil' y 'Usuarios' se añadirán condicionalmente
];

// 🚨 NUEVO ITEM DE ENLACE EXTERNO
const externalNavItems = [
  {
    name: 'Historial Anterior',
    href: 'https://historial.mecnobile.com.ar',
    icon: History, // Icono de historial o flecha
    isExternal: true // Flag para identificar que es un enlace externo
  }
];
// ------------------------------------

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  // 1. Crear la lista de ítems de navegación final
  // 🚨 COMBINAR la navegación base y la externa
  let navItems = [...baseNavItems, ...externalNavItems];

  // 2. Agregar 'Mi Perfil' al final para todos
  navItems.push({ name: 'Mi Perfil', href: '/dashboard/profile', icon: User });

  // 3. Agregar 'Usuarios' solo para el ADMIN
  const isAdmin = session?.user?.role === 'ADMIN';
  if (isAdmin) {
    navItems.push({ name: 'Usuarios', href: '/dashboard/users', icon: User2 });
  }


  return (
    <div className="flex flex-col w-64 bg-gray-800 text-white h-full fixed top-0 left-0">

      {/* ... (Encabezado y Info de Usuario sin cambios) ... */}
      <div className="p-4 text-2xl font-extrabold border-b border-gray-700">
        Nóbile, Tecnología
      </div>

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

          const Icon = item.icon;

          // 🚨 Lógica para manejar enlaces externos (<a>) vs. enlaces internos (Next Link)
          if (item.isExternal) {
            return (
              <a
                key={item.name}
                href={item.href}
                target="_blank" // Abre en una nueva pestaña
                rel="noopener noreferrer" // Mejora la seguridad
                className={`flex items-center p-3 rounded-lg transition duration-150 ease-in-out 
                  text-gray-300 hover:bg-red-800 hover:text-white border-2 border-red-500 hover:border-red-500
                `}
              >
                <Icon className="w-5 h-5 mr-3" />
                <span className="font-medium">{item.name}</span>
              </a>
            );
          }

          // Lógica para enlaces internos de Next.js
          return (
            <Link
              key={item.name} href={item.href}
              className={`flex items-center p-3 rounded-lg transition duration-150 ease-in-out ${isActive
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
            >
              <Icon className="w-5 h-5 mr-3" />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Pie de página/Logout */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={() => signOut({
            callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL || window.location.origin}/login`
          })}
          className="w-full text-left p-3 rounded-lg text-red-400 hover:bg-gray-700 hover:text-red-300 transition duration-150 ease-in-out flex items-center"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
}