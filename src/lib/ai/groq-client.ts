/** Cliente opcional de Groq (API compatible OpenAI). Sin key → null. */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

export function isGroqConfigured(): boolean {
    const key = process.env.GROQ_API_KEY?.trim();
    return Boolean(key && !key.includes('your_'));
}

export type OtStatusItemFact = {
    type: 'REPUESTO' | 'MANO_DE_OBRA' | 'TRABAJO_TERCERO';
    description: string;
};

export type OtStatusFacts = {
    clientFirstName: string | null;
    licensePlate: string;
    carLabel: string;
    otNumber: number;
    /** Motivo / avería de ingreso */
    description: string;
    notes: string | null;
    openedAtLabel: string;
    items: OtStatusItemFact[];
    /** Cuando exista en la OT; por ahora suele ser null */
    estimatedReadyAtLabel: string | null;
};

/** Entrada de historial del sistema previo, alineada al PDF actual (sin importes). */
export type LegacyHistoryEntry = {
    /** Fecha legible es-AR, p.ej. 15/03/2022 */
    dateLabel: string;
    /** Km al momento de la intervención, o null si no figura */
    mileageKm: number | null;
    /** Motivo / trabajo principal */
    description: string;
    /** Detalles / ítems sin precios */
    details: string[];
};

/** Detecta respuestas mal armadas (p.ej. habla como el cliente). */
function looksLikeBadStatusReply(text: string): boolean {
    const lower = text.toLowerCase();
    const badSnippets = [
        'queremos consultar',
        'quiero consultar',
        'hola nobile',
        'hola nóbile',
        'hola mecnobile',
        'escribo para consultar',
        'me gustaría saber',
        'podrían decirme',
    ];
    return badSnippets.some((s) => lower.includes(s));
}

async function callGroqChat(opts: {
    system: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
}): Promise<string | null> {
    if (!isGroqConfigured()) return null;

    try {
        const res = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.GROQ_API_KEY!.trim()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL,
                temperature: opts.temperature ?? 0.2,
                max_tokens: opts.maxTokens ?? 350,
                messages: [
                    { role: 'system', content: opts.system },
                    { role: 'user', content: opts.user },
                ],
            }),
        });

        if (!res.ok) {
            console.error('[groq] HTTP', res.status, await res.text().catch(() => ''));
            return null;
        }

        const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
        console.error('[groq] error', err);
        return null;
    }
}

/**
 * El taller responde al cliente: progreso de la OT en tono coloquial.
 * No inventa trabajos ni fechas.
 */
export async function rewriteOtStatusColloquial(facts: OtStatusFacts): Promise<string | null> {
    const system = [
        'Sos el asistente de WhatsApp del taller *Nóbile* (Avellaneda, Santa Fe).',
        'El cliente YA preguntó el estado. Vos respondés EN NOMBRE DEL TALLER.',
        'Habla en segunda persona hacia el cliente (vos / tu auto). Nunca hables como el cliente.',
        'No empieces con "Hola Nóbile" ni "queremos consultar". Eso sería el mensaje del cliente, no el tuyo.',
        '',
        'Estructura obligatoria (3 bloques cortos, total máx. ~6 oraciones):',
        '1) Saludo breve usando el nombre del cliente si viene en los hechos.',
        '2) Progreso: qué se está haciendo / qué se cargó en la OT (descripción + ítems). Resumí en lenguaje de taller, claro.',
        '3) Entrega: si hay estimatedReadyAtLabel, decila; si es null, digá que todavía no hay horario confirmado y que avisamos por este chat.',
        '',
        'REGLAS:',
        '- Solo hechos del JSON. No inventes fallas, repuestos, plazos ni porcentajes.',
        '- No menciones precios ni montos.',
        '- No digas que sos una IA.',
        '- WhatsApp: podés usar *negrita* con asteriscos; sin listas markdown largas.',
        '- Español rioplatense, cercano y profesional.',
    ].join('\n');

    const user = [
        'DATOS DE LA OT ABIERTA (única fuente de verdad):',
        JSON.stringify(facts, null, 2),
        '',
        'Redactá SOLO la respuesta del taller al cliente.',
    ].join('\n');

    const text = await callGroqChat({ system, user, temperature: 0.25, maxTokens: 350 });
    if (!text || looksLikeBadStatusReply(text)) {
        if (text) console.warn('[groq] respuesta descartada (tono incorrecto)');
        return null;
    }
    return text;
}

function extractJsonArray(raw: string): unknown[] | null {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] || raw).trim();
    const start = candidate.indexOf('[');
    const end = candidate.lastIndexOf(']');
    if (start < 0 || end <= start) return null;
    try {
        const parsed = JSON.parse(candidate.slice(start, end + 1));
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function sanitizeLegacyEntry(row: unknown): LegacyHistoryEntry | null {
    if (!row || typeof row !== 'object') return null;
    const r = row as Record<string, unknown>;

    const dateLabel =
        typeof r.dateLabel === 'string'
            ? r.dateLabel.trim()
            : typeof r.date === 'string'
              ? r.date.trim()
              : '';
    const description =
        typeof r.description === 'string'
            ? r.description.trim()
            : typeof r.motivo === 'string'
              ? r.motivo.trim()
              : '';

    let mileageKm: number | null = null;
    if (typeof r.mileageKm === 'number' && Number.isFinite(r.mileageKm)) {
        mileageKm = Math.round(r.mileageKm);
    } else if (typeof r.km === 'number' && Number.isFinite(r.km)) {
        mileageKm = Math.round(r.km);
    } else if (typeof r.mileageKm === 'string' && r.mileageKm.trim()) {
        const n = Number(r.mileageKm.replace(/[^\d]/g, ''));
        if (Number.isFinite(n)) mileageKm = n;
    }

    const detailsRaw = Array.isArray(r.details)
        ? r.details
        : Array.isArray(r.items)
          ? r.items
          : [];
    const details = detailsRaw
        .map((d) => {
            if (typeof d === 'string') return d.trim();
            if (d && typeof d === 'object' && typeof (d as { description?: unknown }).description === 'string') {
                return String((d as { description: string }).description).trim();
            }
            return '';
        })
        .filter(Boolean)
        .filter((line) => !/\$|ars\b|pesos?|importe|total|precio|costo|cobrado/i.test(line));

    if (!dateLabel && !description && details.length === 0) return null;

    return {
        dateLabel: dateLabel || 'Fecha no indicada',
        mileageKm,
        description: description || 'Trabajo en taller',
        details,
    };
}

/**
 * Fallback sin IA: limpia montos del texto crudo y lo parte en bloques simples.
 */
export function stripLegacyHistorialCosts(raw: string): string {
    return raw
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => {
            const lower = line.toLowerCase();
            if (!line.trim()) return true;
            if (/\$\s*\d/.test(line)) return false;
            if (/\b(total|importe|precio|costo|subtotal|iva)\b/i.test(lower) && /\d/.test(line)) {
                return false;
            }
            return true;
        })
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Convierte el texto libre del historial antiguo en entradas estructuradas
 * (fecha, km, motivo, detalles) sin importes, alineadas al PDF actual.
 */
export async function normalizeLegacyHistorialEntries(
    rawHistorial: string
): Promise<LegacyHistoryEntry[]> {
    const cleaned = stripLegacyHistorialCosts(rawHistorial);
    if (!cleaned) return [];

    if (!isGroqConfigured()) {
        return [
            {
                dateLabel: 'Registros anteriores',
                mileageKm: null,
                description: 'Historial del sistema previo',
                details: cleaned
                    .split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean)
                    .slice(0, 40),
            },
        ];
    }

    const system = [
        'Convertís historiales de taller del sistema viejo a JSON estructurado.',
        'Respondé SOLO un JSON array válido (sin markdown, sin comentarios).',
        'Cada elemento:',
        '{"dateLabel":"DD/MM/AAAA o texto de fecha","mileageKm":number|null,"description":"motivo/trabajo","details":["detalle sin precio",...]}',
        '',
        'REGLAS:',
        '- Extraé SOLO intervenciones / trabajos reales.',
        '- Incluí fecha y kilometraje cuando existan.',
        '- En details: repuestos, mano de obra y notas técnicas, SIN montos ni símbolos de dinero.',
        '- No inventes datos que no estén en el texto.',
        '- Omití totales, precios, IVA, formas de pago y datos de contacto del taller.',
        '- Ordená de más reciente a más antigua si se puede inferir.',
        '- Máximo 30 entradas.',
    ].join('\n');

    const user = [
        'HISTORIAL CRUDO DEL SISTEMA ANTERIOR:',
        cleaned.slice(0, 12_000),
        '',
        'Devolvé el JSON array.',
    ].join('\n');

    const text = await callGroqChat({ system, user, temperature: 0.1, maxTokens: 2500 });
    if (!text) {
        return [
            {
                dateLabel: 'Registros anteriores',
                mileageKm: null,
                description: 'Historial del sistema previo',
                details: cleaned
                    .split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean)
                    .slice(0, 40),
            },
        ];
    }

    const arr = extractJsonArray(text);
    if (!arr) {
        console.warn('[groq] legacy historial: JSON inválido');
        return [
            {
                dateLabel: 'Registros anteriores',
                mileageKm: null,
                description: 'Historial del sistema previo',
                details: cleaned
                    .split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean)
                    .slice(0, 40),
            },
        ];
    }

    return arr.map(sanitizeLegacyEntry).filter((e): e is LegacyHistoryEntry => e != null);
}
