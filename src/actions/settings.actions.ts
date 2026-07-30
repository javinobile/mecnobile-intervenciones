'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import prisma from '../../lib/prisma';
import { revalidatePath } from 'next/cache';
import { Decimal } from '../../generated/prisma/runtime/library';

const SETTINGS_ID = 'default';

export async function getWorkshopSettings(): Promise<{ hourlyRate: number }> {
    const session = await getServerSession(authOptions);
    if (!session) {
        return { hourlyRate: 0 };
    }

    const settings = await prisma.workshopSettings.upsert({
        where: { id: SETTINGS_ID },
        update: {},
        create: { id: SETTINGS_ID, hourlyRate: 0 },
    });

    return { hourlyRate: settings.hourlyRate.toNumber() };
}

export async function updateWorkshopSettings(hourlyRateInput: string): Promise<{
    success: boolean;
    message: string;
    hourlyRate?: number;
}> {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        return { success: false, message: 'Acceso denegado. Solo administradores.' };
    }

    const hourlyRate = parseFloat(hourlyRateInput);
    if (isNaN(hourlyRate) || hourlyRate < 0) {
        return { success: false, message: 'El precio hora debe ser un número válido ≥ 0.' };
    }

    try {
        const settings = await prisma.workshopSettings.upsert({
            where: { id: SETTINGS_ID },
            update: { hourlyRate: new Decimal(hourlyRate) },
            create: { id: SETTINGS_ID, hourlyRate: new Decimal(hourlyRate) },
        });

        revalidatePath('/dashboard/settings');
        revalidatePath('/dashboard/interventions');

        return {
            success: true,
            message: 'Configuración guardada.',
            hourlyRate: settings.hourlyRate.toNumber(),
        };
    } catch (error) {
        console.error('Error updating workshop settings:', error);
        return { success: false, message: 'Error al guardar la configuración.' };
    }
}
