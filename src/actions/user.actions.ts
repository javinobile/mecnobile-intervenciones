// app/actions/user.actions.ts
"use server";
import bcrypt from "bcrypt";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { revalidatePath } from "next/cache";
import prisma from "../../lib/prisma";

// Si usas bcrypt para hashear la contraseña:
// import bcrypt from 'bcryptjs'; 

// Definición de los datos que el usuario PUEDE modificar
export interface UpdateProfileData {
    name?: string;
    // La modificación del email es compleja, ya que requiere re-verificación
    // Por simplicidad en un MVP, la haremos opcional, asumiendo que el Auth handler la maneja o que lo re-validaremos.
    email?: string;

    // Si manejas password localmente y no solo con OAuth, descomenta:
    currentPassword?: string;
    newPassword?: string;
}

/**
 * Permite a un usuario autenticado actualizar su nombre y email.
 * NO permite cambiar el rol, ID o campos sensibles.
 */
/**
 * Permite a un usuario autenticado actualizar su nombre, email y/o contraseña.
 * NO permite cambiar el rol, ID o campos sensibles.
 */
export async function updateUserProfile(data: UpdateProfileData): Promise<{ success: boolean, message: string }> {

    const session = await getServerSession(authOptions);
    if (!session || !session.user.id) {
        return { success: false, message: 'Acceso denegado. Usuario no autenticado.' };
    }

    const userId = session.user.id;
    const updatePayload: any = {};

    // Obtenemos el usuario actual para la verificación de la contraseña
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true, email: true }
    });

    if (!user) {
        return { success: false, message: 'Usuario no encontrado.' };
    }

    // 1. Procesar el Nombre (name) (Sin cambios)
    if (data.name) {
        const trimmedName = data.name.trim();
        if (trimmedName.length > 1) {
            updatePayload.name = trimmedName;
        } else {
            return { success: false, message: 'El nombre es demasiado corto.' };
        }
    }

    // 2. Procesar el Email (Sin cambios en la lógica)
    if (data.email) {
        // ... (Lógica de validación de email y chequeo de duplicidad) ...
        const trimmedEmail = data.email.trim().toLowerCase();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
            return { success: false, message: 'El formato del email es inválido.' };
        }

        const existingUser = await prisma.user.findUnique({
            where: { email: trimmedEmail }
        });

        if (existingUser && existingUser.id !== userId) {
            return { success: false, message: 'Ese correo electrónico ya está en uso.' };
        }

        updatePayload.email = trimmedEmail;
    }

    // 3. Procesar Contraseña (NUEVA LÓGICA)
    if (data.newPassword) {
        if (!data.currentPassword) {
            return { success: false, message: 'Debe ingresar su contraseña actual para cambiarla.' };
        }

        // La contraseña debe existir en la DB para poder cambiarla
        if (!user.passwordHash) {
            return { success: false, message: 'Su cuenta no utiliza contraseña (posiblemente usa Google/OAuth). No se puede cambiar.' };
        }

        // 3a. Verificar la contraseña actual
        const isPasswordValid = await bcrypt.compare(data.currentPassword, user.passwordHash);

        if (!isPasswordValid) {
            return { success: false, message: 'Contraseña actual incorrecta.' };
        }

        // 3b. Validar la nueva contraseña
        if (data.newPassword.length < 6) {
            return { success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.' };
        }

        // 3c. Hashear la nueva contraseña
        updatePayload.passwordHash = await bcrypt.hash(data.newPassword, 10);
    }

    // Si no hay nada que actualizar, salimos
    if (Object.keys(updatePayload).length === 0) {
        return { success: true, message: 'No se encontraron cambios para guardar.' };
    }

    try {
        await prisma.user.update({
            where: { id: userId },
            data: updatePayload
        });

        revalidatePath('/dashboard/profile');

        return { success: true, message: 'Perfil actualizado con éxito. Si cambió el email o contraseña, deberá volver a iniciar sesión.' };

    } catch (error: any) {
        console.error("Error al actualizar el perfil del usuario:", error);
        return { success: false, message: 'Error interno al actualizar el perfil.' };
    }
}

// ====================================================================
// GESTIÓN DE USUARIOS (SÓLO ADMIN)
// ====================================================================

const USER_PAGE_SIZE = 10;

// Tipos para el listado de usuarios del Admin
export interface UserListItem {
    id: string;
    name: string | null;
    email: string;
    role: 'ADMIN' | 'MECHANIC' | 'VIEWER';
    createdAt: Date;
}

export interface UsersPageResult {
    users: UserListItem[];
    totalPages: number;
    currentPage: number;
}

/**
 * Obtiene una página de usuarios, con paginación y filtro. (Sólo ADMIN)
 */
export async function getUsersPage(page: number = 1, query: string = ''): Promise<UsersPageResult> {

    const session = await getServerSession(authOptions);
    // Verificación de seguridad: Solo ADMIN puede acceder
    if (!session || session.user.role !== 'ADMIN') {
        return { users: [], totalPages: 0, currentPage: 1 };
    }

    const offset = (page - 1) * USER_PAGE_SIZE;
    const search = query.trim();

    // Configuración del filtro de búsqueda
    const whereClause = search.length > 0 ? {
        OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
        ]
    } : {} as any;

    try {
        // 1. OBTENER EL TOTAL DE REGISTROS
        const totalCount = await prisma.user.count({ where: whereClause });
        const totalPages = Math.ceil(totalCount / USER_PAGE_SIZE);

        // 2. OBTENER LOS USUARIOS DE LA PÁGINA ACTUAL
        const users = await prisma.user.findMany({
            where: whereClause,
            take: USER_PAGE_SIZE,
            skip: offset,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });

        // 3. Mapear y formatear los resultados
        const formattedUsers: UserListItem[] = users.map(user => ({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
        }));

        return {
            users: formattedUsers,
            totalPages,
            currentPage: page,
        };

    } catch (error) {
        console.error("Error fetching users page:", error);
        return { users: [], totalPages: 0, currentPage: 1 };
    }
}

/**
 * Permite al Admin modificar el rol de otro usuario.
 */
export async function updateUserRole(targetUserId: string, newRole: 'ADMIN' | 'MECHANIC' | 'VIEWER'): Promise<{ success: boolean, message: string }> {

    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        return { success: false, message: 'Acceso denegado: Se requiere rol de Administrador.' };
    }

    // Un Admin no puede degradar o cambiar su propio rol (medida de seguridad)
    if (session.user.id === targetUserId) {
        return { success: false, message: 'Operación denegada: No puedes modificar tu propio rol.' };
    }

    // El rol debe ser uno de los definidos
    if (!['ADMIN', 'MECHANIC', 'VIEWER'].includes(newRole)) {
        return { success: false, message: 'Rol inválido.' };
    }

    try {
        await prisma.user.update({
            where: { id: targetUserId },
            data: { role: newRole }
        });

        // Revalidar el path para actualizar la tabla
        revalidatePath('/dashboard/users');

        return { success: true, message: `Rol actualizado a ${newRole} con éxito.` };

    } catch (error) {
        console.error("Error al actualizar el rol:", error);
        return { success: false, message: 'Error interno al actualizar el rol del usuario.' };
    }
}

/**
 * Permite al Admin eliminar un usuario.
 */
export async function deleteUser(targetUserId: string): Promise<{ success: boolean, message: string }> {

    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        return { success: false, message: 'Acceso denegado: Se requiere rol de Administrador.' };
    }

    // Un Admin no puede eliminarse a sí mismo (medida de seguridad)
    if (session.user.id === targetUserId) {
        return { success: false, message: 'Operación denegada: No puedes eliminar tu propia cuenta.' };
    }

    try {
        // La eliminación en cascada debería manejar las sesiones y cuentas (gracias a onDelete: Cascade)
        await prisma.user.delete({
            where: { id: targetUserId }
        });

        revalidatePath('/dashboard/users');

        return { success: true, message: 'Usuario eliminado con éxito.' };

    } catch (error: any) {
        console.error("Error al eliminar el usuario:", error);

        // Manejo de error si hay intervenciones asociadas (onDelete: Restrict)
        if (error.code === 'P2003') {
            return { success: false, message: 'No se puede eliminar: El usuario tiene Órdenes de Trabajo asociadas.' };
        }

        return { success: false, message: 'Error interno al eliminar el usuario.' };
    }
}

export interface CreateUserData {
    name: string;
    email: string;
    password: string;
    role: 'ADMIN' | 'MECHANIC' | 'VIEWER';
}

/**
 * Permite al Admin crear un nuevo usuario con una contraseña hasheada. (Sólo ADMIN)
 */
export async function createUser(data: CreateUserData): Promise<{ success: boolean, message: string }> {

    const session = await getServerSession(authOptions);
    // Verificación de seguridad: Solo ADMIN puede acceder
    if (!session || session.user.role !== 'ADMIN') {
        return { success: false, message: 'Acceso denegado: Se requiere rol de Administrador.' };
    }

    const { name, email, password, role } = data;

    // 1. Validación Básica
    if (!name || !email || !password || !role) {
        return { success: false, message: 'Faltan campos requeridos (nombre, email, contraseña, rol).' };
    }
    if (password.length < 6) {
        return { success: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
    }
    if (!['ADMIN', 'MECHANIC', 'VIEWER'].includes(role)) {
        return { success: false, message: 'Rol de usuario inválido.' };
    }

    try {
        // 2. Chequeo de duplicidad de Email
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return { success: false, message: 'Ya existe un usuario con ese correo electrónico.' };
        }

        // 3. Hashear la Contraseña
        const passwordHash = await bcrypt.hash(password, 10);

        // 4. Crear el Usuario
        await prisma.user.create({
            data: {
                name: name.trim(),
                email: email.trim().toLowerCase(),
                passwordHash: passwordHash,
                role: role,
                // Opcional: podrías setear emailVerified a una fecha si confías en la creación por Admin
            }
        });

        // 5. Revalidar la caché de la lista de usuarios
        revalidatePath('/dashboard/users');

        return { success: true, message: `Usuario ${name} creado con éxito como ${role}.` };

    } catch (error) {
        console.error("Error al crear usuario:", error);
        return { success: false, message: 'Error interno al crear el usuario.' };
    }
}