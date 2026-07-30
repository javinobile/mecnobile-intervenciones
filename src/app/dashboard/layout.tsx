// app/(dashboard)/layout.tsx
// Este layout se aplicará a todas las rutas dentro de /app/(dashboard)
// Por ejemplo: /dashboard, /dashboard/cars, /dashboard/interventions, etc.

import { getServerSession } from "next-auth"; // Usaremos esto para futuras comprobaciones de servidor
import { authOptions } from "@/auth"; // Asume que exportas authOptions desde aquí
import { redirect } from 'next/navigation';
import Sidebar from "@/components/layout/Sidebar";

export default async function DashboardLayout({
  children, // El contenido de la página actual (/dashboard/page.tsx, /cars/page.tsx, etc.)
}: {
  children: React.ReactNode;
}) {
  // Nota: Aunque ya tenemos middleware para protección,
  // la obtención de la sesión en el layout es útil para el SSR y la personalización.
  const session = await getServerSession(authOptions);

  // Redirección del lado del servidor si no hay sesión (redundante con middleware, pero robusto)
  if (!session) {
    redirect('/login');
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />

      <main className="flex-grow p-4 lg:p-6 mt-12 lg:mt-0 lg:ml-56 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}