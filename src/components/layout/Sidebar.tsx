// app/components/layout/Sidebar.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: '🏠' },
  { name: 'Automóviles', href: '/dashboard/cars', icon: '🚗' },
  { name: 'Intervenciones', href: '/dashboard/interventions', icon: '🔧' },
  { name: 'Clientes', href: '/dashboard/clients', icon: '👥' },
  { name: 'Usuarios', href: '/dashboard/users', icon: '🛠️' }, // Solo para ADMIN
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col w-64 bg-gray-800 text-white h-full fixed top-0 left-0">
      
      {/* Encabezado del Taller */}
      <div className="p-4 text-2xl font-extrabold border-b border-gray-700">
        Nóbile, Tecnología
      </div>

      {/* Navegación Principal */}
      <nav className="flex-grow p-4 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.name} href={item.href} legacyBehavior>
              <a 
                className={`flex items-center p-3 rounded-lg transition duration-150 ease-in-out ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <span className="mr-3 text-lg">{item.icon}</span>
                <span className="font-medium">{item.name}</span>
              </a>
            </Link>
          );
        })}
      </nav>

      {/* Pie de página/Logout */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full text-left p-3 rounded-lg text-red-400 hover:bg-gray-700 transition duration-150 ease-in-out"
        >
          <span className="mr-3">🚪</span> Cerrar Sesión
        </button>
      </div>
    </div>
  );
}