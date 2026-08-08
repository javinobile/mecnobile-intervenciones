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

export async function sendTemplateMessage(
    toWaId: string,
    templateName: string,
    languageCode: string,
    bodyParams: string[]
): Promise<SendResult> {
    const { phoneNumberId } = getWhatsAppConfig();
    return graphPost(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to: formatMetaRecipientWaId(toWaId),
        type: 'template',
        template: {
            name: templateName,
            language: { code: languageCode },
            components: bodyParams.length
                ? [
                      {
                          type: 'body',
                          parameters: bodyParams.map((text) => ({ type: 'text', text })),
                      },
                  ]
                : [],
        },
    });
}

/** Confirma turno con plantilla de utilidad `turno_confirmado`.
 * Body en Meta (orden fijo de variables):
 *   {{1}} = nombre del cliente
 *   {{2}} = fecha (texto)
 *   {{3}} = hora
 * Si la plantilla falla (aún no aprobada), se intenta texto libre (ventana 24 h).
 */
export async function notifyAppointmentConfirmed(opts: {
    toWaId: string;
    clientName: string;
    startsAt: Date;
}): Promise<SendResult> {
    const { templateConfirmado, templateLanguage } = getWhatsAppConfig();
    const { fecha, hora, full } = formatDateTimeEsAr(opts.startsAt);

    const templateResult = await sendTemplateMessage(opts.toWaId, templateConfirmado, templateLanguage, [
        opts.clientName,
        fecha,
        hora,
    ]);

    if (templateResult.ok) return templateResult;

    // Fallback solo útil en número de prueba / ventana 24 h mientras aprueban la plantilla
    const text =
        `Hola ${opts.clientName}, tu turno en Nóbile quedó *confirmado*.\n` +
        `Fecha: ${fecha}\n` +
        `Hora: ${hora}\n` +
        `(${full})\n` +
        `Te esperamos en el taller. Si no podés asistir, avisanos por este medio.`;

    return sendTextMessage(opts.toWaId, text);
}

/**
 * Envía las alternativas del taller. Preferimos botones: el cliente toca uno y el
 * turno queda confirmado sin escribir nada. Si la ventana de 24 h está cerrada se
 * cae a la plantilla `turno_alternativas` y, como último recurso, a texto numerado.
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

    const buttonsResult = await sendInteractiveButtons(
        opts.toWaId,
        `Hola ${opts.clientName}, no podemos recibir tu auto en el horario que pediste.\n\n` +
            `Estos son los horarios disponibles:\n${lines.join('\n')}\n\n` +
            `Tocá el botón del horario que te convenga y tu turno queda confirmado.`,
        opts.slots.map((slot, i) => ({
            id: `${SLOT_BUTTON_PREFIX}${i}`,
            title: formatSlotButtonLabel(slot),
        }))
    );
    if (buttonsResult.ok) return buttonsResult;

    // Plantilla de utilidad `turno_alternativas`:
    //   {{1}} = nombre del cliente
    //   {{2}} = bloque numerado con 2 o 3 fechas/horas
    const { templateAlternativas, templateLanguage } = getWhatsAppConfig();
    const templateResult = await sendTemplateMessage(opts.toWaId, templateAlternativas, templateLanguage, [
        opts.clientName,
        lines.join('\n'),
    ]);
    if (templateResult.ok) return templateResult;

    return sendTextMessage(
        opts.toWaId,
        `Hola ${opts.clientName}, no podemos recibir tu auto en el horario pedido.\n` +
            `Estas son las opciones disponibles. Respondé con el *número* de la opción:\n\n` +
            `${lines.join('\n')}\n\n` +
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
