import { createHmac, timingSafeEqual } from 'crypto';
import { getWhatsAppConfig, isWhatsAppConfigured } from './config';
import { formatDateTimeEsAr, formatMetaRecipientWaId, formatSlotButtonLabel } from './phone';

/** Prefijo de los IDs de botón con las alternativas de turno (`turno_slot_0`…). */
export const SLOT_BUTTON_PREFIX = 'turno_slot_';

export type SendResult = { ok: true } | { ok: false; error: string };

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

/** Lista interactiva (hasta 10 filas). Título de fila ≤ 24 caracteres, descripción ≤ 72. */
export async function sendInteractiveList(
    toWaId: string,
    bodyText: string,
    rows: Array<{ id: string; title: string; description?: string }>,
    opts: { buttonLabel?: string; sectionTitle?: string } = {}
): Promise<SendResult> {
    const { phoneNumberId } = getWhatsAppConfig();
    return graphPost(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to: formatMetaRecipientWaId(toWaId),
        type: 'interactive',
        interactive: {
            type: 'list',
            body: { text: bodyText.slice(0, 1024) },
            action: {
                button: (opts.buttonLabel || 'Ver opciones').slice(0, 20),
                sections: [
                    {
                        title: (opts.sectionTitle || 'Opciones').slice(0, 24),
                        rows: rows.slice(0, 10).map((row) => ({
                            id: row.id,
                            title: row.title.slice(0, 24),
                            ...(row.description
                                ? { description: row.description.slice(0, 72) }
                                : {}),
                        })),
                    },
                ],
            },
        },
    });
}

export type ChoiceOption = { id: string; title: string; description?: string };

/**
 * Ofrece una elección cerrada: botones si son hasta 3 con título corto, lista si son más.
 * Si Meta rechaza el mensaje interactivo, cae a texto numerado (o `fallbackText`)
 * para que el cliente igual pueda responder escribiendo.
 */
export async function sendChoice(
    toWaId: string,
    bodyText: string,
    options: ChoiceOption[],
    opts: { listButtonLabel?: string; fallbackText?: string } = {}
): Promise<SendResult> {
    const useButtons = options.length <= 3 && options.every((o) => o.title.length <= 20);
    const result = useButtons
        ? await sendInteractiveButtons(
              toWaId,
              bodyText,
              options.map((o) => ({ id: o.id, title: o.title }))
          )
        : await sendInteractiveList(toWaId, bodyText, options, {
              buttonLabel: opts.listButtonLabel,
          });
    if (result.ok) return result;

    const lines = options.map((o, i) => `${i + 1}) ${o.title}${o.description ? ` — ${o.description}` : ''}`);
    return sendTextMessage(
        toWaId,
        opts.fallbackText ?? `${bodyText}\n\n${lines.join('\n')}\n\nRespondé con el número de la opción.`
    );
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
 * Aviso de historial autorizado/rechazado. Texto libre dentro de la ventana de 24 h;
 * si Meta lo rechaza, plantilla Utility de respaldo
 * (`historial_aprobado`: {{1}} dominio · {{2}} email; `historial_rechazado`: {{1}} dominio · {{2}} motivo).
 */
export async function notifyHistoryDecision(opts: {
    toWaId: string;
    plate: string;
    approved: boolean;
    email?: string;
    reason?: string | null;
}): Promise<SendResult> {
    const { templateHistorialAprobado, templateHistorialRechazado, templateLanguage } =
        getWhatsAppConfig();

    const text = opts.approved
        ? `Tu historial del dominio *${opts.plate}* fue autorizado y enviado a *${opts.email}*.\n` +
          `Revisá tu casilla (y spam).`
        : `Tu solicitud de historial del dominio *${opts.plate}* no pudo ser autorizada` +
          (opts.reason ? ` (${opts.reason})` : '') +
          `.\nSi necesitás ayuda, escribinos.`;

    const textResult = await sendTextMessage(opts.toWaId, text);
    if (textResult.ok) return textResult;

    return opts.approved
        ? sendTemplateMessage(opts.toWaId, templateHistorialAprobado, templateLanguage, [
              opts.plate,
              opts.email || '',
          ])
        : sendTemplateMessage(opts.toWaId, templateHistorialRechazado, templateLanguage, [
              opts.plate,
              opts.reason || 'sin motivo especificado',
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
