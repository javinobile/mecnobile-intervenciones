import prisma from '../../../lib/prisma';
import { Prisma } from '../../../generated/prisma';
import {
    findFuzzyPlateMatches,
    formatFuzzyPlateMatchLine,
    updateCarLicensePlateCorrected,
    type FuzzyPlateMatch,
} from '../../../lib/plate-fuzzy-match';
import { findCarIdByNormalizedPlateExact } from '../../../lib/plate-search';
import { normalizeLicensePlate, validateNewLicensePlate } from '../../../lib/utils';
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
    buildOtStatusReply,
    findCarsWithOpenOtForWhatsApp,
    formatCarChoiceList,
    type StatusCar,
} from './ot-status';
import {
    createPendingHistoryRequest,
    findCarsWithHistoryForWhatsApp,
    isValidEmail,
} from './car-history-flow';
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

/** Menú global de palabras clave (siempre disponible). */
const HELP_HINT =
    `*Palabras clave*\n` +
    `• *turno* — pedir un turno\n` +
    `• *estado* — cómo va tu auto en el taller\n` +
    `• *historial* — pedir el historial del auto por email\n` +
    `• *cancelar* — cancelar un turno pendiente o confirmado\n` +
    `• *reiniciar* — empezar de cero (borra el pedido a medias)\n` +
    `• *ayuda* — ver este menú`;

/** Pie de mensaje con lo que se puede escribir en el paso actual. */
function stepHint(step: string): string {
    switch (step) {
        case 'AWAIT_ISSUE':
            return (
                `_Ahora: contame la avería o el trabajo.\n` +
                `También: *reiniciar* · *ayuda*_`
            );
        case 'AWAIT_PLATE':
            return (
                `_Ahora: el *dominio* sin guiones (*ABC123* o *AA123BB*).\n` +
                `También: *reiniciar* · *ayuda*_`
            );
        case 'AWAIT_PLATE_CONFIRM':
            return (
                `_Ahora: confirmá si el dominio encontrado es el tuyo (*sí* / *no* o el número de la lista).\n` +
                `También: *reiniciar* · *ayuda*_`
            );
        case 'AWAIT_NAME':
            return (
                `_Ahora: tu *nombre y apellido*.\n` +
                `También: *reiniciar* · *ayuda*_`
            );
        case 'AWAIT_DATE':
            return (
                `_Ahora: el *día* (*hoy*, *mañana*, *15/8*…).\n` +
                `También: *reiniciar* · *ayuda*_`
            );
        case 'AWAIT_TIME':
            return (
                `_Ahora: la *hora* (*16*, *16:30*, *4 de la tarde*…).\n` +
                `También: *cambiar fecha* · *reiniciar* · *ayuda*_`
            );
        case 'AWAIT_STATUS_PLATE':
            return (
                `_Ahora: el *dominio* o el número de la lista (1, 2…).\n` +
                `También: *reiniciar* · *ayuda*_`
            );
        case 'AWAIT_HISTORY_PLATE':
            return (
                `_Ahora: el *dominio* del auto para el historial (o el número de la lista).\n` +
                `También: *reiniciar* · *ayuda*_`
            );
        case 'AWAIT_HISTORY_EMAIL':
            return (
                `_Ahora: el *email* donde querés recibir el PDF.\n` +
                `También: *reiniciar* · *ayuda*_`
            );
        default:
            return `_Escribí *turno*, *estado*, *historial*, *cancelar* o *ayuda*_`;
    }
}

function withStepHint(body: string, step: string): string {
    return `${body.trim()}\n\n${stepHint(step)}`;
}

function helpForStep(step: string): string {
    if (!step || step === 'IDLE') return HELP_HINT;
    return (
        `Estás en medio de una consulta.\n\n` +
        `${stepHint(step)}\n\n` +
        `${HELP_HINT}`
    );
}

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

const YES_WORDS = new Set(['si', 'sí', 'yes', 'ok', 'dale', 'correcto', 'ese', 'es', 'confirmo', 'confirmar']);

const NO_WORDS = new Set(['no', 'nop', 'ninguno', 'ninguna', 'otro', 'otra', 'none']);

/** Consulta de estado de OT (identifica por este WhatsApp). */
const STATUS_WORDS = new Set([
    'estado',
    'estado del auto',
    'estado auto',
    'como va',
    'cómo va',
    'como esta',
    'cómo está',
    'como esta mi auto',
    'cómo está mi auto',
    'como va mi auto',
    'cómo va mi auto',
    'mi auto',
    'consulta',
    'consultar',
]);

const HISTORY_WORDS = new Set([
    'historial',
    'historial del auto',
    'historial auto',
    'pedir historial',
    'solicitar historial',
    'historia del auto',
    'historia',
]);

/** Normaliza texto de WA para keywords (quita *negrita*, signos, acentos). */
function normalizeBotKeyword(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[*_~`•·]+/g, ' ')
        .replace(/[¿?¡!.,;:"'“”‘’]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Detecta pedido de historial: "historial", "*Historial*", "quiero el historial", etc.
 * Opcional: "historial ABC123".
 */
function parseHistoryIntent(text: string): { hit: boolean; plate?: string } {
    const lower = normalizeBotKeyword(text);
    if (!lower) return { hit: false };

    const plateSuffix = lower.match(
        /^(?:historial|historia)(?:\s+del?\s+auto)?\s+([a-z0-9-]{6,10})$/
    );
    if (plateSuffix) return { hit: true, plate: plateSuffix[1] };

    if (HISTORY_WORDS.has(lower)) return { hit: true };

    // Frases naturales / menú copiado
    if (
        /(?:^|\s)(?:el\s+)?historial(?:\s|$)/.test(lower) ||
        /^(?:quiero|pedime|pedir|solicitar|necesito|mandame|manda|envia|enviame)\s+(?:el\s+)?historial/.test(
            lower
        )
    ) {
        return { hit: true };
    }

    return { hit: false };
}

/**
 * Detecta inicio de pedido de turno: "turno", saludos, o frases como
 * "Hola, quiero pedir un turno" (texto del botón de WhatsApp en la web).
 */
function parseTurnoIntent(text: string): boolean {
    const lower = normalizeBotKeyword(text);
    if (!lower) return false;

    if (START_WORDS.has(lower)) return true;

    if (/\b(?:cancelar|anular)\b/.test(lower)) return false;

    if (!/\bturno\b/.test(lower)) return false;

    if (/^(?:hola|buenas|buen dia|hello|hi)\b/.test(lower)) return true;

    if (
        /(?:quiero|quisiera|necesito|pedir|solicitar|reservar|agendar|sacar|hacer)\b/.test(
            lower
        )
    ) {
        return true;
    }

    return false;
}

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
            `${HELP_HINT}`
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

async function proceedAfterPlateResolved(
    waId: string,
    plate: string,
    carId: string | null,
    ownerName: string | null,
    introMessage?: string
) {
    await prisma.whatsAppConversation.update({
        where: { waId },
        data: {
            draftPlate: plate,
            draftCarId: carId,
            draftName: ownerName,
        },
    });

    if (carId && ownerName) {
        if (introMessage) {
            await sendTextMessage(waId, introMessage);
        } else {
            await sendTextMessage(
                waId,
                `Encontramos el vehículo *${plate}* a nombre de *${ownerName}*.`
            );
        }
        await askForDate(waId);
        return;
    }

    if (carId && !ownerName) {
        await sendTextMessage(
            waId,
            introMessage ||
                `Encontramos el vehículo *${plate}* en el sistema, pero sin dueño actual cargado.`
        );
    } else {
        await sendTextMessage(
            waId,
            introMessage ||
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
        withStepHint(`¿Cuál es tu *nombre y apellido*?`, 'AWAIT_NAME')
    );
}

const PLATE_MIGRATION_NOTE =
    `_Estamos actualizando los datos del taller al sistema nuevo; por eso a veces la patente puede figurar distinta. ` +
    `Con tu confirmación la corregimos en el acto._`;

async function askPlateConfirm(waId: string, plate: string, matches: FuzzyPlateMatch[]) {
    await prisma.whatsAppConversation.update({
        where: { waId },
        data: {
            draftPlate: plate,
            draftCarId: null,
            draftName: null,
            step: 'AWAIT_PLATE_CONFIRM',
        },
    });

    if (matches.length === 1) {
        const match = matches[0];
        const vehicle = [match.make, match.model].filter(Boolean).join(' ') || 'vehículo';
        const owner = match.ownerName ? ` a nombre de *${match.ownerName}*` : '';
        await sendTextMessage(
            waId,
            withStepHint(
                `${PLATE_MIGRATION_NOTE}\n\n` +
                    `Escribiste *${plate}*. En el sistema figura *${match.storedPlate}* (${vehicle}${owner}).\n\n` +
                    `¿Es tu auto? Respondé *sí* para confirmar (actualizamos el dominio a *${plate}*) ` +
                    `o *no* para continuar como patente nueva.`,
                'AWAIT_PLATE_CONFIRM'
            )
        );
        return;
    }

    const list = matches.map((match, index) => formatFuzzyPlateMatchLine(index, match)).join('\n');
    await sendTextMessage(
        waId,
        withStepHint(
            `${PLATE_MIGRATION_NOTE}\n\n` +
                `No tenemos *${plate}* exacto, pero encontramos dominios parecidos:\n\n` +
                `${list}\n\n` +
                `¿Cuál es el tuyo? Escribí el *número* o el dominio.\n` +
                `Si ninguno coincide, escribí *ninguno*.`,
            'AWAIT_PLATE_CONFIRM'
        )
    );
}

async function confirmPlateMatchAndContinue(
    waId: string,
    match: FuzzyPlateMatch,
    correctedPlate: string
) {
    const update = await updateCarLicensePlateCorrected(match.carId, correctedPlate);
    if (!update.ok) {
        await sendTextMessage(
            waId,
            `${update.message} Continuamos con el dominio que escribiste.`
        );
        const ownerName = match.ownerName ?? (await getCurrentOwnerName(match.carId));
        await proceedAfterPlateResolved(waId, correctedPlate, match.carId, ownerName);
        return;
    }

    const ownerName = match.ownerName ?? (await getCurrentOwnerName(match.carId));
    await proceedAfterPlateResolved(
        waId,
        correctedPlate,
        match.carId,
        ownerName,
        `Perfecto, actualizamos el dominio a *${correctedPlate}*.`
    );
}

async function proceedAsNewPlate(waId: string, plate: string) {
    await proceedAfterPlateResolved(waId, plate, null, null);
}

async function handleAwaitPlateConfirm(waId: string, text: string): Promise<void> {
    const conv = await prisma.whatsAppConversation.findUnique({ where: { waId } });
    if (!conv?.draftPlate) {
        await clearDrafts(waId);
        await sendTextMessage(
            waId,
            `Se perdió el dominio del pedido.\n\n${HELP_HINT}`
        );
        return;
    }

    const plate = conv.draftPlate;
    const keyword = normalizeBotKeyword(text);
    const matches = await findFuzzyPlateMatches(plate);

    if (!matches.length) {
        await proceedAsNewPlate(waId, plate);
        return;
    }

    if (NO_WORDS.has(keyword)) {
        await proceedAsNewPlate(waId, plate);
        return;
    }

    if (matches.length === 1 && YES_WORDS.has(keyword)) {
        await confirmPlateMatchAndContinue(waId, matches[0], plate);
        return;
    }

    const indexMatch = text.trim().match(/^(\d+)$/);
    if (indexMatch) {
        const idx = parseInt(indexMatch[1], 10) - 1;
        if (idx >= 0 && idx < matches.length) {
            await confirmPlateMatchAndContinue(waId, matches[idx], plate);
            return;
        }
        await sendTextMessage(
            waId,
            withStepHint(
                `Número inválido. Elegí del 1 al ${matches.length}, o escribí *ninguno*.`,
                'AWAIT_PLATE_CONFIRM'
            )
        );
        return;
    }

    const byPlate = matches.find(
        (match) => normalizeLicensePlate(match.storedPlate) === normalizeLicensePlate(text)
    );
    if (byPlate) {
        await confirmPlateMatchAndContinue(waId, byPlate, plate);
        return;
    }

    if (matches.length === 1) {
        await sendTextMessage(
            waId,
            withStepHint(
                `Respondé *sí* si es tu auto, o *no* para continuar con *${plate}* como patente nueva.`,
                'AWAIT_PLATE_CONFIRM'
            )
        );
        return;
    }

    await sendTextMessage(
        waId,
        withStepHint(
            `Elegí un número del 1 al ${matches.length}, escribí el dominio de la lista, o *ninguno*.`,
            'AWAIT_PLATE_CONFIRM'
        )
    );
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

function pickStatusCarByPlate(cars: StatusCar[], plateRaw: string): StatusCar | null {
    const normalized = normalizeLicensePlate(plateRaw);
    if (!normalized) return null;
    return (
        cars.find((c) => normalizeLicensePlate(c.licensePlate) === normalized) ?? null
    );
}

async function sendOtStatusForCar(waId: string, car: StatusCar) {
    await clearDrafts(waId);
    const reply = await buildOtStatusReply(car);
    await sendTextMessage(
        waId,
        `${reply}\n\n` +
            `_Si necesitás otra cosa: *turno* · *estado* · *cancelar* · *ayuda*_`
    );
}

/**
 * Estado del auto: WhatsApp del chat → solo autos con OT ABIERTA.
 * Si hay más de uno con OT abierta, pide el dominio.
 */
async function tryHandleStatus(waId: string, text: string): Promise<boolean> {
    const lower = text.toLowerCase().trim();
    // Acepta dominio con o sin guiones: estado JSB555 / estado JSB-555
    const plateSuffix = lower.match(/^(?:estado|consultar?)\s+([a-z0-9-]{6,10})$/i);

    if (!STATUS_WORDS.has(lower) && !plateSuffix) {
        return false;
    }

    const cars = await findCarsWithOpenOtForWhatsApp(waId);
    if (cars.length === 0) {
        await clearDrafts(waId);
        await sendTextMessage(
            waId,
            `No encontré *órdenes abiertas* asociadas a este número.\n` +
                `Tiene que ser el WhatsApp del cliente cargado en el taller, ` +
                `y el auto tiene que tener una OT *ABIERTA*.\n\n${HELP_HINT}`
        );
        return true;
    }

    if (plateSuffix) {
        const car = pickStatusCarByPlate(cars, plateSuffix[1]);
        if (!car) {
            await sendTextMessage(
                waId,
                `Ese dominio no tiene OT abierta con este número.\n` +
                    `Autos en taller ahora:\n${formatCarChoiceList(cars)}\n\n` +
                    withStepHint(
                        `Escribí el *dominio* o *estado AA123BB*.`,
                        'AWAIT_STATUS_PLATE'
                    )
            );
            return true;
        }
        await sendOtStatusForCar(waId, car);
        return true;
    }

    if (cars.length === 1) {
        await sendOtStatusForCar(waId, cars[0]);
        return true;
    }

    await prisma.whatsAppConversation.upsert({
        where: { waId },
        create: { waId, step: 'AWAIT_STATUS_PLATE' },
        update: {
            step: 'AWAIT_STATUS_PLATE',
            draftName: null,
            draftIssue: null,
            draftPlate: null,
            draftCarId: null,
            draftStartsAt: null,
        },
    });

    await sendTextMessage(
        waId,
        withStepHint(
            `Tenés *más de un auto con OT abierta* en este número.\n` +
                `¿De cuál querés el estado? Escribí el *dominio* o el número:\n\n` +
                `${formatCarChoiceList(cars)}`,
            'AWAIT_STATUS_PLATE'
        )
    );
    return true;
}

async function handleAwaitStatusPlate(waId: string, text: string): Promise<void> {
    const cars = await findCarsWithOpenOtForWhatsApp(waId);
    if (cars.length === 0) {
        await clearDrafts(waId);
        await sendTextMessage(
            waId,
            `No encontré órdenes abiertas asociadas a este número.\n\n${HELP_HINT}`
        );
        return;
    }

    const indexMatch = text.trim().match(/^(\d+)$/);
    if (indexMatch) {
        const idx = parseInt(indexMatch[1], 10) - 1;
        if (idx >= 0 && idx < cars.length) {
            await sendOtStatusForCar(waId, cars[idx]);
            return;
        }
        await sendTextMessage(
            waId,
            withStepHint(
                `Número inválido. Elegí del 1 al ${cars.length}, o escribí el dominio.`,
                'AWAIT_STATUS_PLATE'
            )
        );
        return;
    }

    const plate = normalizeLicensePlate(text);
    const car = pickStatusCarByPlate(cars, plate);
    if (!car) {
        await sendTextMessage(
            waId,
            withStepHint(
                `No entendí ese dominio.\n` +
                    `Autos en taller:\n${formatCarChoiceList(cars)}`,
                'AWAIT_STATUS_PLATE'
            )
        );
        return;
    }

    await sendOtStatusForCar(waId, car);
}

async function askHistoryEmail(waId: string, car: StatusCar) {
    await prisma.whatsAppConversation.upsert({
        where: { waId },
        create: {
            waId,
            step: 'AWAIT_HISTORY_EMAIL',
            draftCarId: car.id,
            draftPlate: car.licensePlate,
        },
        update: {
            step: 'AWAIT_HISTORY_EMAIL',
            draftCarId: car.id,
            draftPlate: car.licensePlate,
            draftName: null,
            draftIssue: null,
            draftStartsAt: null,
        },
    });
    await sendTextMessage(
        waId,
        withStepHint(
            `Perfecto: historial de *${car.licensePlate}*.\n\n` +
                `Un *administrador* del taller tiene que autorizar el envío.\n` +
                `¿A qué *email* te lo mandamos? (ese mail queda registrado en tu ficha de cliente)`,
            'AWAIT_HISTORY_EMAIL'
        )
    );
}

/**
 * Historial del auto: WhatsApp → autos del teléfono → (placa si hay varios) → email → PENDIENTE.
 */
async function tryHandleHistory(waId: string, text: string): Promise<boolean> {
    const intent = parseHistoryIntent(text);
    if (!intent.hit) {
        return false;
    }

    // Busca autos asociados a este WhatsApp (dueño / OT / turnos) con historial de taller
    const cars = await findCarsWithHistoryForWhatsApp(waId);
    if (cars.length === 0) {
        await clearDrafts(waId);
        await sendTextMessage(
            waId,
            `No encontré *autos con historial* asociados a este WhatsApp.\n` +
                `Tiene que ser el número del cliente en el taller, y el auto tiene que tener OT abierta o cerrada.\n\n` +
                `${HELP_HINT}`
        );
        return true;
    }

    if (intent.plate) {
        const car = pickStatusCarByPlate(cars, intent.plate);
        if (!car) {
            await sendTextMessage(
                waId,
                withStepHint(
                    `Ese dominio no tiene historial con este número.\n` +
                        `Tus autos:\n${formatCarChoiceList(cars)}`,
                    'AWAIT_HISTORY_PLATE'
                )
            );
            return true;
        }
        await askHistoryEmail(waId, car);
        return true;
    }

    if (cars.length === 1) {
        await askHistoryEmail(waId, cars[0]);
        return true;
    }

    await prisma.whatsAppConversation.upsert({
        where: { waId },
        create: { waId, step: 'AWAIT_HISTORY_PLATE' },
        update: {
            step: 'AWAIT_HISTORY_PLATE',
            draftName: null,
            draftIssue: null,
            draftPlate: null,
            draftCarId: null,
            draftStartsAt: null,
        },
    });

    await sendTextMessage(
        waId,
        withStepHint(
            `Tenés *${cars.length}* autos asociados a este número.\n` +
                `¿De cuál querés el historial? Escribí el *dominio* o el número de la lista:\n\n` +
                `${formatCarChoiceList(cars)}`,
            'AWAIT_HISTORY_PLATE'
        )
    );
    return true;
}

async function handleAwaitHistoryPlate(waId: string, text: string): Promise<void> {
    const cars = await findCarsWithHistoryForWhatsApp(waId);
    if (cars.length === 0) {
        await clearDrafts(waId);
        await sendTextMessage(waId, `No encontré historial para este número.\n\n${HELP_HINT}`);
        return;
    }

    const indexMatch = text.trim().match(/^(\d+)$/);
    if (indexMatch) {
        const idx = parseInt(indexMatch[1], 10) - 1;
        if (idx >= 0 && idx < cars.length) {
            await askHistoryEmail(waId, cars[idx]);
            return;
        }
        await sendTextMessage(
            waId,
            withStepHint(
                `Número inválido. Elegí del 1 al ${cars.length}, o escribí el dominio.`,
                'AWAIT_HISTORY_PLATE'
            )
        );
        return;
    }

    const car = pickStatusCarByPlate(cars, normalizeLicensePlate(text));
    if (!car) {
        await sendTextMessage(
            waId,
            withStepHint(
                `No entendí ese dominio.\nAutos:\n${formatCarChoiceList(cars)}`,
                'AWAIT_HISTORY_PLATE'
            )
        );
        return;
    }
    await askHistoryEmail(waId, car);
}

async function handleAwaitHistoryEmail(waId: string, text: string): Promise<void> {
    const conv = await prisma.whatsAppConversation.findUnique({ where: { waId } });
    if (!conv?.draftCarId) {
        await clearDrafts(waId);
        await sendTextMessage(waId, `Se perdió el auto elegido.\n\n${HELP_HINT}`);
        return;
    }

    if (!isValidEmail(text)) {
        await sendTextMessage(
            waId,
            withStepHint(
                `Ese email no parece válido. Ejemplo: *juan@correo.com*`,
                'AWAIT_HISTORY_EMAIL'
            )
        );
        return;
    }

    const result = await createPendingHistoryRequest({
        waId,
        carId: conv.draftCarId,
        email: text,
    });

    await clearDrafts(waId);

    if (!result.ok) {
        await sendTextMessage(waId, `${result.message}\n\n${HELP_HINT}`);
        return;
    }

    await sendTextMessage(
        waId,
        `Listo. Pedimos el historial de *${result.plate}* para *${text.trim().toLowerCase()}*.\n\n` +
            `Quedó *pendiente de autorización* de un administrador del taller.\n` +
            `Cuando lo aprueben, te llega el PDF a ese correo y te avisamos por este chat.\n\n` +
            `${HELP_HINT}`
    );
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
            await sendTextMessage(
                waId,
                `Número inválido. Usá *cancelar 1*, *cancelar 2*, etc.\n\n` +
                    `_También: *ayuda*_`
            );
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
                `.\n\n${HELP_HINT}`
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
                `.\n\n${HELP_HINT}`
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
        `Tenés más de un turno. Respondé *cancelar N* con el número:\n\n` +
            `${lines.join('\n')}\n\n` +
            `_También: *reiniciar* · *ayuda*_`
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
            HELP_WORDS.has(lower) ||
            STATUS_WORDS.has(lower) ||
            parseHistoryIntent(text).hit
        ) {
            return false;
        }
        await sendTextMessage(
            waId,
            `Para elegir un horario, tocá uno de los botones que te enviamos.\n` +
                `Si no te aparecen, respondé con el número de la opción (1${slots.length > 1 ? ` a ${slots.length}` : ''}).\n\n` +
                `_También: *cancelar* · *reiniciar* · *ayuda*_`
        );
        return true;
    }

    const index = buttonMatch !== null ? parseInt(choice, 10) : parseInt(choice, 10) - 1;
    if (Number.isNaN(index) || index < 0 || index >= slots.length) {
        await sendTextMessage(
            waId,
            `Esa opción no está disponible. Elegí entre 1 y ${slots.length}.\n\n` +
                `_También: *cancelar* · *ayuda*_`
        );
        return true;
    }

    const startsAt = new Date(slots[index]);
    if (Number.isNaN(startsAt.getTime())) {
        await sendTextMessage(
            waId,
            `Esa opción ya no es válida.\n\n${HELP_HINT}`
        );
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
        withStepHint(
            `${prefix ? `${prefix}\n\n` : ''}¿Qué *día* querés traer el auto al taller?\n\n` +
                `${describeSchedule(schedule)}\n${DATE_HINT}`,
            'AWAIT_DATE'
        )
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
        withStepHint(
            `Anotado: *${dayLabel}*.\n\n¿A qué *hora* te queda cómodo llegar?\n` +
                `${hours ? `Ese día atendemos *${hours}*.\n` : ''}\n${TIME_HINT}`,
            'AWAIT_TIME'
        )
    );
}

async function createPendingFromDraft(waId: string) {
    const conv = await prisma.whatsAppConversation.findUnique({ where: { waId } });
    if (!conv?.draftIssue || !conv.draftPlate || !conv.draftStartsAt || !conv.draftName) {
        await clearDrafts(waId);
        await sendTextMessage(
            waId,
            `Faltaban datos del pedido.\n\n${HELP_HINT}`
        );
        return;
    }

    const botId = await getOrCreateBotUserId();
    const phone = normalizeWaId(waId) || waId;

    await prisma.appointment.create({
        data: {
            startsAt: conv.draftStartsAt,
            clientName: conv.draftName,
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

    await clearDrafts(waId);

    const { full } = formatDateTimeEsAr(conv.draftStartsAt);
    await sendTextMessage(
        waId,
        `¡Listo ${conv.draftName}! Registramos tu *pedido de turno*:\n` +
            `• Teléfono: *${phone}*\n` +
            `• Dominio: *${conv.draftPlate}*\n` +
            `• Avería: ${conv.draftIssue}\n` +
            `• Llegada: *${full}*\n\n` +
            `Quedó *pendiente de confirmación* del taller. Te avisamos por este chat cuando se confirme.\n\n` +
            `${HELP_HINT}`
    );
}

/**
 * FSM: IDLE → AWAIT_ISSUE → AWAIT_PLATE → [AWAIT_PLATE_CONFIRM] → [AWAIT_NAME] → AWAIT_DATE → AWAIT_TIME → crea PENDIENTE
 * Consulta: *estado* → (AWAIT_STATUS_PLATE si hay varios autos) → reporte OT abierta
 *
 * Reglas anti-datos colgados:
 * - Appointment solo se crea al final (drafts descartables).
 * - Timeout 30' limpia solo drafts.
 * - reiniciar limpia drafts sin tocar turnos ya creados.
 * - cancelar elimina turnos activos de ese WhatsApp.
 * - estado identifica por este WhatsApp; si hay varios autos, pide dominio.
 */
export async function handleIncomingWhatsAppMessage(msg: IncomingMessage): Promise<void> {
    const waId = normalizeWaId(msg.from) || msg.from;
    const text = (msg.text || msg.buttonId || '').trim();
    if (!text) return;

    // Limpieza oportunista de conversaciones abandonadas (sin cron)
    await expireStaleConversations();

    const lower = text.toLowerCase().trim();

    // *ayuda* con contexto del paso actual (si hay conversación a medias)
    if (HELP_WORDS.has(lower)) {
        const convForHelp = await getOrCreateConversation(waId);
        await sendTextMessage(waId, helpForStep(convForHelp.step));
        return;
    }

    if (await tryHandleCancel(waId, text)) {
        return;
    }

    if (await tryHandleStatus(waId, text)) {
        return;
    }

    if (await tryHandleHistory(waId, text)) {
        return;
    }

    if (await tryHandleProposalChoice(waId, text, msg.buttonId)) {
        return;
    }

    let conv = await getOrCreateConversation(waId);

    if (await expireConversationIfStale(waId, conv.updatedAt, conv.step)) {
        // Si además pidió empezar, continuar abajo con flow fresco
        if (!parseTurnoIntent(text)) return;
        conv = await getOrCreateConversation(waId);
    }

    // Reinicio explícito: descarta drafts, NO borra turnos ya creados
    if (RESTART_WORDS.has(lower)) {
        await clearDrafts(waId);
        await sendTextMessage(
            waId,
            `Listo, reiniciamos. No se guardó ningún pedido a medias.\n\n` +
                `${HELP_HINT}`
        );
        return;
    }

    if (conv.step === 'AWAIT_STATUS_PLATE') {
        await handleAwaitStatusPlate(waId, text);
        return;
    }

    if (conv.step === 'AWAIT_HISTORY_PLATE') {
        await handleAwaitHistoryPlate(waId, text);
        return;
    }

    if (conv.step === 'AWAIT_HISTORY_EMAIL') {
        await handleAwaitHistoryEmail(waId, text);
        return;
    }

    if (conv.step === 'AWAIT_PLATE_CONFIRM') {
        await handleAwaitPlateConfirm(waId, text);
        return;
    }

    // *turno* / saludo / frases naturales arrancan el pedido. En IDLE, si no se entiende → menú.
    if (parseTurnoIntent(text)) {
        await clearDrafts(waId);
        await prisma.whatsAppConversation.update({
            where: { waId },
            data: { step: 'AWAIT_ISSUE' },
        });
        await sendTextMessage(
            waId,
            withStepHint(
                `Hola, soy el asistente de *Nóbile*.\n` +
                    `Tu número queda registrado con este chat para avisos y cancelaciones.\n\n` +
                    `${HELP_HINT}\n\n` +
                    `¿Qué *avería* o trabajo necesita el auto?`,
                'AWAIT_ISSUE'
            )
        );
        return;
    }

    if (conv.step === 'IDLE') {
        await sendTextMessage(
            waId,
            `No te entendí del todo.\n\n${HELP_HINT}`
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
            withStepHint(
                `Gracias. Ahora enviá el *dominio* del auto *sin guiones*.\n` +
                    `Formatos válidos:\n` +
                    `• Viejo: *ABC123*\n` +
                    `• Mercosur: *AA123BB*`,
                'AWAIT_PLATE'
            )
        );
        return;
    }

    if (conv.step === 'AWAIT_PLATE') {
        const plateValidation = validateNewLicensePlate(text);
        if (!plateValidation.ok || !plateValidation.plate) {
            await sendTextMessage(
                waId,
                withStepHint(
                    `No entendí el dominio.\n` +
                        `${plateValidation.message || 'Dominio inválido.'}\n` +
                        `Ejemplos: *ABC123* o *AA123BB* (sin guiones).`,
                    'AWAIT_PLATE'
                )
            );
            return;
        }

        const plate = plateValidation.plate;
        const carId = await findCarIdByNormalizedPlateExact(plate);
        if (carId) {
            const ownerName = await getCurrentOwnerName(carId);
            await proceedAfterPlateResolved(waId, plate, carId, ownerName);
            return;
        }

        const fuzzyMatches = await findFuzzyPlateMatches(plate);
        if (fuzzyMatches.length > 0) {
            await askPlateConfirm(waId, plate, fuzzyMatches);
            return;
        }

        await proceedAfterPlateResolved(waId, plate, null, null);
        return;
    }

    if (conv.step === 'AWAIT_NAME') {
        const name = text.slice(0, 120);
        // Si escribió una keyword por error, no tomarla como nombre
        if (
            parseTurnoIntent(text) ||
            STATUS_WORDS.has(lower) ||
            parseHistoryIntent(text).hit ||
            CANCEL_WORDS.has(lower) ||
            RESTART_WORDS.has(lower)
        ) {
            await sendTextMessage(
                waId,
                withStepHint(
                    `Necesito tu *nombre y apellido* para el turno (no una palabra clave).`,
                    'AWAIT_NAME'
                )
            );
            return;
        }
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
                withStepHint(
                    `No pude entender esa fecha.\n\n${DATE_HINT}`,
                    'AWAIT_DATE'
                )
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
                withStepHint(
                    `Ese día ya pasó. Hoy es *${todayLabel}*.\n\n` +
                        `Decime un día de hoy en adelante. ${DATE_HINT}`,
                    'AWAIT_DATE'
                )
            );
            return;
        }

        const schedule = await getWorkshopSchedule();
        if (!isWorkingDay(day, schedule)) {
            await sendTextMessage(
                waId,
                withStepHint(
                    `Los *${pluralWeekday(day)}* el taller no atiende.\n\n` +
                        `${describeSchedule(schedule)}\nDecime otro día. ${DATE_HINT}`,
                    'AWAIT_DATE'
                )
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
            await sendTextMessage(waId, withStepHint(message, 'AWAIT_TIME'));
            return;
        }

        const now = new Date();
        const startsAt = combineDateAndTime(conv.draftStartsAt, parsed.hour, parsed.minute);

        const schedule = await getWorkshopSchedule();
        const slotCheck = checkSlotWithinSchedule(startsAt, schedule);
        if (!slotCheck.ok) {
            await sendTextMessage(
                waId,
                withStepHint(
                    `${slotCheck.message}\n\n` +
                        `Decime otra hora, o escribí *cambiar fecha* para elegir otro día.`,
                    'AWAIT_TIME'
                )
            );
            return;
        }

        if (startsAt.getTime() <= now.getTime()) {
            const nowLabel = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            await sendTextMessage(
                waId,
                withStepHint(
                    `Esa hora ya pasó: ahora son las *${nowLabel}*.\n\n` +
                        `Decime una hora más adelante, o escribí *cambiar fecha* para elegir otro día.`,
                    'AWAIT_TIME'
                )
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
    await sendTextMessage(
        waId,
        `No te entendí.\n\n${HELP_HINT}`
    );
}
