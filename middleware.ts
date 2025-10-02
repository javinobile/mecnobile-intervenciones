// middleware.ts
import { withAuth, NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Define un mapa de autorización: qué roles pueden acceder a qué rutas
const authorizedRoutes = {
  // Las rutas de Dashboard requieren al menos ser MECHANIC o ADMIN
  '/dashboard': ['ADMIN', 'MECHANIC', 'VIEWER'],
  '/dashboard/cars': ['ADMIN', 'MECHANIC', 'VIEWER'],
  '/dashboard/interventions': ['ADMIN', 'MECHANIC', 'VIEWER'],
  '/dashboard/clients': ['ADMIN', 'MECHANIC', 'VIEWER'],
  
  // Rutas exclusivas para ADMIN
  '/dashboard/users': ['ADMIN'],
};

export default withAuth(
  // Función principal de middleware (se ejecuta DESPUÉS de la autenticación)
  function middleware(request: NextRequestWithAuth) {
    const { pathname } = request.nextUrl;
    const token = request.nextauth.token;
    
    // Obtener el rol del usuario (lo inyectamos en el JWT en el callback)
    const userRole = token?.role;

    // 1. Lógica de Redirección para el Login (si intenta ir a /login y ya está logueado)
    if (pathname === '/login' && token) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    
    // 2. Lógica de Autorización Basada en Rol
    // Verificar si la ruta requiere autorización y si el usuario tiene el rol permitido
    const requiredRoles = authorizedRoutes[pathname as keyof typeof authorizedRoutes];

    if (requiredRoles && userRole && !requiredRoles.includes(userRole)) {
      // Si la ruta requiere un rol específico y el usuario no lo tiene
      return NextResponse.rewrite(new URL('/denied', request.url)); // Puedes crear una página /denied
    }
    
    // Continuar si todo está bien
    return NextResponse.next();
  },
  
  // Configuración de Auth.js para la autenticación (se ejecuta ANTES de la función middleware)
  {
    callbacks: {
      // Esta función se ejecuta antes de cualquier ruta protegida
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // Si la ruta es el login, no necesitamos token (queremos que todos puedan verlo)
        if (pathname === '/login') {
            return true;
        }

        // Si la ruta comienza con /dashboard, requerimos que haya un token
        if (pathname.startsWith('/dashboard')) {
            return !!token;
        }

        // Permitir acceso por defecto a rutas públicas (/, /favicon, etc.)
        return true;
      },
    },
    
    // Si la autenticación falla (no hay token para una ruta /dashboard), redirige aquí
    pages: {
        signIn: '/login',
    }
  }
);