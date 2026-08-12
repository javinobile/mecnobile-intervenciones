/** Normalización y formato de teléfonos para WhatsApp (E.164 sin +). */

/** Digitos solamente; asume Argentina (+54) si viene 10 dígitos locales. */
export function normalizeWaId(raw: string | null | undefined): string | null {
    if (!raw) return null;
    let digits = raw.replace(/\D/g, '');
    if (!digits) return null;

    // 549… (móvil AR con 9) o 54…
    if (digits.startsWith('54')) {
        return digits;
    }
    // 0 + área + número (ej. 011…)
    if (digits.startsWith('0')) {
        digits = digits.slice(1);
    }
    // 15… móvil viejo → quitar 15 (solo si queda área+número ~10 dígitos)
    if (digits.startsWith('15') && digits.length >= 10) {
        digits = digits.slice(2);
    }
    // 10 dígitos locales AR → prepend 54
    if (digits.length === 10) {
        return `54${digits}`;
    }
    // 11 dígitos empezando con 9 (móvil)
    if (digits.length === 11 && digits.startsWith('9')) {
        return `54${digits}`;
    }
    return digits;
}

/**
 * Claves de comparación para teléfonos AR / WhatsApp.
 * Une formatos distintos del mismo celular, p.ej.:
 * - WhatsApp: 5493482540023
 * - Agenda vieja: 15540023 (15 + abonado, sin código de área)
 * - Local: 3482540023 / 0348215540023
 *
 * Los fijos no suelen compartir estas variantes con un wa_id móvil: no matchean (correcto).
 */
export function phoneMatchKeys(raw: string | null | undefined): string[] {
    if (!raw) return [];
    const rawDigits = raw.replace(/\D/g, '');
    if (!rawDigits) return [];

    const normalized = normalizeWaId(raw) || rawDigits;
    const digits = normalized.replace(/\D/g, '');
    const keys = new Set<string>();

    const add = (k: string | null | undefined) => {
        if (!k) return;
        const d = k.replace(/\D/g, '');
        // Evitar claves demasiado cortas (falsos positivos)
        if (d.length >= 6) keys.add(d);
    };

    const addSubscriberSuffixes = (d: string) => {
        for (const n of [6, 7, 8] as const) {
            if (d.length > n) add(d.slice(-n));
        }
    };

    const addArMobileVariants = (d: string) => {
        add(d);
        if (d.length >= 10) add(d.slice(-10));

        if (d.startsWith('549') && d.length >= 12) {
            const local = d.slice(3); // sin 54+9 → área+abonado
            add(local);
            add(`54${local}`);
            add(`9${local}`);
            if (local.length >= 10) add(local.slice(-10));
            addSubscriberSuffixes(local);
        } else if (d.startsWith('54') && d.length >= 11) {
            const rest = d.slice(2);
            add(rest);
            if (rest.startsWith('9')) {
                const local = rest.slice(1);
                add(local);
                add(`549${local}`);
                if (local.length >= 10) add(local.slice(-10));
                addSubscriberSuffixes(local);
            } else {
                add(`549${rest}`);
                addSubscriberSuffixes(rest);
            }
        } else {
            addSubscriberSuffixes(d);
        }
    };

    addArMobileVariants(rawDigits);
    if (digits !== rawDigits) addArMobileVariants(digits);

    // Formato local viejo: 15 + abonado (ej. 15540023 → 540023)
    // También 0? + área + 15 + abonado (ej. 0348215540023 / 348215540023)
    for (const d of [rawDigits, digits]) {
        if (/^15\d{6,8}$/.test(d)) {
            const subscriber = d.slice(2);
            add(subscriber);
            add(`15${subscriber}`);
        }

        const withArea15 = d.match(/^(?:0)?(\d{2,4})15(\d{6,8})$/);
        if (withArea15) {
            const area = withArea15[1];
            const subscriber = withArea15[2];
            add(subscriber);
            add(`15${subscriber}`);
            add(`${area}${subscriber}`);
            add(`${area}15${subscriber}`);
            add(`549${area}${subscriber}`);
            add(`54${area}${subscriber}`);
        }
    }

    return Array.from(keys);
}

export function phonesLikelyMatch(
    a: string | null | undefined,
    b: string | null | undefined
): boolean {
    const ka = phoneMatchKeys(a);
    const kb = phoneMatchKeys(b);
    if (!ka.length || !kb.length) return false;
    const setB = new Set(kb);
    return ka.some((k) => setB.has(k));
}

/**
 * Meta entrega móviles argentinos como 549..., pero en la lista autorizada del
 * número de prueba puede exigir 54... para los envíos (error 131030).
 * Se conserva el wa_id original en DB y solo se adapta el destinatario saliente.
 */
export function formatMetaRecipientWaId(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('549') && digits.length === 13) {
        return `54${digits.slice(3)}`;
    }
    return digits;
}

export function formatDateTimeEsAr(date: Date): { fecha: string; hora: string; full: string } {
    const fecha = date.toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
    const hora = date.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
    });
    return { fecha, hora, full: `${fecha} a las ${hora}` };
}

/** Etiqueta corta para botones de WhatsApp (máximo 20 caracteres). Ej: "lun 10/08 09:00" */
export function formatSlotButtonLabel(date: Date): string {
    const weekday = date
        .toLocaleDateString('es-AR', { weekday: 'short' })
        .replace(/\./g, '')
        .slice(0, 3);
    const pad = (n: number) => String(n).padStart(2, '0');
    const label = `${weekday} ${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return label.slice(0, 20);
}

export function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

const MONTHS_ES: Record<string, number> = {
    enero: 1,
    ene: 1,
    febrero: 2,
    feb: 2,
    marzo: 3,
    mar: 3,
    abril: 4,
    abr: 4,
    mayo: 5,
    may: 5,
    junio: 6,
    jun: 6,
    julio: 7,
    jul: 7,
    agosto: 8,
    ago: 8,
    septiembre: 9,
    setiembre: 9,
    sep: 9,
    set: 9,
    octubre: 10,
    oct: 10,
    noviembre: 11,
    nov: 11,
    diciembre: 12,
    dic: 12,
};

function stripAccents(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function buildDate(day: number, month: number, year: number): Date | null {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day, 0, 0, 0, 0);
    // Rechaza fechas inexistentes como 31/02
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return null;
    }
    return date;
}

/**
 * Fecha (sin hora) escrita de forma coloquial: `9/8`, `9-8-2026`, `9 de agosto`,
 * `hoy`, `mañana`, `pasado mañana`.
 *
 * Si el año no se indica se asume el actual; solo se pasa al siguiente cuando la
 * fecha quedaría muy atrás (más de 120 días), para no aceptar días recién pasados
 * como si fueran del año que viene.
 */
export function parseClientDate(text: string, now: Date = new Date()): Date | null {
    const cleaned = stripAccents(text.trim().toLowerCase()).replace(/\s+/g, ' ');
    const today = startOfDay(now);

    if (cleaned === 'hoy') return today;
    if (cleaned === 'manana') return new Date(today.getTime() + 86400000);
    if (cleaned === 'pasado manana') return new Date(today.getTime() + 2 * 86400000);

    let day: number | null = null;
    let month: number | null = null;
    let year: number | null = null;

    const numeric = cleaned.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
    if (numeric) {
        day = parseInt(numeric[1], 10);
        month = parseInt(numeric[2], 10);
        if (numeric[3]) {
            year = parseInt(numeric[3], 10);
            if (year < 100) year += 2000;
        }
    } else {
        const written = cleaned.match(
            /^(\d{1,2})(?:\s+de)?\s+([a-z]+)(?:\s+(?:de\s+)?(\d{4}))?$/
        );
        if (written) {
            const monthName = written[2];
            if (MONTHS_ES[monthName] === undefined) return null;
            day = parseInt(written[1], 10);
            month = MONTHS_ES[monthName];
            if (written[3]) year = parseInt(written[3], 10);
        }
    }

    if (day === null || month === null) return null;

    if (year === null) {
        const currentYear = now.getFullYear();
        const candidate = buildDate(day, month, currentYear);
        if (!candidate) return null;
        const daysBehind = (today.getTime() - candidate.getTime()) / 86400000;
        year = daysBehind > 120 ? currentYear + 1 : currentYear;
    }

    return buildDate(day, month, year);
}

export type TimeParseResult =
    | { ok: true; hour: number; minute: number }
    | { ok: false; reason: 'FORMAT' | 'AMBIGUOUS' };

/**
 * Hora escrita de forma coloquial: `16`, `16:30`, `16 hs`, `9.45`, `4 de la tarde`,
 * `8 am`, `mediodía`, `16 y media`.
 *
 * Devuelve `AMBIGUOUS` cuando el cliente escribe una hora suelta de 1 a 7 sin
 * aclarar mañana/tarde, para poder repreguntar en lugar de adivinar.
 */
export function parseClientTime(text: string): TimeParseResult {
    const cleaned = stripAccents(text.trim().toLowerCase())
        .replace(/\s+/g, ' ')
        .replace(/^a\s+las\s+/, '')
        .replace(/\./g, ':');

    if (cleaned === 'mediodia') return { ok: true, hour: 12, minute: 0 };
    if (cleaned === 'medianoche') return { ok: true, hour: 0, minute: 0 };

    const match = cleaned.match(
        /^(\d{1,2})(?::(\d{2}))?\s*(?:hs?|horas)?\s*(?:y\s+(media|cuarto))?\s*(am|pm|a\s?m|p\s?m|de la manana|de la tarde|de la noche|de la madrugada)?$/
    );
    if (!match) return { ok: false, reason: 'FORMAT' };

    let hour = parseInt(match[1], 10);
    let minute = match[2] ? parseInt(match[2], 10) : 0;

    if (match[3] === 'media') minute = 30;
    if (match[3] === 'cuarto') minute = 15;

    const meridiem = match[4]?.replace(/\s/g, '');
    const isAfternoon = meridiem === 'pm' || meridiem === 'delatarde' || meridiem === 'delanoche';
    const isMorning =
        meridiem === 'am' || meridiem === 'delamanana' || meridiem === 'delamadrugada';

    if (hour > 23 || minute > 59) return { ok: false, reason: 'FORMAT' };

    if (isAfternoon && hour < 12) hour += 12;
    if (isMorning && hour === 12) hour = 0;

    // "4" suelto puede ser 04:00 o 16:00: mejor repreguntar que asumir.
    if (!meridiem && hour >= 1 && hour <= 7) {
        return { ok: false, reason: 'AMBIGUOUS' };
    }

    return { ok: true, hour, minute };
}

/** Combina un día (a las 00:00) con hora y minutos. */
export function combineDateAndTime(date: Date, hour: number, minute: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
}
