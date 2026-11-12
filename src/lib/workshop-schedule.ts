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

// ---------------------------------------------------------------------------
// Disponibilidad de turnos
// ---------------------------------------------------------------------------

/**
 * Cada turno reserva un bloque desde `startsAt` (momento de recepción del auto).
 * No modela la permanencia del auto en el taller, que puede ser de varios días.
 * Promedio estimado: 120 minutos.
 */
export const APPOINTMENT_BLOCK_MINUTES = 120;

const MINUTE_MS = 60 * 1000;

export type BusyBlock = { start: number; end: number };

/** Bloque ocupado por un turno: usa `endsAt` si está cargado, si no el bloque por defecto. */
export function appointmentToBlock(ap: { startsAt: Date; endsAt?: Date | null }): BusyBlock {
    const start = ap.startsAt.getTime();
    const customEnd = ap.endsAt?.getTime();
    const end =
        customEnd !== undefined && customEnd > start
            ? customEnd
            : start + APPOINTMENT_BLOCK_MINUTES * MINUTE_MS;
    return { start, end };
}

/** Un horario nuevo choca si su bloque se superpone con alguno ya ocupado. */
export function slotConflicts(startsAt: Date, busy: BusyBlock[]): boolean {
    const start = startsAt.getTime();
    const end = start + APPOINTMENT_BLOCK_MINUTES * MINUTE_MS;
    return busy.some((block) => start < block.end && end > block.start);
}

/** Horarios candidatos de un día: bloques consecutivos desde la apertura (ej. 08:00, 10:00, 12:00…). */
export function candidateSlotsForDay(day: Date, schedule: WorkshopSchedule): Date[] {
    const hours = hoursForDate(day, schedule);
    if (!hours) return [];
    const slots: Date[] = [];
    for (
        let minutes = hours.openMinutes;
        minutes < hours.closeMinutes;
        minutes += APPOINTMENT_BLOCK_MINUTES
    ) {
        slots.push(
            new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60)
        );
    }
    return slots;
}

/** Turnos activos (no cancelados) que ocupan horario entre dos fechas. */
export async function getBusyBlocks(from: Date, to: Date): Promise<BusyBlock[]> {
    // Se amplía el rango por el largo del bloque para captar turnos que arrancan antes y se superponen.
    const lookback = new Date(from.getTime() - APPOINTMENT_BLOCK_MINUTES * MINUTE_MS);
    const rows = await prisma.appointment.findMany({
        where: {
            status: { in: ['PENDIENTE', 'PROPUESTA_ENVIADA', 'CONFIRMADO'] },
            startsAt: { gte: lookback, lte: to },
        },
        select: { startsAt: true, endsAt: true },
    });
    return rows.map(appointmentToBlock);
}

function endOfDay(day: Date): Date {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
}

function startOfDayLocal(day: Date): Date {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
}

/** Horarios libres de un día (futuros, dentro del horario del taller y sin choques). */
export async function listFreeSlotsForDay(
    day: Date,
    schedule: WorkshopSchedule,
    now: Date = new Date()
): Promise<Date[]> {
    const candidates = candidateSlotsForDay(day, schedule).filter(
        (slot) => slot.getTime() > now.getTime()
    );
    if (!candidates.length) return [];
    const busy = await getBusyBlocks(startOfDayLocal(day), endOfDay(day));
    return candidates.filter((slot) => !slotConflicts(slot, busy));
}

/** Próximos días hábiles con al menos un horario libre. */
export async function listAvailableDays(
    schedule: WorkshopSchedule,
    now: Date = new Date(),
    opts: { maxDays?: number; horizonDays?: number } = {}
): Promise<Array<{ day: Date; slots: Date[] }>> {
    const maxDays = opts.maxDays ?? 7;
    const horizonDays = opts.horizonDays ?? 21;
    const first = startOfDayLocal(now);
    const last = endOfDay(new Date(first.getFullYear(), first.getMonth(), first.getDate() + horizonDays));
    const busy = await getBusyBlocks(first, last);

    const result: Array<{ day: Date; slots: Date[] }> = [];
    for (let i = 0; i <= horizonDays && result.length < maxDays; i++) {
        const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
        const slots = candidateSlotsForDay(day, schedule).filter(
            (slot) => slot.getTime() > now.getTime() && !slotConflicts(slot, busy)
        );
        if (slots.length) result.push({ day, slots });
    }
    return result;
}

/** ¿El horario sigue libre? Se usa justo antes de crear el turno. */
export async function isSlotFree(startsAt: Date): Promise<boolean> {
    const from = new Date(startsAt.getTime() - APPOINTMENT_BLOCK_MINUTES * MINUTE_MS);
    const to = new Date(startsAt.getTime() + APPOINTMENT_BLOCK_MINUTES * MINUTE_MS);
    const busy = await getBusyBlocks(from, to);
    return !slotConflicts(startsAt, busy);
}
