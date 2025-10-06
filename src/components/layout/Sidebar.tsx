'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { Car, FileText, Settings, Users, User, LogOut, Home, User2, History, LucideProps, Menu, X } from 'lucide-react'; // <-- ¡IMPORTANTE! Añadir 'Menu' y 'X'
import { ForwardRefExoticComponent, RefAttributes, useState } from 'react'; // <-- ¡IMPORTANTE! Añadir 'useState'

interface LinkItem {
  name: string
  href: string
  icon: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>,
  isExternal?: boolean
}

// ... (baseNavItems y externalNavItems se mantienen iguales) ...
const baseNavItems: LinkItem[] = [
  { name: 'Inicio', href: '/dashboard', icon: Home },
  { name: 'Vehículos', href: '/dashboard/cars', icon: Car },
  { name: 'Clientes', href: '/dashboard/clients', icon: Users },
  { name: 'Órdenes de Trabajo', href: '/dashboard/interventions', icon: Settings },
];

const externalNavItems = [
  {
    name: 'Historial Anterior',
    href: 'https://historial.mecnobile.com.ar',
    icon: History,
    isExternal: true
  }
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  
  // 🚨 1. Estado para controlar la apertura/cierre en móviles
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 

  // ... (Lógica para construir navItems se mantiene igual) ...
  let navItems = [...baseNavItems, ...externalNavItems];
  navItems.push({ name: 'Mi Perfil', href: '/dashboard/profile', icon: User });
  const isAdmin = session?.user?.role === 'ADMIN';
  if (isAdmin) {
    navItems.push({ name: 'Usuarios', href: '/dashboard/users', icon: User2 });
  }

  // Función para cerrar el sidebar (útil al navegar en móvil)
  const closeSidebar = () => setIsSidebarOpen(false);


  return (
    <>
      {/* 🚨 2. Botón de Menú para MÓVILES (fuera del sidebar) */}
      {/* Es visible solo en pantallas pequeñas (< lg) */}
      <button
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-blue-600 text-white lg:hidden shadow-lg"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        aria-label="Toggle Sidebar"
      >
        {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* 🚨 3. Overlay oscuro para MÓVILES (cuando el menú está abierto) */}
      {/* Solo visible en móviles y cuando el sidebar está abierto */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black opacity-50 z-30 lg:hidden"
          onClick={closeSidebar} // Cierra el sidebar al hacer clic en el overlay
        ></div>
      )}

      {/* 🚨 4. Sidebar Principal: Clases Responsivas Clave */}
      <div 
        // El sidebar se posiciona fijo. En móviles (< lg) se oculta con 'hidden'
        // y se muestra con un estado dinámico si está abierto.
        className={`flex flex-col w-64 bg-gray-800 text-white h-full fixed top-0 left-0 z-40
          transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
          lg:translate-x-0 lg:flex
        `}
      >

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
        <nav className="flex-grow p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href) && item.href !== '/dashboard'
              ? true
              : pathname === item.href;

            const Icon = item.icon;

            // Lógica para manejar enlaces externos (<a>) vs. enlaces internos (Next Link)
            if (item.isExternal) {
              return (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={closeSidebar} // 🚨 Cierra el sidebar al hacer clic en móvil
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
                onClick={closeSidebar} // 🚨 Cierra el sidebar al hacer clic en móvil
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
              callbackUrl: `/`
            })}
            className="w-full text-left p-3 rounded-lg text-red-400 hover:bg-gray-700 hover:text-red-300 transition duration-150 ease-in-out flex items-center"
          >
            <LogOut className="w-5 h-5 mr-3" />
            Cerrar Sesión
          </button>
        </div>
      </div>
    </>
  );
}