// auth.ts (o auth.js)
import type { AuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import prisma from "../lib/prisma";
import bcrypt from "bcrypt";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { DefaultSession, DefaultUser } from "@auth/core/types";
import { DefaultJWT } from "@auth/core/jwt";

// Define el tipo Role según tu enum de Prisma
type RoleType = "ADMIN" | "MECHANIC" | "VIEWER";

// 1. Extender la Interfaz de la Sesión
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: RoleType;
    } & DefaultSession["user"];
  }

  // 2. Extender la Interfaz del Usuario (lo que devuelve `authorize`)
  interface User extends DefaultUser {
    id: string;
    role: RoleType;
  }
}

// 3. Extender la Interfaz del Token JWT
declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: RoleType;
  }
}

export const authOptions: AuthOptions = {
  // 1. Adaptador de Prisma: Conecta Auth.js con tus modelos
  adapter: PrismaAdapter(prisma) as any,

  // 2. Proveedores: Usamos Credenciales para Usuario/Contraseña
  providers: [
    Credentials({
      name: "Taller Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }
        
        // Buscar usuario y el hash de la contraseña
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        // 1. Usuario no encontrado o no tiene un hash (no se creó por Credentials)
        if (!user || !user.passwordHash) {
          return null;
        }

        // 2. Comparar la contraseña ingresada con el hash de la DB


        const passwordMatch = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (passwordMatch) {
          // Retornamos el objeto User, incluyendo el ID y el Rol
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role // Importante para la autorización
          };
        }

        return null;
      }
    })
  ],

  // 3. Sesión y JWT
  session: {
    strategy: "jwt",
  },

  // 4. Callbacks: Inyectamos el rol del usuario en el token y la sesión
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.role) {
        // Sincronizamos el rol y la ID del token con la sesión del usuario
        session.user.role = token.role as any; // Usamos 'any' si no configuramos el type de Role en Prisma
        session.user.id = token.id;
      }
      return session;
    }
  },

  // 5. Páginas personalizadas (ej. /login)
  pages: {
    signIn: "/login",
    error: "/auth/error"
  },

  // 6. Configuración de seguridad
  secret: process.env.NEXTAUTH_SECRET,
};