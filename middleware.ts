// middleware.ts
import { withAuth, NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

type Role = 'ADMIN' | 'MECHANIC' | 'VIEWER';

/** Prefijo de ruta → roles permitidos. Más específico primero. */
const routeRules: { prefix: string; roles: Role[] }[] = [
  { prefix: '/dashboard/users', roles: ['ADMIN'] },
  { prefix: '/dashboard/settings', roles: ['ADMIN'] },
  { prefix: '/dashboard/cars', roles: ['ADMIN'] },
  { prefix: '/dashboard/clients', roles: ['ADMIN'] },
  { prefix: '/dashboard/interventions', roles: ['ADMIN', 'MECHANIC', 'VIEWER'] },
  { prefix: '/dashboard/profile', roles: ['ADMIN', 'MECHANIC', 'VIEWER'] },
  { prefix: '/dashboard', roles: ['ADMIN', 'MECHANIC', 'VIEWER'] },
];

function rolesForPath(pathname: string): Role[] | null {
  const rule = routeRules.find((r) =>
    pathname === r.prefix || pathname.startsWith(r.prefix + '/')
  );
  return rule?.roles ?? null;
}

export default withAuth(
  function middleware(request: NextRequestWithAuth) {
    const { pathname } = request.nextUrl;
    const token = request.nextauth.token;

    if (pathname === '/login' && token) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    const userRole = token?.role as Role | undefined;
    const requiredRoles = rolesForPath(pathname);

    if (requiredRoles && userRole && !requiredRoles.includes(userRole)) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        if (pathname === '/login') return true;
        if (pathname.startsWith('/dashboard')) return !!token;
        return true;
      },
    },
    pages: {
      signIn: '/login',
    },
  }
);

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};
