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
 * Fallback sin IA: limpia montos del texto crudo.
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

const DATE_LINE_RE =
    /(?:^|\b)(?:fecha\s*:?\s*)?(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})(?:\b|$)/i;
const KM_RE = /(?:^|\b)(?:km|kilometraje|od[oó]metro)\s*:?\s*([\d.]+)|([\d.]+)\s*km\b/i;

function extractKmFromText(text: string): number | null {
    const m = text.match(KM_RE);
    if (!m) return null;
    const raw = (m[1] || m[2] || '').replace(/\./g, '');
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function looksLikeVehicleHeader(line: string): boolean {
    const lower = line.toLowerCase();
    return (
        /^(veh[ií]culo|patente|dominio|vin|chasis|marca|modelo|cliente|titular|propietario)\b/i.test(
            lower
        ) || /^historial\s*:?\s*$/i.test(lower)
    );
}

/**
 * Parseo heurístico del texto del sistema viejo en entradas tipo OT
 * (fecha, km, motivo, detalles), sin depender de Groq.
 */
export function parseLegacyHistorialHeuristic(rawHistorial: string): LegacyHistoryEntry[] {
    const cleaned = stripLegacyHistorialCosts(rawHistorial);
    if (!cleaned) return [];

    let body = cleaned;
    const histIdx = cleaned.search(/\bhistorial\s*:?\s*\n/i);
    if (histIdx >= 0) {
        body = cleaned.slice(histIdx).replace(/^\s*historial\s*:?\s*/i, '');
    }

    const lines = body
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => !looksLikeVehicleHeader(l));

    if (!lines.length) return [];

    type Block = { dateLabel: string; lines: string[] };
    const blocks: Block[] = [];
    let current: Block | null = null;

    const pushCurrent = () => {
        if (current && current.lines.length) blocks.push(current);
        current = null;
    };

    for (const line of lines) {
        if (/^-{3,}$|^={3,}$/.test(line)) {
            pushCurrent();
            continue;
        }

        const dateMatch = line.match(DATE_LINE_RE);
        const isDateOnly =
            dateMatch &&
            line.replace(DATE_LINE_RE, '').replace(/fecha\s*:?/i, '').trim().length < 3;

        if (dateMatch && (isDateOnly || /fecha/i.test(line) || !current)) {
            pushCurrent();
            current = { dateLabel: dateMatch[1], lines: [] };
            if (!isDateOnly) {
                const rest = line
                    .replace(DATE_LINE_RE, '')
                    .replace(/fecha\s*:?/i, '')
                    .trim()
                    .replace(/^[-–—:|]\s*/, '');
                if (rest) current.lines.push(rest);
            }
            continue;
        }

        if (!current) {
            current = { dateLabel: 'Sin fecha', lines: [line] };
        } else {
            current.lines.push(line);
        }
    }
    pushCurrent();

    if (!blocks.length) {
        return [
            {
                dateLabel: 'Sin fecha',
                mileageKm: extractKmFromText(cleaned),
                description: lines[0] || 'Trabajo en taller',
                details: lines.slice(1, 20),
            },
        ];
    }

    return blocks
        .map((block) => {
            const joined = block.lines.join(' ');
            const mileageKm = extractKmFromText(joined) ?? extractKmFromText(block.lines.join('\n'));
            const detailLines = block.lines
                .map((l) =>
                    l
                        .replace(KM_RE, '')
                        .replace(/\s{2,}/g, ' ')
                        .trim()
                        .replace(/^[-•*]\s*/, '')
                )
                .filter(Boolean)
                .filter((l) => !DATE_LINE_RE.test(l));

            const description =
                detailLines[0] ||
                (mileageKm != null ? `Intervención a ${mileageKm.toLocaleString('es-AR')} km` : 'Trabajo en taller');
            const details = detailLines.slice(1).slice(0, 25);

            return {
                dateLabel: block.dateLabel,
                mileageKm,
                description,
                details,
            };
        })
        .filter((e) => e.description || e.details.length > 0);
}

function fallbackLegacyEntries(raw: string): LegacyHistoryEntry[] {
    const heuristic = parseLegacyHistorialHeuristic(raw);
    if (heuristic.length > 0) return heuristic;
    const cleaned = stripLegacyHistorialCosts(raw);
    if (!cleaned) return [];
    return [
        {
            dateLabel: 'Sin fecha',
            mileageKm: null,
            description: 'Trabajo en taller',
            details: cleaned
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
                .slice(0, 25),
        },
    ];
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

    // Heurística primero: siempre tenemos bloques útiles aunque falle la IA.
    const heuristic = parseLegacyHistorialHeuristic(cleaned);

    if (!isGroqConfigured()) {
        return heuristic.length ? heuristic : fallbackLegacyEntries(cleaned);
    }

    const system = [
        'Convertís historiales de taller del sistema viejo a JSON estructurado.',
        'Respondé SOLO un JSON array válido (sin markdown, sin comentarios).',
        'Cada elemento:',
        '{"dateLabel":"DD/MM/AAAA","mileageKm":number|null,"description":"motivo/trabajo corto","details":["detalle sin precio",...]}',
        '',
        'REGLAS:',
        '- Una entrada por cada intervención / visita al taller.',
        '- description: una sola frase con el motivo (como en una OT moderna).',
        '- details: ítems cortos (repuestos, trabajos). SIN precios ni totales.',
        '- No copies el texto crudo entero en un solo campo.',
        '- No inventes datos. Omití cabecera del vehículo, totales e IVA.',
        '- Orden: más reciente primero. Máximo 30 entradas.',
    ].join('\n');

    const user = [
        'HISTORIAL CRUDO DEL SISTEMA ANTERIOR:',
        cleaned.slice(0, 12_000),
        '',
        'Devolvé el JSON array.',
    ].join('\n');

    const text = await callGroqChat({ system, user, temperature: 0.1, maxTokens: 3500 });
    if (!text) {
        return heuristic.length ? heuristic : fallbackLegacyEntries(cleaned);
    }

    const arr = extractJsonArray(text);
    if (!arr) {
        console.warn('[groq] legacy historial: JSON inválido, uso heurística');
        return heuristic.length ? heuristic : fallbackLegacyEntries(cleaned);
    }

    const parsed = arr.map(sanitizeLegacyEntry).filter((e): e is LegacyHistoryEntry => e != null);

    // Si la IA devolvió un único bloque con demasiados detalles (formato crudo), preferir heurística.
    if (
        parsed.length === 1 &&
        parsed[0].details.length > 15 &&
        heuristic.length > 1
    ) {
        return heuristic;
    }

    return parsed.length ? parsed : heuristic.length ? heuristic : fallbackLegacyEntries(cleaned);
}
