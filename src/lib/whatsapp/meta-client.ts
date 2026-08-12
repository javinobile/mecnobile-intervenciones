import { createHmac, timingSafeEqual } from 'crypto';
import { getWhatsAppConfig, isWhatsAppConfigured } from './config';
import { formatDateTimeEsAr, formatMetaRecipientWaId, formatSlotButtonLabel } from './phone';

/** Prefijo de los IDs de botón con las alternativas de turno (`turno_slot_0`…). */
export const SLOT_BUTTON_PREFIX = 'turno_slot_';

type SendResult = { ok: true } | { ok: false; error: string };

async function graphPost(path: string, body: Record<string, unknown>): Promise<SendResult> {
    if (!isWhatsAppConfigured()) {
        return { ok: false, error: 'WhatsApp no configurado (faltan variables de entorno).' };
    }

    const { accessToken, apiVersion } = getWhatsAppConfig();
    const url = `https://graph.facebook.com/${apiVersion}/${path}`;

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const msg =
                (data as { error?: { message?: string } })?.error?.message ||
                `HTTP ${res.status}`;
            console.error('WhatsApp API error:', data);
            return { ok: false, error: msg };
        }
        return { ok: true };
    } catch (error) {
        console.error('WhatsApp fetch error:', error);
        return { ok: false, error: 'Error de red al llamar a Meta.' };
    }
}

export async function sendTextMessage(toWaId: string, body: string): Promise<SendResult> {
    const { phoneNumberId } = getWhatsAppConfig();
    return graphPost(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to: formatMetaRecipientWaId(toWaId),
        type: 'text',
        text: { preview_url: false, body },
    });
}

/**
 * Botones de respuesta rápida (máximo 3, título de hasta 20 caracteres).
 * Solo válidos dentro de la ventana de 24 h desde el último mensaje del cliente.
 */
export async function sendInteractiveButtons(
    toWaId: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>
): Promise<SendResult> {
    const { phoneNumberId } = getWhatsAppConfig();
    return graphPost(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to: formatMetaRecipientWaId(toWaId),
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: bodyText },
            action: {
                buttons: buttons.slice(0, 3).map((button) => ({
                    type: 'reply',
                    reply: { id: button.id, title: button.title.slice(0, 20) },
                })),
            },
        },
    });
}

/**
 * Envía una plantilla aprobada. Si `buttonPayloads` está presente, adjunta
 * componentes Quick Reply (títulos fijos en Meta; el payload vuelve en el webhook).
 */
export async function sendTemplateMessage(
    toWaId: string,
    templateName: string,
    languageCode: string,
    bodyParams: string[],
    buttonPayloads?: string[]
): Promise<SendResult> {
    const { phoneNumberId } = getWhatsAppConfig();
    const components: Array<Record<string, unknown>> = [];

    if (bodyParams.length) {
        components.push({
            type: 'body',
            parameters: bodyParams.map((text) => ({ type: 'text', text })),
        });
    }

    if (buttonPayloads?.length) {
        for (let i = 0; i < buttonPayloads.length; i++) {
            components.push({
                type: 'button',
                sub_type: 'quick_reply',
                index: String(i),
                parameters: [{ type: 'payload', payload: buttonPayloads[i] }],
            });
        }
    }

    return graphPost(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to: formatMetaRecipientWaId(toWaId),
        type: 'template',
        template: {
            name: templateName,
            language: { code: languageCode },
            components,
        },
    });
}

/** Plantilla `turno_alternativas`: body + 3 Quick Reply con payload `turno_slot_N`. */
export async function sendAlternativesTemplate(
    toWaId: string,
    clientName: string,
    optionsBlock: string
): Promise<SendResult> {
    const { templateAlternativas, templateLanguage } = getWhatsAppConfig();
    return sendTemplateMessage(
        toWaId,
        templateAlternativas,
        templateLanguage,
        [clientName, optionsBlock],
        [0, 1, 2].map((i) => `${SLOT_BUTTON_PREFIX}${i}`)
    );
}

/**
 * Confirma el turno al cliente.
 * 1) Texto libre generado por el sistema (válido dentro de la ventana de 24 h).
 * 2) Si falla (ventana cerrada), plantilla Utility `turno_confirmado`:
 *    {{1}} nombre · {{2}} fecha · {{3}} hora
 */
export async function notifyAppointmentConfirmed(opts: {
    toWaId: string;
    clientName: string;
    startsAt: Date;
}): Promise<SendResult> {
    const { templateConfirmado, templateLanguage } = getWhatsAppConfig();
    const { fecha, hora, full } = formatDateTimeEsAr(opts.startsAt);

    const text =
        `Hola ${opts.clientName}, tu turno en Nóbile quedó *confirmado*.\n` +
        `Fecha: ${fecha}\n` +
        `Hora: ${hora}\n` +
        `(${full})\n` +
        `Te esperamos en el taller. Si no podés asistir, avisanos por este medio.`;

    const textResult = await sendTextMessage(opts.toWaId, text);
    if (textResult.ok) return textResult;

    return sendTemplateMessage(opts.toWaId, templateConfirmado, templateLanguage, [
        opts.clientName,
        fecha,
        hora,
    ]);
}

/**
 * Envía las alternativas del taller. Preferimos botones interactivos (ventana 24 h)
 * con el horario en el título. Si fallan (ventana cerrada), usa la plantilla
 * `turno_alternativas` con botones fijos Opcion 1/2/3 y payload `turno_slot_N`.
 * Último recurso: texto numerado.
 */
export async function notifyAppointmentAlternatives(opts: {
    toWaId: string;
    clientName: string;
    slots: Date[];
}): Promise<SendResult> {
    const lines = opts.slots.map((slot, i) => {
        const { full } = formatDateTimeEsAr(slot);
        return `${i + 1}) ${full}`;
    });
    const optionsBlock = lines.join('\n');

    const buttonsResult = await sendInteractiveButtons(
        opts.toWaId,
        `Hola ${opts.clientName}, no podemos recibir tu auto en el horario que pediste.\n\n` +
            `Estos son los horarios disponibles:\n${optionsBlock}\n\n` +
            `Tocá el botón del horario que te convenga y tu turno queda confirmado.`,
        opts.slots.map((slot, i) => ({
            id: `${SLOT_BUTTON_PREFIX}${i}`,
            title: formatSlotButtonLabel(slot),
        }))
    );
    if (buttonsResult.ok) return buttonsResult;

    const templateResult = await sendAlternativesTemplate(opts.toWaId, opts.clientName, optionsBlock);
    if (templateResult.ok) return templateResult;

    return sendTextMessage(
        opts.toWaId,
        `Hola ${opts.clientName}, no podemos recibir tu auto en el horario pedido.\n` +
            `Estas son las opciones disponibles. Respondé con el *número* de la opción:\n\n` +
            `${optionsBlock}\n\n` +
            `Ejemplo: respondé *1* para la primera opción.`
    );
}

export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
    const { appSecret } = getWhatsAppConfig();
    if (!appSecret || appSecret.includes('your_')) {
        // En desarrollo sin secret: aceptar (log). En prod siempre configurar.
        console.warn('META_APP_SECRET no configurado: se omite validación de firma.');
        return true;
    }
    if (!signatureHeader?.startsWith('sha256=')) return false;

    const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const received = signatureHeader.slice('sha256='.length);

    try {
        const a = Buffer.from(expected, 'utf8');
        const b = Buffer.from(received, 'utf8');
        if (a.length !== b.length) return false;
        return timingSafeEqual(a, b);
    } catch {
        return false;
    }
}
