'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import prisma from '../../lib/prisma';
import { revalidatePath } from 'next/cache';
import { Decimal } from '../../generated/prisma/runtime/library';
import {
    DEFAULT_SCHEDULE,
    WORKSHOP_SETTINGS_ID,
    WorkshopSchedule,
    parseHhMm,
} from '@/lib/workshop-schedule';

export type WorkshopSettingsData = WorkshopSchedule & { hourlyRate: number; ownerCommissionPct: number };

const EMPTY_SETTINGS: WorkshopSettingsData = { hourlyRate: 0, ownerCommissionPct: 70, ...DEFAULT_SCHEDULE };

export async function getWorkshopSettings(): Promise<WorkshopSettingsData> {
    const session = await getServerSession(authOptions);
    if (!session) {
        return EMPTY_SETTINGS;
    }

    const settings = await prisma.workshopSettings.upsert({
        where: { id: WORKSHOP_SETTINGS_ID },
        update: {},
        create: { id: WORKSHOP_SETTINGS_ID, hourlyRate: 0 },
    });

    return {
        hourlyRate: settings.hourlyRate.toNumber(),
        worksSaturday: settings.worksSaturday,
        worksSunday: settings.worksSunday,
        openingTime: settings.openingTime,
        closingTime: settings.closingTime,
        saturdayOpeningTime: settings.saturdayOpeningTime,
        saturdayClosingTime: settings.saturdayClosingTime,
        ownerCommissionPct: settings.ownerCommissionPct,
    };
}

export type UpdateWorkshopSettingsInput = {
    hourlyRate: string;
    worksSaturday: boolean;
    worksSunday: boolean;
    openingTime: string;
    closingTime: string;
    saturdayOpeningTime: string;
    saturdayClosingTime: string;
    ownerCommissionPct: string;
};

export async function updateWorkshopSettings(input: UpdateWorkshopSettingsInput): Promise<{
    success: boolean;
    message: string;
    settings?: WorkshopSettingsData;
}> {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
        return { success: false, message: 'Acceso denegado. Solo administradores.' };
    }

    const hourlyRate = parseFloat(input.hourlyRate);
    if (isNaN(hourlyRate) || hourlyRate < 0) {
        return { success: false, message: 'El precio hora debe ser un número válido ≥ 0.' };
    }

    const ownerCommissionPct = parseFloat(input.ownerCommissionPct);
    if (isNaN(ownerCommissionPct) || ownerCommissionPct < 0 || ownerCommissionPct > 100) {
        return { success: false, message: 'La comisión del taller debe estar entre 0 y 100.' };
    }

    const ranges: Array<{ label: string; open: string; close: string }> = [
        { label: 'de lunes a viernes', open: input.openingTime, close: input.closingTime },
    ];
    if (input.worksSaturday) {
        ranges.push({
            label: 'de los sábados',
            open: input.saturdayOpeningTime,
            close: input.saturdayClosingTime,
        });
    }

    for (const range of ranges) {
        const open = parseHhMm(range.open);
        const close = parseHhMm(range.close);
        if (open === null || close === null) {
            return { success: false, message: `Revisá el horario ${range.label}: usá el formato HH:mm.` };
        }
        if (close <= open) {
            return {
                success: false,
                message: `El cierre ${range.label} debe ser posterior a la apertura.`,
            };
        }
    }

    try {
        const data = {
            hourlyRate: new Decimal(hourlyRate),
            worksSaturday: input.worksSaturday,
            worksSunday: input.worksSunday,
            openingTime: input.openingTime.trim(),
            closingTime: input.closingTime.trim(),
            saturdayOpeningTime: input.saturdayOpeningTime.trim(),
            saturdayClosingTime: input.saturdayClosingTime.trim(),
            ownerCommissionPct: Math.round(ownerCommissionPct),
        };

        const settings = await prisma.workshopSettings.upsert({
            where: { id: WORKSHOP_SETTINGS_ID },
            update: data,
            create: { id: WORKSHOP_SETTINGS_ID, ...data },
        });

        revalidatePath('/dashboard/settings');
        revalidatePath('/dashboard/interventions');
        revalidatePath('/dashboard/turnos');

        return {
            success: true,
            message: 'Configuración guardada.',
            settings: {
                hourlyRate: settings.hourlyRate.toNumber(),
                worksSaturday: settings.worksSaturday,
                worksSunday: settings.worksSunday,
                openingTime: settings.openingTime,
                closingTime: settings.closingTime,
                saturdayOpeningTime: settings.saturdayOpeningTime,
                saturdayClosingTime: settings.saturdayClosingTime,
                ownerCommissionPct: settings.ownerCommissionPct,
            },
        };
    } catch (error) {
        console.error('Error updating workshop settings:', error);
        return { success: false, message: 'Error al guardar la configuración.' };
    }
}
