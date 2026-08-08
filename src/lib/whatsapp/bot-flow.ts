import prisma from '../../../lib/prisma';
import { Prisma } from '../../../generated/prisma';
import { findCarIdByNormalizedPlateExact } from '../../../lib/plate-search';
import { validateNewLicensePlate } from '../../../lib/utils';
import {
    checkSlotWithinSchedule,
    describeDayHours,
    describeSchedule,
    getWorkshopSchedule,
    isWorkingDay,
    pluralWeekday,
} from '../workshop-schedule';
import { WHATSAPP_BOT_EMAIL } from './config';
import { notifyAppointmentConfirmed, sendTextMessage, SLOT_BUTTON_PREFIX } from './meta-client';
import {
    combineDateAndTime,
    formatDateTimeEsAr,
    formatMetaRecipientWaId,
    normalizeWaId,
    parseClientDate,
    parseClientTime,
    startOfDay,
} from './phone';

type IncomingMessage = {
    from: string;
    text: string;
    buttonId?: string;
};

/** Timeout de inactividad del FSM (drafts). No crea ni deja turnos colgados. */
const CONVERSATION_IDLE_MS = 30 * 60 * 1000;

const DATE_HINT =
    'Podés escribirlo como *9/8*, *9 de agosto*, o simplemente *hoy* o *mañana*.';

const TIME_HINT = 'Escribila como *16* (4 de la tarde), *16:30* o *9 de la mañana*.';

const CHANGE_DATE_WORDS = new Set([
    'cambiar fecha',
    'cambiar dia',
    'cambiar día',
    'otro dia',
    'otro día',
    'cambiar el dia',
    'cambiar el día',
]);

const HELP_HINT =
    `Podés escribir:\n` +
    `• *turno* — pedir un turno\n` +
    `• *reiniciar* — empezar de cero (borra el pedido a medias)\n` +
    `• *cancelar* — cancelar un turno pendiente o confirmado\n` +
    `• *ayuda* — ver estas opciones`;

const RESTART_WORDS = new Set([
    'reiniciar',
    'reset',
    'empezar',
    'empezar de nuevo',
    'comienzo',
    'menu',
    'menú',
]);

const START_WORDS = new Set(['turno', 'hola', 'buenas', 'buen dia', 'buen día', 'hello', 'hi']);

const CANCEL_WORDS = new Set(['cancelar', 'cancelar turno', 'anular', 'anular turno']);

const HELP_WORDS = new Set(['ayuda', 'help', 'opciones', '?']);

async function getOrCreateBotUserId(): Promise<string> {
    const existing = await prisma.user.findUnique({
        where: { email: WHATSAPP_BOT_EMAIL },
        select: { id: true },
    });
    if (existing) return existing.id;

    const created = await prisma.user.create({
        data: {
            email: WHATSAPP_BOT_EMAIL,
            name: 'WhatsApp Bot',
            role: 'VIEWER',
        },
        select: { id: true },
    });
    return created.id;
}

/** Variantes 549… / 54… para identificar al mismo cliente argentino. */
function waIdLookupVariants(waId: string): string[] {
    const normalized = normalizeWaId(waId) || waId;
    const recipient = formatMetaRecipientWaId(normalized);
    return Array.from(new Set([normalized, recipient, waId].filter(Boolean)));
}

async function getOrCreateConversation(waId: string) {
    return prisma.whatsAppConversation.upsert({
        where: { waId },
        create: { waId, step: 'IDLE' },
        update: {},
    });
}

async function clearDrafts(waId: string) {
    await prisma.whatsAppConversation.update({
        where: { waId },
        data: {
            step: 'IDLE',
            draftName: null,
            draftIssue: null,
            draftPlate: null,
            draftCarId: null,
            draftStartsAt: null,
        },
    });
}

/**
 * Cierra conversaciones incompletas por inactividad.
 * Solo limpia drafts: nunca borra Appointment ya creados.
 */
async function expireStaleConversations(): Promise<number> {
    const cutoff = new Date(Date.now() - CONVERSATION_IDLE_MS);
    const result = await prisma.whatsAppConversation.updateMany({
        where: {
            step: { not: 'IDLE' },
            updatedAt: { lt: cutoff },
        },
        data: {
            step: 'IDLE',
            draftName: null,
            draftIssue: null,
            draftPlate: null,
            draftCarId: null,
            draftStartsAt: null,
        },
    });
    return result.count;
}

async function expireConversationIfStale(
    waId: string,
    updatedAt: Date,
    step: string
): Promise<boolean> {
    if (step === 'IDLE') return false;
    if (Date.now() - updatedAt.getTime() < CONVERSATION_IDLE_MS) return false;

    await clearDrafts(waId);
    await sendTextMessage(
        waId,
        `Se cerró el pedido a medias por falta de respuesta (más de 30 minutos).\n` +
            `No se generó ningún turno.\n\n` +
            `Escribí *turno* cuando quieras empezar de nuevo.`
    );
    return true;
}

function asProposedSlots(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string');
}

async function getCurrentOwnerName(carId: string): Promise<string | null> {
    const ownership = await prisma.carOwnership.findFirst({
        where: { carId, endDate: null },
        select: {
            client: { select: { firstName: true, lastName: true } },
        },
        orderBy: { startDate: 'desc' },
    });
    if (!ownership) return null;
    const name = `${ownership.client.firstName} ${ownership.client.lastName}`.trim();
    return name || null;
}

async function findClientAppointments(waId: string) {
    const variants = waIdLookupVariants(waId);
    return prisma.appointment.findMany({
        where: {
            status: { in: ['PENDIENTE', 'PROPUESTA_ENVIADA', 'CONFIRMADO'] },
            OR: [
                { whatsappWaId: { in: variants } },
                { clientPhone: { in: variants } },
            ],
        },
        orderBy: { startsAt: 'asc' },
        select: {
            id: true,
            startsAt: true,
            status: true,
            licensePlate: true,
            clientName: true,
            clientPhone: true,
            whatsappWaId: true,
        },
    });
}

/** Cancelar turno existente identificado por el teléfono del chat. */
async function tryHandleCancel(waId: string, text: string): Promise<boolean> {
    const lower = text.toLowerCase().trim();
    if (!CANCEL_WORDS.has(lower) && !/^cancelar\s+\d+$/i.test(lower)) {
        return false;
    }

    const appointments = await findClientAppointments(waId);
    if (appointments.length === 0) {
        await sendTextMessage(
            waId,
            `No encontré turnos activos asociados a este número.\n` +
                `Si pediste turno, debe estar a nombre de este WhatsApp.\n\n${HELP_HINT}`
        );
        return true;
    }

    const pickMatch = lower.match(/^cancelar\s+(\d+)$/);
    if (pickMatch) {
        const idx = parseInt(pickMatch[1], 10) - 1;
        if (idx < 0 || idx >= appointments.length) {
            await sendTextMessage(waId, `Número inválido. Usá *cancelar 1*, *cancelar 2*, etc.`);
            return true;
        }
        const ap = appointments[idx];
        await prisma.appointment.delete({ where: { id: ap.id } });
        await clearDrafts(waId);
        const { full } = formatDateTimeEsAr(ap.startsAt);
        await sendTextMessage(
            waId,
            `Listo. Cancelamos el turno de *${full}*` +
                (ap.licensePlate ? ` (dominio ${ap.licensePlate})` : '') +
                `.\n\nEscribí *turno* si querés pedir otro.`
        );
        return true;
    }

    if (appointments.length === 1) {
        const ap = appointments[0];
        await prisma.appointment.delete({ where: { id: ap.id } });
        await clearDrafts(waId);
        const { full } = formatDateTimeEsAr(ap.startsAt);
        await sendTextMessage(
            waId,
            `Listo. Cancelamos tu turno de *${full}*` +
                (ap.licensePlate ? ` (dominio ${ap.licensePlate})` : '') +
                `.\n\nEscribí *turno* si querés pedir otro.`
        );
        return true;
    }

    const lines = appointments.map((ap, i) => {
        const { full } = formatDateTimeEsAr(ap.startsAt);
        const plate = ap.licensePlate ? ` · ${ap.licensePlate}` : '';
        return `${i + 1}) ${full}${plate} (${ap.status.toLowerCase()})`;
    });
    await sendTextMessage(
        waId,
        `Tenés más de un turno. Respondé *cancelar N* con el número:\n\n${lines.join('\n')}`
    );
    return true;
}

/** Si hay propuesta pendiente, el cliente toca un botón o responde 1/2/3. */
async function tryHandleProposalChoice(
    waId: string,
    text: string,
    buttonId?: string
): Promise<boolean> {
    const variants = waIdLookupVariants(waId);
    const pending = await prisma.appointment.findFirst({
        where: {
            status: 'PROPUESTA_ENVIADA',
            OR: [
                { whatsappWaId: { in: variants } },
                { clientPhone: { in: variants } },
            ],
        },
        orderBy: { updatedAt: 'desc' },
    });
    if (!pending) return false;

    const slots = asProposedSlots(pending.proposedSlots);
    if (slots.length === 0) return false;

    // El botón trae el índice exacto; el texto suelto solo se usa como respaldo.
    const buttonMatch = buttonId?.startsWith(SLOT_BUTTON_PREFIX)
        ? buttonId.slice(SLOT_BUTTON_PREFIX.length)
        : null;
    const choice = buttonMatch ?? text.trim().match(/^[1-3]$/)?.[0];

    if (choice === undefined || choice === null) {
        // Si quiere reiniciar/cancelar, no bloquear el flujo de propuesta
        const lower = text.toLowerCase().trim();
        if (
            RESTART_WORDS.has(lower) ||
            CANCEL_WORDS.has(lower) ||
            START_WORDS.has(lower) ||
            HELP_WORDS.has(lower)
        ) {
            return false;
        }
        await sendTextMessage(
            waId,
            `Para elegir un horario, tocá uno de los botones que te enviamos.\n` +
                `Si no te aparecen, respondé con el número de la opción (1${slots.length > 1 ? ` a ${slots.length}` : ''}).\n` +
                `También podés escribir *cancelar* o *reiniciar*.`
        );
        return true;
    }

    const index = buttonMatch !== null ? parseInt(choice, 10) : parseInt(choice, 10) - 1;
    if (Number.isNaN(index) || index < 0 || index >= slots.length) {
        await sendTextMessage(waId, `Esa opción no está disponible. Elegí entre 1 y ${slots.length}.`);
        return true;
    }

    const startsAt = new Date(slots[index]);
    if (Number.isNaN(startsAt.getTime())) {
        await sendTextMessage(waId, 'Esa opción ya no es válida. Escribí *turno* para pedir uno nuevo.');
        return true;
    }

    const updated = await prisma.appointment.update({
        where: { id: pending.id },
        data: {
            startsAt,
            status: 'CONFIRMADO',
            proposedSlots: Prisma.DbNull,
            // Asegurar teléfono capturado para futuras cancelaciones
            whatsappWaId: pending.whatsappWaId || waId,
            clientPhone: pending.clientPhone || normalizeWaId(waId) || waId,
        },
    });

    await notifyAppointmentConfirmed({
        toWaId: waId,
        clientName: updated.clientName,
        startsAt: updated.startsAt,
    });

    await clearDrafts(waId);
    return true;
}

async function askForDate(waId: string, prefix?: string) {
    const schedule = await getWorkshopSchedule();
    await prisma.whatsAppConversation.update({
        where: { waId },
        data: { step: 'AWAIT_DATE', draftStartsAt: null },
    });
    await sendTextMessage(
        waId,
        `${prefix ? `${prefix}\n\n` : ''}¿Qué *día* querés traer el auto al taller?\n\n` +
            `${describeSchedule(schedule)}\n${DATE_HINT}\n\n` +
            `_Si te equivocaste en algo, escribí *reiniciar*._`
    );
}

async function askForTime(waId: string, day: Date) {
    const schedule = await getWorkshopSchedule();
    const dayLabel = day.toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });
    const hours = describeDayHours(day, schedule);

    await prisma.whatsAppConversation.update({
        where: { waId },
        data: { step: 'AWAIT_TIME', draftStartsAt: day },
    });
    await sendTextMessage(
        waId,
        `Anotado: *${dayLabel}*.\n\n¿A qué *hora* te queda cómodo llegar?\n` +
            `${hours ? `Ese día atendemos *${hours}*.\n` : ''}\n${TIME_HINT}\n\n` +
            `_Si querés otro día, escribí *cambiar fecha*._`
    );
}

async function createPendingFromDraft(waId: string) {
    const conv = await prisma.whatsAppConversation.findUnique({ where: { waId } });
    if (!conv?.draftIssue || !conv.draftPlate || !conv.draftStartsAt || !conv.draftName) {
        await clearDrafts(waId);
        await sendTextMessage(waId, `Faltaban datos del pedido. Escribí *turno* para empezar de nuevo.`);
        return;
    }

    const botId = await getOrCreateBotUserId();
    const phone = normalizeWaId(waId) || waId;

    await prisma.appointment.create({
        data: {
            startsAt: conv.draftStartsAt,
            clientName: conv.draftName,
            // Teléfono siempre capturado: identifica al cliente para cancelar / notificar
            clientPhone: phone,
            notes: conv.draftIssue,
            licensePlate: conv.draftPlate,
            carId: conv.draftCarId || null,
            status: 'PENDIENTE',
            source: 'WHATSAPP',
            whatsappWaId: waId,
            createdById: botId,
        },
    });

    // Draft descartado al instante: no quedan conversaciones a medias con turno ya creado
    await clearDrafts(waId);

    const { full } = formatDateTimeEsAr(conv.draftStartsAt);
    await sendTextMessage(
        waId,
        `¡Listo ${conv.draftName}! Registramos tu *pedido de turno*:\n` +
            `• Teléfono: *${phone}*\n` +
            `• Dominio: *${conv.draftPlate}*\n` +
            `• Avería: ${conv.draftIssue}\n` +
            `• Llegada: *${full}*\n\n` +
            `Quedó *pendiente de confirmación* del taller. Te avisamos por este chat cuando se confirme.\n` +
            `Si necesitás cancelarlo, escribí *cancelar*.`
    );
}

/**
 * FSM: IDLE → AWAIT_ISSUE → AWAIT_PLATE → [AWAIT_NAME] → AWAIT_DATE → AWAIT_TIME → crea PENDIENTE
 *
 * Reglas anti-datos colgados:
 * - Appointment solo se crea al final (drafts descartables).
 * - Timeout 30' limpia solo drafts.
 * - reiniciar limpia drafts sin tocar turnos ya creados.
 * - cancelar elimina turnos activos de ese WhatsApp.
 */
export async function handleIncomingWhatsAppMessage(msg: IncomingMessage): Promise<void> {
    const waId = normalizeWaId(msg.from) || msg.from;
    const text = (msg.text || msg.buttonId || '').trim();
    if (!text) return;

    // Limpieza oportunista de conversaciones abandonadas (sin cron)
    await expireStaleConversations();

    const lower = text.toLowerCase().trim();

    if (HELP_WORDS.has(lower)) {
        await sendTextMessage(waId, HELP_HINT);
        return;
    }

    if (await tryHandleCancel(waId, text)) {
        return;
    }

    if (await tryHandleProposalChoice(waId, text, msg.buttonId)) {
        return;
    }

    let conv = await getOrCreateConversation(waId);

    if (await expireConversationIfStale(waId, conv.updatedAt, conv.step)) {
        // Si además pidió empezar, continuar abajo con flow fresco
        if (!START_WORDS.has(lower)) return;
        conv = await getOrCreateConversation(waId);
    }

    // Reinicio explícito: descarta drafts, NO borra turnos ya creados
    if (RESTART_WORDS.has(lower)) {
        await clearDrafts(waId);
        await sendTextMessage(
            waId,
            `Listo, reiniciamos. No se guardó ningún pedido a medias.\n\n` +
                `Escribí *turno* para comenzar otra vez.`
        );
        return;
    }

    if (START_WORDS.has(lower) || conv.step === 'IDLE') {
        // Cualquier mensaje en IDLE (o palabra de inicio) arranca pedido limpio
        await clearDrafts(waId);
        await prisma.whatsAppConversation.update({
            where: { waId },
            data: { step: 'AWAIT_ISSUE' },
        });
        await sendTextMessage(
            waId,
            `Hola, soy el asistente de *Nóbile*.\n` +
                `Tu número queda registrado con este chat para avisos y cancelaciones.\n\n` +
                `¿Qué *avería* o trabajo necesita el auto?\n\n` +
                `_Si te equivocás, escribí *reiniciar*._`
        );
        return;
    }

    if (conv.step === 'AWAIT_ISSUE') {
        const issue = text.slice(0, 500);
        await prisma.whatsAppConversation.update({
            where: { waId },
            data: { draftIssue: issue, step: 'AWAIT_PLATE' },
        });
        await sendTextMessage(
            waId,
            `Gracias. Ahora enviá el *dominio* del auto *sin guiones*.\n` +
                `Formatos válidos:\n` +
                `• Viejo: *ABC123*\n` +
                `• Mercosur: *AA123BB*\n\n` +
                `_Si te equivocaste, *reiniciar*._`
        );
        return;
    }

    if (conv.step === 'AWAIT_PLATE') {
        const plateValidation = validateNewLicensePlate(text);
        if (!plateValidation.ok || !plateValidation.plate) {
            await sendTextMessage(
                waId,
                `${plateValidation.message || 'Dominio inválido.'}\n` +
                    `Escribí solo la patente, sin guiones. Ej: *ABC123* o *AA123BB*.\n` +
                    `_O escribí *reiniciar*._`
            );
            return;
        }

        const plate = plateValidation.plate;
        const carId = await findCarIdByNormalizedPlateExact(plate);
        let ownerName: string | null = null;
        if (carId) {
            ownerName = await getCurrentOwnerName(carId);
        }

        await prisma.whatsAppConversation.update({
            where: { waId },
            data: {
                draftPlate: plate,
                draftCarId: carId,
                draftName: ownerName,
            },
        });

        if (carId && ownerName) {
            await sendTextMessage(
                waId,
                `Encontramos el vehículo *${plate}* a nombre de *${ownerName}*.`
            );
            await askForDate(waId);
            return;
        }

        if (carId && !ownerName) {
            await sendTextMessage(
                waId,
                `Encontramos el vehículo *${plate}* en el sistema, pero sin dueño actual cargado.`
            );
        } else {
            await sendTextMessage(
                waId,
                `No tenemos el dominio *${plate}* registrado aún. Igual vamos a crear el pedido de turno con esa patente; ` +
                    `los datos del auto se completan cuando se abra la orden de trabajo.`
            );
        }

        await prisma.whatsAppConversation.update({
            where: { waId },
            data: { step: 'AWAIT_NAME' },
        });
        await sendTextMessage(
            waId,
            `¿Cuál es tu *nombre y apellido*?\n\n_Si te equivocaste, *reiniciar*._`
        );
        return;
    }

    if (conv.step === 'AWAIT_NAME') {
        const name = text.slice(0, 120);
        await prisma.whatsAppConversation.update({
            where: { waId },
            data: { draftName: name },
        });
        await askForDate(waId, `Gracias, ${name.split(' ')[0]}.`);
        return;
    }

    if (conv.step === 'AWAIT_DATE') {
        const now = new Date();
        const day = parseClientDate(text, now);

        if (!day) {
            await sendTextMessage(
                waId,
                `No pude entender esa fecha.\n\n${DATE_HINT}\n\n_O escribí *reiniciar*._`
            );
            return;
        }

        if (day.getTime() < startOfDay(now).getTime()) {
            const todayLabel = now.toLocaleDateString('es-AR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            });
            await sendTextMessage(
                waId,
                `Ese día ya pasó. Hoy es *${todayLabel}*.\n\n` +
                    `Decime un día de hoy en adelante. ${DATE_HINT}`
            );
            return;
        }

        const schedule = await getWorkshopSchedule();
        if (!isWorkingDay(day, schedule)) {
            await sendTextMessage(
                waId,
                `Los *${pluralWeekday(day)}* el taller no atiende.\n\n` +
                    `${describeSchedule(schedule)}\nDecime otro día. ${DATE_HINT}`
            );
            return;
        }

        await askForTime(waId, day);
        return;
    }

    if (conv.step === 'AWAIT_TIME') {
        if (CHANGE_DATE_WORDS.has(lower)) {
            await askForDate(waId, 'Sin problema, cambiemos el día.');
            return;
        }

        if (!conv.draftStartsAt) {
            await askForDate(waId, 'Se perdió el día elegido, lo volvemos a pedir.');
            return;
        }

        const parsed = parseClientTime(text);
        if (!parsed.ok) {
            const message =
                parsed.reason === 'AMBIGUOUS'
                    ? `¿Esa hora es de la mañana o de la tarde?\n\n` +
                      `Escribila en formato de 24 horas (*16* para las 4 de la tarde) ` +
                      `o aclarame, por ejemplo *4 de la tarde*.`
                    : `No pude entender esa hora.\n\n${TIME_HINT}`;
            await sendTextMessage(waId, message);
            return;
        }

        const now = new Date();
        const startsAt = combineDateAndTime(conv.draftStartsAt, parsed.hour, parsed.minute);

        const schedule = await getWorkshopSchedule();
        const slotCheck = checkSlotWithinSchedule(startsAt, schedule);
        if (!slotCheck.ok) {
            await sendTextMessage(
                waId,
                `${slotCheck.message}\n\n` +
                    `Decime otra hora, o escribí *cambiar fecha* para elegir otro día.`
            );
            return;
        }

        if (startsAt.getTime() <= now.getTime()) {
            const nowLabel = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            await sendTextMessage(
                waId,
                `Esa hora ya pasó: ahora son las *${nowLabel}*.\n\n` +
                    `Decime una hora más adelante, o escribí *cambiar fecha* para elegir otro día.`
            );
            return;
        }

        await prisma.whatsAppConversation.update({
            where: { waId },
            data: { draftStartsAt: startsAt },
        });
        await createPendingFromDraft(waId);
        return;
    }

    // Estado desconocido: sanitizar
    await clearDrafts(waId);
    await sendTextMessage(waId, HELP_HINT);
}
