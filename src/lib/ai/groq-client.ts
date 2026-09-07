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

/**
 * El taller responde al cliente: progreso de la OT en tono coloquial.
 * No inventa trabajos ni fechas.
 */
export async function rewriteOtStatusColloquial(facts: OtStatusFacts): Promise<string | null> {
    if (!isGroqConfigured()) return null;

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

    try {
        const res = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.GROQ_API_KEY!.trim()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL,
                temperature: 0.25,
                max_tokens: 350,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user },
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
        const text = data.choices?.[0]?.message?.content?.trim();
        if (!text || looksLikeBadStatusReply(text)) {
            if (text) console.warn('[groq] respuesta descartada (tono incorrecto)');
            return null;
        }
        return text;
    } catch (err) {
        console.error('[groq] error', err);
        return null;
    }
}
