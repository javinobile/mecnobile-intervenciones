'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  Car, Users, User, LogOut, Home, User2, History,
  LucideProps, Menu, X, Wrench, PlusCircle, Cog
} from 'lucide-react';
import { ForwardRefExoticComponent, RefAttributes, useState } from 'react';

interface LinkItem {
  name: string
  href: string
  icon: ForwardRefExoticComponent<Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>>,
  isExternal?: boolean
  adminOnly?: boolean
  mechanicHideMasters?: boolean
}

const baseNavItems: LinkItem[] = [
  { name: 'Inicio', href: '/dashboard', icon: Home },
  { name: 'Vehículos', href: '/dashboard/cars', icon: Car, adminOnly: true },
  { name: 'Clientes', href: '/dashboard/clients', icon: Users, adminOnly: true },
  { name: 'Órdenes de Trabajo', href: '/dashboard/interventions', icon: Wrench },
  { name: 'Abrir OT', href: '/dashboard/interventions/new', icon: PlusCircle },
  { name: 'Configuración', href: '/dashboard/settings', icon: Cog, adminOnly: true },
];

const externalNavItems: LinkItem[] = [
  {
    name: 'Historial Anterior',
    href: 'https://historial.mecnobile.com.ar',
    icon: History,
    isExternal: true,
  }
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const isAdmin = session?.user?.role === 'ADMIN';

  let navItems: LinkItem[] = [
    ...baseNavItems.filter((item) => !item.adminOnly || isAdmin),
    ...externalNavItems,
    { name: 'Mi Perfil', href: '/dashboard/profile', icon: User },
  ];

  if (isAdmin) {
    navItems.push({ name: 'Usuarios', href: '/dashboard/users', icon: User2 });
  }

  // Solo se resalta la ruta más específica que coincide, así "Abrir OT"
  // no enciende también "Órdenes de Trabajo".
  const activeHref = navItems
    .filter((item) => !item.isExternal)
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
    .reduce<string | null>(
      (best, item) => (best === null || item.href.length > best.length ? item.href : best),
      null
    );

  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <>
      <button
        className="fixed top-3 left-3 z-50 p-2.5 min-h-11 min-w-11 rounded-md bg-blue-600 text-white lg:hidden shadow-md flex items-center justify-center"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        aria-label="Toggle Sidebar"
      >
        {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={closeSidebar}
        ></div>
      )}

      <div
        className={`flex flex-col w-56 bg-gray-800 text-white h-full fixed top-0 left-0 z-40
          transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:flex
        `}
      >
        <div className="px-3 py-3 text-lg font-bold border-b border-gray-700 tracking-tight">
          Nóbile
        </div>

        <div className="px-3 py-2.5 border-b border-gray-700">
          <p className="text-sm font-semibold truncate">{session?.user?.name || 'Cargando...'}</p>
          <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
          <p className="text-[11px] mt-0.5 font-semibold text-yellow-300">{session?.user?.role}</p>
        </div>

        <nav className="flex-grow px-2 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = !item.isExternal && item.href === activeHref;

            const Icon = item.icon;

            if (item.isExternal) {
              return (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={closeSidebar}
                  className="flex items-center px-2.5 py-2.5 min-h-11 rounded-md text-sm transition duration-150
                    text-gray-300 hover:bg-red-800 hover:text-white border border-red-500/80"
                >
                  <Icon className="w-4 h-4 mr-2.5 shrink-0" />
                  <span className="font-medium">{item.name}</span>
                </a>
              );
            }

            return (
              <Link
                key={item.name} href={item.href}
                onClick={closeSidebar}
                className={`flex items-center px-2.5 py-2.5 min-h-11 rounded-md text-sm transition duration-150 ${isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
              >
                <Icon className="w-4 h-4 mr-2.5 shrink-0" />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-2 py-2 border-t border-gray-700">
          <button
            onClick={() => signOut({
              callbackUrl: `/`
            })}
            className="w-full text-left px-2.5 py-2.5 min-h-11 rounded-md text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition duration-150 flex items-center"
          >
            <LogOut className="w-4 h-4 mr-2.5" />
            Cerrar Sesión
          </button>
        </div>
      </div>
    </>
  );
}
