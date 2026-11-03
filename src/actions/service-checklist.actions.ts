'use server';

import prisma from '../../lib/prisma';
import { revalidatePath } from 'next/cache';
import { Prisma } from '../../generated/prisma';
import { requireAdmin, requireStaff } from '@/lib/auth-guards';

/**
 * Catálogo de puntos del checklist de service (SPEC 02).
 * Lo administra el ADMIN en Configuración; los puntos nunca se borran, solo se desactivan.
 */

export type ServiceChecklistItemDto = {
    id: string;
    name: string;
    sortOrder: number;
    active: boolean;
};

type ActionResult = { success: boolean; message: string };

const SETTINGS_PATH = '/dashboard/settings';
const NAME_MAX_LENGTH = 80;

function normalizeName(raw: string): string {
    return raw.trim().replace(/\s+/g, ' ');
}

function validateName(name: string): string | null {
    if (!name) return 'El nombre del punto es obligatorio.';
    if (name.length > NAME_MAX_LENGTH) return `El nombre no puede superar los ${NAME_MAX_LENGTH} caracteres.`;
    return null;
}

/** Busca otro punto con el mismo nombre, sin distinguir mayúsculas. */
async function findDuplicate(name: string, excludeId?: string) {
    return prisma.serviceChecklistItem.findFirst({
        where: {
            name: { equals: name, mode: 'insensitive' },
            ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { name: true },
    });
}

function duplicateMessage(existingName: string) {
    return `Ya existe un punto llamado "${existingName}".`;
}

function isUniqueViolation(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Lista el catálogo ordenado. ADMIN y MECHANIC lo necesitan para armar el checklist de la OT;
 * los inactivos solo se devuelven si se piden (pantalla de Configuración).
 */
export async function listServiceChecklistItems(
    opts: { includeInactive?: boolean } = {}
): Promise<ServiceChecklistItemDto[]> {
    const session = await requireStaff();
    if (!session) return [];

    return prisma.serviceChecklistItem.findMany({
        where: opts.includeInactive ? {} : { active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, sortOrder: true, active: true },
    });
}

export async function createServiceChecklistItem(rawName: string): Promise<ActionResult> {
    if (!(await requireAdmin())) return { success: false, message: 'Acceso denegado.' };

    const name = normalizeName(rawName ?? '');
    const invalid = validateName(name);
    if (invalid) return { success: false, message: invalid };

    const duplicate = await findDuplicate(name);
    if (duplicate) return { success: false, message: duplicateMessage(duplicate.name) };

    try {
        const last = await prisma.serviceChecklistItem.aggregate({ _max: { sortOrder: true } });
        await prisma.serviceChecklistItem.create({
            data: { name, sortOrder: (last._max.sortOrder ?? 0) + 10 },
        });
    } catch (error) {
        if (isUniqueViolation(error)) return { success: false, message: duplicateMessage(name) };
        console.error('createServiceChecklistItem', error);
        return { success: false, message: 'No se pudo agregar el punto.' };
    }

    revalidatePath(SETTINGS_PATH);
    return { success: true, message: `Punto "${name}" agregado.` };
}

/** Renombra solo el catálogo: las OT que ya lo marcaron conservan su snapshot del nombre. */
export async function renameServiceChecklistItem(id: string, rawName: string): Promise<ActionResult> {
    if (!(await requireAdmin())) return { success: false, message: 'Acceso denegado.' };

    const name = normalizeName(rawName ?? '');
    const invalid = validateName(name);
    if (invalid) return { success: false, message: invalid };

    const current = await prisma.serviceChecklistItem.findUnique({ where: { id }, select: { name: true } });
    if (!current) return { success: false, message: 'Punto no encontrado.' };
    if (current.name === name) return { success: true, message: 'Sin cambios.' };

    const duplicate = await findDuplicate(name, id);
    if (duplicate) return { success: false, message: duplicateMessage(duplicate.name) };

    try {
        await prisma.serviceChecklistItem.update({ where: { id }, data: { name } });
    } catch (error) {
        if (isUniqueViolation(error)) return { success: false, message: duplicateMessage(name) };
        console.error('renameServiceChecklistItem', error);
        return { success: false, message: 'No se pudo renombrar el punto.' };
    }

    revalidatePath(SETTINGS_PATH);
    return { success: true, message: 'Punto renombrado.' };
}

export async function setServiceChecklistItemActive(id: string, active: boolean): Promise<ActionResult> {
    if (!(await requireAdmin())) return { success: false, message: 'Acceso denegado.' };

    try {
        await prisma.serviceChecklistItem.update({ where: { id }, data: { active } });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            return { success: false, message: 'Punto no encontrado.' };
        }
        console.error('setServiceChecklistItemActive', error);
        return { success: false, message: 'No se pudo actualizar el punto.' };
    }

    revalidatePath(SETTINGS_PATH);
    return { success: true, message: active ? 'Punto reactivado.' : 'Punto desactivado.' };
}

/**
 * Sube o baja un punto una posición (contando también los inactivos).
 * Reescribe el orden de todo el catálogo en múltiplos de 10 para no depender de huecos o empates.
 */
export async function moveServiceChecklistItem(id: string, direction: 'up' | 'down'): Promise<ActionResult> {
    if (!(await requireAdmin())) return { success: false, message: 'Acceso denegado.' };
    if (direction !== 'up' && direction !== 'down') return { success: false, message: 'Dirección inválida.' };

    try {
        const items = await prisma.serviceChecklistItem.findMany({
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: { id: true },
        });
        const index = items.findIndex((i) => i.id === id);
        if (index === -1) return { success: false, message: 'Punto no encontrado.' };

        const target = direction === 'up' ? index - 1 : index + 1;
        if (target < 0 || target >= items.length) return { success: true, message: 'Sin cambios.' };

        [items[index], items[target]] = [items[target], items[index]];

        await prisma.$transaction(
            items.map((item, i) =>
                prisma.serviceChecklistItem.update({ where: { id: item.id }, data: { sortOrder: (i + 1) * 10 } })
            )
        );
    } catch (error) {
        console.error('moveServiceChecklistItem', error);
        return { success: false, message: 'No se pudo reordenar el punto.' };
    }

    revalidatePath(SETTINGS_PATH);
    return { success: true, message: 'Orden actualizado.' };
}
