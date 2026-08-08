/**
 * Días y horarios de atención del taller (configurables por el admin en
 * Dashboard → Configuración). Se usan para no aceptar turnos fuera de horario,
 * tanto desde el bot de WhatsApp como desde la carga manual del calendario.
 */

import prisma from '../../lib/prisma';

export const WORKSHOP_SETTINGS_ID = 'default';

export type WorkshopSchedule = {
    worksSaturday: boolean;
    worksSunday: boolean;
    openingTime: string;
    closingTime: string;
    saturdayOpeningTime: string;
    saturdayClosingTime: string;
};

export const DEFAULT_SCHEDULE: WorkshopSchedule = {
    worksSaturday: false,
    worksSunday: false,
    openingTime: '08:00',
    closingTime: '18:00',
    saturdayOpeningTime: '08:00',
    saturdayClosingTime: '13:00',
};

/** Minutos desde medianoche, o null si el texto no es HH:mm válido. */
export function parseHhMm(value: string): number | null {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
}

export function formatHhMm(minutes: number): string {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Lectura sin sesión: la necesita el webhook de WhatsApp, que no tiene usuario.
 * Si la fila todavía no existe se devuelven los valores por defecto.
 */
export async function getWorkshopSchedule(): Promise<WorkshopSchedule> {
    const settings = await prisma.workshopSettings.findUnique({
        where: { id: WORKSHOP_SETTINGS_ID },
        select: {
            worksSaturday: true,
            worksSunday: true,
            openingTime: true,
            closingTime: true,
            saturdayOpeningTime: true,
            saturdayClosingTime: true,
        },
    });
    return settings ?? DEFAULT_SCHEDULE;
}

/** Horario que aplica a un día concreto, o null si ese día no se atiende. */
export function hoursForDate(
    date: Date,
    schedule: WorkshopSchedule
): { openMinutes: number; closeMinutes: number } | null {
    const weekday = date.getDay(); // 0 = domingo, 6 = sábado

    if (weekday === 0 && !schedule.worksSunday) return null;
    if (weekday === 6 && !schedule.worksSaturday) return null;

    const isSaturday = weekday === 6;
    const openRaw = isSaturday ? schedule.saturdayOpeningTime : schedule.openingTime;
    const closeRaw = isSaturday ? schedule.saturdayClosingTime : schedule.closingTime;

    const openMinutes = parseHhMm(openRaw) ?? parseHhMm(DEFAULT_SCHEDULE.openingTime)!;
    const closeMinutes = parseHhMm(closeRaw) ?? parseHhMm(DEFAULT_SCHEDULE.closingTime)!;
    if (closeMinutes <= openMinutes) return null;

    return { openMinutes, closeMinutes };
}

export function isWorkingDay(date: Date, schedule: WorkshopSchedule): boolean {
    return hoursForDate(date, schedule) !== null;
}

export type SlotCheck =
    | { ok: true }
    | { ok: false; reason: 'CLOSED_DAY' | 'OUTSIDE_HOURS'; message: string };

/** "sábado" → "sábados"; "lunes" queda igual (ya termina en s). */
export function pluralWeekday(date: Date): string {
    const name = date.toLocaleDateString('es-AR', { weekday: 'long' });
    return name.endsWith('s') ? name : `${name}s`;
}

/** Texto para mostrarle al cliente o al mecánico. Ej: "Lunes a viernes de 08:00 a 18:00". */
export function describeSchedule(schedule: WorkshopSchedule): string {
    const parts = [`de lunes a viernes de ${schedule.openingTime} a ${schedule.closingTime}`];
    if (schedule.worksSaturday) {
        parts.push(`sábados de ${schedule.saturdayOpeningTime} a ${schedule.saturdayClosingTime}`);
    }
    if (schedule.worksSunday) {
        parts.push(`domingos de ${schedule.openingTime} a ${schedule.closingTime}`);
    }
    if (parts.length === 1) return `Atendemos ${parts[0]}.`;
    return `Atendemos ${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}.`;
}

/** Horario de atención de un día puntual, ya formateado. */
export function describeDayHours(date: Date, schedule: WorkshopSchedule): string | null {
    const hours = hoursForDate(date, schedule);
    if (!hours) return null;
    return `de ${formatHhMm(hours.openMinutes)} a ${formatHhMm(hours.closeMinutes)}`;
}

/** Valida que un turno caiga en un día y hora en que el taller atiende. */
export function checkSlotWithinSchedule(date: Date, schedule: WorkshopSchedule): SlotCheck {
    const hours = hoursForDate(date, schedule);
    if (!hours) {
        return {
            ok: false,
            reason: 'CLOSED_DAY',
            message: `Los ${pluralWeekday(date)} el taller no atiende. ${describeSchedule(schedule)}`,
        };
    }

    const minutes = date.getHours() * 60 + date.getMinutes();
    if (minutes < hours.openMinutes || minutes > hours.closeMinutes) {
        return {
            ok: false,
            reason: 'OUTSIDE_HOURS',
            message:
                `Ese horario queda fuera de la atención del taller. ` +
                `Los ${pluralWeekday(date)} atendemos de ${formatHhMm(hours.openMinutes)} a ${formatHhMm(hours.closeMinutes)}.`,
        };
    }

    return { ok: true };
}
