import NextAuth from "next-auth";
// Importa la configuración completa desde tu archivo central
import { authOptions } from "@/auth";

// Inicializa el handler de Auth.js con la configuración
const handler = NextAuth(authOptions);

// Exporta el handler para las peticiones GET y POST
// Next.js usará estas funciones para manejar el login, logout, etc.
export { handler as GET, handler as POST };