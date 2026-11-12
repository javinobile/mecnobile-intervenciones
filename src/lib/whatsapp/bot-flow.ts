import { revalidatePath } from 'next/cache';
import prisma from '../../../lib/prisma';
import { Prisma } from '../../../generated/prisma';
import { findFuzzyPlateMatches, type FuzzyPlateMatch } from '../../../lib/plate-fuzzy-match';
import { findCarIdByNormalizedPlateExact } from '../../../lib/plate-search';
import { normalizeLicensePlate, validateNewLicensePlate } from '../../../lib/utils';
import {
    checkSlotWithinSchedule,
    describeSchedule,
    getWorkshopSchedule,
    isSlotFree,
    isWorkingDay,
    listAvailableDays,
    listFreeSlotsForDay,
    pluralWeekday,
} from '../workshop-schedule';
import { WHATSAPP_BOT_EMAIL, getWorkshopContactPhone } from './config';
import {
    notifyAppointmentConfirmed,
    sendChoice,
    sendTextMessage,
    SLOT_BUTTON_PREFIX,
    type ChoiceOption,
} from './meta-client';
import { buildOtStatusReply, findCarsWithOpenOtForWhatsApp, type StatusCar } from './ot-status';
import {
    createPendingHistoryRequest,
    findCarsForWhatsApp,
    findCarsWithHistoryForWhatsApp,
    findClientsByWaId,
    isValidEmail,
} from './car-history-flow';
import {
    combineDateAndTime,
    formatDateTimeEsAr,
    formatMetaRecipientWaId,
    formatSlotButtonLabel,
    normalizeWaId,
    parseClientDate,
    parseClientDateTime,
    parseClientTime,
    startOfDay,
} from './phone';

type IncomingMessage = {
    from: string;
    text: string;
    /** Id del botón o fila de lista tocada (o payload de plantilla). */
    buttonId?: string;
    /** Audio, imagen, ubicación, etc. */
    unsupported?: boolean;
};

type Conversation = NonNullable<Awaited<ReturnType<typeof getOrCreateConversation>>>;

/** Timeout de inactividad del FSM (drafts). No crea ni deja turnos colgados. */
const CONVERSATION_IDLE_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Palabras clave (todas se comparan normalizadas: sin acentos, signos ni mayúsculas)
// ---------------------------------------------------------------------------

/** Normaliza texto de WA para keywords (quita *negrita*, signos, acentos). */
function normalizeBotKeyword(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[*_~`•·]+/g, ' ')
        .replace(/[¿?¡!.,;:"'“”‘’]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function words(list: string[]): Set<string> {
    return new Set(list.map(normalizeBotKeyword));
}

const RESTART_WORDS = words(['reiniciar', 'reset', 'empezar', 'empezar de nuevo', 'comienzo', 'menu', 'inicio']);
const HELP_WORDS = words(['ayuda', 'help', 'opciones']);
const GREETING_WORDS = words([
    'hola',
    'buenas',
    'buen dia',
    'buenos dias',
    'buenas tardes',
    'buenas noches',
    'hola buenas',
    'hola buen dia',
    'que tal',
    'hello',
    'hi',
]);
const CANCEL_WORDS = words(['cancelar', 'cancelar turno', 'anular', 'anular turno', 'cancelar el turno']);
const YES_WORDS = words(['si', 'yes', 'ok', 'dale', 'correcto', 'ese', 'es', 'confirmo', 'confirmar', 'listo']);
const NO_WORDS = words(['no', 'nop', 'ninguno', 'ninguna', 'otro', 'otra', 'otro auto', 'none']);
const CHANGE_WORDS = words([
    'cambiar',
    'cambiar fecha',
    'cambiar dia',
    'cambiar horario',
    'otro dia',
    'otro horario',
    'cambiar el dia',
]);
const STATUS_WORDS = words([
    'estado',
    'estado del auto',
    'estado auto',
    'como va',
    'como esta',
    'como esta mi auto',
    'como va mi auto',
    'mi auto',
    'consulta',
    'consultar',
]);
const HISTORY_WORDS = words([
    'historial',
    'historial del auto',
    'historial auto',
    'pedir historial',
    'solicitar historial',
    'historia del auto',
    'historia',
]);
const CONTACT_WORDS = words([
    'taller',
    'contacto',
    'telefono',
    'llamar',
    'hablar con el taller',
    'hablar con una persona',
    'hablar con alguien',
    'quiero hablar con el taller',
]);

type Intent = 'menu' | 'help' | 'greeting' | 'turno' | 'status' | 'history' | 'cancel' | 'contact';

type DetectedIntent = {
    intent: Intent | null;
    /** `estado ABC123` / `historial ABC123` */
    plate?: string;
    /** `cancelar 2` */
    cancelIndex?: number;
};

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

/** Pedido de turno: "turno", "quiero un turno", "hola, necesito sacar turno". */
function parseTurnoIntent(text: string): boolean {
    const lower = normalizeBotKeyword(text);
    if (!lower) return false;
    if (lower === 'turno' || lower === 'un turno') return true;
    if (/\b(?:cancelar|anular)\b/.test(lower)) return false;
    if (!/\bturno\b/.test(lower)) return false;
    return /(?:quiero|quisiera|necesito|pedir|pido|solicitar|reservar|agendar|sacar|hacer|dame|darme)\b/.test(
        lower
    );
}

/** Intención del mensaje según palabras clave y frases naturales (exportada para poder probarla). */
export function detectIntent(text: string): DetectedIntent {
    if (text.trim() === '?') return { intent: 'help' };
    const lower = normalizeBotKeyword(text);
    if (!lower) return { intent: null };

    if (RESTART_WORDS.has(lower)) return { intent: 'menu' };
    if (HELP_WORDS.has(lower)) return { intent: 'help' };
    if (GREETING_WORDS.has(lower)) return { intent: 'greeting' };

    const cancelPick = lower.match(/^(?:cancelar|anular)\s+(\d+)$/);
    if (cancelPick) return { intent: 'cancel', cancelIndex: parseInt(cancelPick[1], 10) };
    if (
        CANCEL_WORDS.has(lower) ||
        (/\b(?:cancelar|anular|cancelo)\b/.test(lower) && /\bturno\b/.test(lower)) ||
        /^(?:quiero|necesito|quisiera)\s+(?:cancelar|anular)\b/.test(lower)
    ) {
        return { intent: 'cancel' };
    }

    const history = parseHistoryIntent(text);
    if (history.hit) return { intent: 'history', plate: history.plate };

    const statusPlate = lower.match(/^(?:estado|consultar?)\s+([a-z0-9-]{6,10})$/);
    if (statusPlate) return { intent: 'status', plate: statusPlate[1] };
    if (
        STATUS_WORDS.has(lower) ||
        (/\b(?:como|que)\s+(?:va|esta|anda|paso)\b/.test(lower) &&
            /\b(?:auto|vehiculo|camioneta|coche|moto)\b/.test(lower)) ||
        (/\bestado\b/.test(lower) &&
            /\b(?:auto|vehiculo|ot|orden|reparacion|arreglo|camioneta)\b/.test(lower)) ||
        (/\b(?:esta|estara)\s+listo\b/.test(lower) && /\b(?:auto|vehiculo|camioneta)\b/.test(lower))
    ) {
        return { intent: 'status' };
    }

    if (
        CONTACT_WORDS.has(lower) ||
        /\b(?:hablar|comunicar|comunicarme|contactar|contactarme)\b.*\b(?:taller|persona|alguien|humano|mecanico)\b/.test(
            lower
        ) ||
        /\b(?:telefono|numero)\s+del\s+taller\b/.test(lower)
    ) {
        return { intent: 'contact' };
    }

    if (parseTurnoIntent(text)) return { intent: 'turno' };

    return { intent: null };
}

// ---------------------------------------------------------------------------
// Pasos del FSM
// ---------------------------------------------------------------------------

/** Pasos donde el cliente escribe texto libre: las palabras clave no los interrumpen. */
const FREE_TEXT_STEPS = new Set(['AWAIT_ISSUE', 'AWAIT_NAME', 'AWAIT_PLATE', 'AWAIT_HISTORY_EMAIL']);

/** Prefijo de id de botón que acepta cada paso (para descartar botones viejos). */
const STEP_BUTTON_KIND: Record<string, string> = {
    AWAIT_CAR_CHOICE: 'car',
    AWAIT_PLATE_CONFIRM: 'fuzzy',
    AWAIT_DUP: 'dup',
    AWAIT_SLOT_DAY: 'day',
    AWAIT_SLOT_TIME: 'time|day',
    AWAIT_CONFIRM: 'confirm',
    AWAIT_STATUS_PLATE: 'scar',
    AWAIT_HISTORY_PLATE: 'hcar',
    AWAIT_HISTORY_EMAIL_CHOICE: 'email',
    AWAIT_CANCEL_CHOICE: 'cancel',
    AWAIT_CANCEL_CONFIRM: 'cancelok',
};

// ---------------------------------------------------------------------------
// Utilidades de datos
// ---------------------------------------------------------------------------

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

const EMPTY_DRAFT = {
    draftName: null,
    draftIssue: null,
    draftPlate: null,
    draftCarId: null,
    draftStartsAt: null,
    draftPlateNote: null,
    draftExtra: null,
} as const;

async function clearDrafts(waId: string) {
    await prisma.whatsAppConversation.upsert({
        where: { waId },
        create: { waId, step: 'IDLE' },
        update: { step: 'IDLE', unknownCount: 0, ...EMPTY_DRAFT },
    });
}

/** Cambia de paso / guarda drafts y reinicia el contador de "no entendí". */
async function setConv(waId: string, data: Prisma.WhatsAppConversationUncheckedUpdateInput) {
    await prisma.whatsAppConversation.upsert({
        where: { waId },
        create: { ...(data as Prisma.WhatsAppConversationUncheckedCreateInput), waId },
        update: { unknownCount: 0, ...data },
    });
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

/** Turnos activos de este teléfono que todavía se pueden cancelar (sin OT abierta). */
async function findClientAppointments(waId: string) {
    const variants = waIdLookupVariants(waId);
    return prisma.appointment.findMany({
        where: {
            status: { in: ['PENDIENTE', 'PROPUESTA_ENVIADA', 'CONFIRMADO'] },
            interventionId: null,
            OR: [{ whatsappWaId: { in: variants } }, { clientPhone: { in: variants } }],
        },
        orderBy: { startsAt: 'asc' },
        select: {
            id: true,
            startsAt: true,
            status: true,
            licensePlate: true,
            clientName: true,
        },
    });
}

type ClientAppointment = Awaited<ReturnType<typeof findClientAppointments>>[number];

function appointmentStatusWord(status: string): string {
    switch (status) {
        case 'CONFIRMADO':
            return 'confirmado';
        case 'PROPUESTA_ENVIADA':
            return 'con horarios propuestos';
        default:
            return 'pendiente de confirmación';
    }
}

function refreshCalendar() {
    try {
        revalidatePath('/dashboard/turnos');
        revalidatePath('/dashboard');
    } catch {
        // fuera de un contexto de request (scripts) no hay caché que revalidar
    }
}

async function cancelAppointmentByClient(id: string) {
    await prisma.appointment.update({
        where: { id },
        data: {
            status: 'CANCELADO',
            canceledAt: new Date(),
            canceledBy: 'CLIENTE_WHATSAPP',
            proposedSlots: Prisma.DbNull,
        },
    });
    refreshCalendar();
}

function carDescription(car: Pick<StatusCar, 'make' | 'model'>): string {
    return [car.make, car.model].filter(Boolean).join(' ');
}

function carLabel(car: Pick<StatusCar, 'licensePlate' | 'make' | 'model'>): string {
    const mm = carDescription(car);
    return mm ? `${mm} (${car.licensePlate})` : car.licensePlate;
}

function carOptions(kind: string, cars: StatusCar[]): ChoiceOption[] {
    return cars.slice(0, 9).map((car) => ({
        id: `${kind}:${car.id}`,
        title: car.licensePlate,
        description: carDescription(car) || undefined,
    }));
}

function pickCarByPlate(cars: StatusCar[], plateRaw: string): StatusCar | null {
    const normalized = normalizeLicensePlate(plateRaw);
    if (!normalized) return null;
    return cars.find((c) => normalizeLicensePlate(c.licensePlate) === normalized) ?? null;
}

/** "1", "2"… → id de la opción correspondiente (para quien responde escribiendo en vez de tocar). */
function pickByNumber(text: string, options: ChoiceOption[]): string | null {
    const match = text.trim().match(/^(\d{1,2})$/);
    if (!match) return null;
    const idx = parseInt(match[1], 10) - 1;
    return idx >= 0 && idx < options.length ? options[idx].id : null;
}

function isYes(text: string) {
    return YES_WORDS.has(normalizeBotKeyword(text));
}
function isNo(text: string) {
    return NO_WORDS.has(normalizeBotKeyword(text));
}

// ---------------------------------------------------------------------------
// Mensajes comunes (menú, contacto, errores)
// ---------------------------------------------------------------------------

async function greetingName(waId: string): Promise<string | null> {
    try {
        const clients = await findClientsByWaId(waId);
        if (clients.length !== 1) return null;
        return clients[0].firstName.trim() || null;
    } catch {
        return null;
    }
}

async function sendMenu(waId: string, opts: { prefix?: string; withName?: boolean } = {}) {
    const name = opts.withName ? await greetingName(waId) : null;
    const body = opts.prefix
        ? `${opts.prefix}\n\n¿En qué te ayudo?`
        : `Hola${name ? ` ${name}` : ''}, soy el asistente de *Nóbile*. ¿En qué te ayudo?`;
    await sendChoice(
        waId,
        body,
        [
            { id: 'menu:turno', title: 'Sacar turno' },
            { id: 'menu:estado', title: 'Estado de mi auto' },
            { id: 'menu:mas', title: 'Más opciones' },
        ],
        {
            fallbackText:
                `${body}\n\nEscribí *turno*, *estado* o *historial*. ` +
                `Para cancelar un turno escribí *cancelar*.`,
        }
    );
}

async function sendMoreOptions(waId: string) {
    await sendChoice(
        waId,
        'Estas son las otras opciones:',
        [
            { id: 'menu:historial', title: 'Pedir historial' },
            { id: 'menu:cancelar', title: 'Cancelar un turno' },
            { id: 'menu:taller', title: 'Hablar con el taller' },
        ],
        {
            fallbackText:
                `Otras opciones:\n• *historial* — te mandamos el historial del auto por email\n` +
                `• *cancelar* — cancelar un turno\n• *taller* — hablar con el taller`,
        }
    );
}

async function sendContact(waId: string, prefix?: string) {
    const schedule = await getWorkshopSchedule();
    await sendTextMessage(
        waId,
        `${prefix ? `${prefix}\n\n` : ''}Podés comunicarte con el taller al *${getWorkshopContactPhone()}*.\n` +
            describeSchedule(schedule)
    );
}

/** Mensaje sin salida directa: ofrece sacar turno o hablar con el taller. */
async function sendNoDataChoice(waId: string, body: string) {
    await sendChoice(
        waId,
        body,
        [
            { id: 'menu:turno', title: 'Sacar turno' },
            { id: 'menu:taller', title: 'Hablar con el taller' },
        ],
        { fallbackText: `${body}\n\nEscribí *turno* para pedir uno o *taller* para hablar con el taller.` }
    );
}

async function sendStaleOption(waId: string) {
    await sendMenu(waId, { prefix: 'Esa opción ya no está disponible.' });
}

// ---------------------------------------------------------------------------
// Turno
// ---------------------------------------------------------------------------

async function startTurno(waId: string) {
    await clearDrafts(waId);

    let defaultName: string | null = null;
    try {
        const clients = await findClientsByWaId(waId);
        if (clients.length === 1) {
            defaultName = `${clients[0].firstName} ${clients[0].lastName}`.trim() || null;
        }
    } catch {
        // si falla la búsqueda seguimos como cliente desconocido
    }

    await setConv(waId, { step: 'AWAIT_CAR_CHOICE', draftName: defaultName });
    await askCarChoice(waId);
}

function carChoiceOptions(cars: StatusCar[]): ChoiceOption[] {
    if (cars.length === 1) {
        return [
            { id: `car:${cars[0].id}`, title: 'Sí' },
            { id: 'car:other', title: 'Otro auto' },
        ];
    }
    return [...carOptions('car', cars), { id: 'car:other', title: 'Otro auto' }];
}

async function askCarChoice(waId: string) {
    const cars = await findCarsForWhatsApp(waId, { onlyWithHistory: false });
    if (cars.length === 0) {
        await askPlate(waId);
        return;
    }
    if (cars.length === 1) {
        await sendChoice(waId, `¿El turno es para tu *${carLabel(cars[0])}*?`, carChoiceOptions(cars));
        return;
    }
    await sendChoice(waId, '¿Para cuál de tus autos es el turno?', carChoiceOptions(cars), {
        listButtonLabel: 'Ver autos',
    });
}

async function askPlate(waId: string) {
    await setConv(waId, { step: 'AWAIT_PLATE' });
    await sendTextMessage(
        waId,
        `Pasame el *dominio* del auto, sin guiones (por ejemplo *ABC123* o *AA123BB*).`
    );
}

async function askName(waId: string) {
    await setConv(waId, { step: 'AWAIT_NAME' });
    await sendTextMessage(waId, `¿Cuál es tu *nombre y apellido*?`);
}

async function askIssue(waId: string, prefix?: string) {
    await setConv(waId, { step: 'AWAIT_ISSUE' });
    await sendTextMessage(
        waId,
        `${prefix ? `${prefix} ` : ''}¿Qué le pasa al auto o qué trabajo necesita?`
    );
}

/** Datos del auto ya resueltos: chequea turno duplicado y sigue con nombre o avería. */
async function proceedWithResolved(
    waId: string,
    resolved: { plate: string; carId: string | null; ownerName: string | null; plateNote?: string | null }
) {
    const conv = await getOrCreateConversation(waId);
    await setConv(waId, {
        draftPlate: resolved.plate,
        draftCarId: resolved.carId,
        draftName: resolved.ownerName ?? conv.draftName,
        draftPlateNote: resolved.plateNote ?? null,
    });

    const existing = (await findClientAppointments(waId)).find(
        (ap) =>
            ap.licensePlate && normalizeLicensePlate(ap.licensePlate) === normalizeLicensePlate(resolved.plate)
    );
    if (existing) {
        await setConv(waId, { step: 'AWAIT_DUP', draftExtra: existing.id });
        await askDup(waId);
        return;
    }

    await continueAfterCar(waId);
}

async function continueAfterCar(waId: string) {
    const conv = await getOrCreateConversation(waId);
    if (!conv.draftName) {
        await askName(waId);
        return;
    }
    await askIssue(waId, conv.draftPlate ? `Perfecto, *${conv.draftPlate}*.` : undefined);
}

async function askDup(waId: string) {
    const conv = await getOrCreateConversation(waId);
    const existing = conv.draftExtra
        ? await prisma.appointment.findUnique({
              where: { id: conv.draftExtra },
              select: { startsAt: true, status: true, licensePlate: true },
          })
        : null;
    if (!existing) {
        await continueAfterCar(waId);
        return;
    }
    const { full } = formatDateTimeEsAr(existing.startsAt);
    await sendChoice(
        waId,
        `Ya tenés un turno para *${existing.licensePlate ?? conv.draftPlate}* el *${full}* ` +
            `(${appointmentStatusWord(existing.status)}). ¿Qué querés hacer?`,
        [
            { id: 'dup:keep', title: 'Mantenerlo' },
            { id: 'dup:cancel', title: 'Cancelarlo' },
        ]
    );
}

async function handleAwaitDup(waId: string, conv: Conversation, input: StepInput) {
    const choice =
        input.id ?? (isNo(input.text) ? 'dup:cancel' : isYes(input.text) ? 'dup:keep' : null);
    if (choice === 'dup:keep') {
        await clearDrafts(waId);
        await sendTextMessage(waId, 'Perfecto, tu turno queda como está.');
        return;
    }
    if (choice === 'dup:cancel' && conv.draftExtra) {
        await cancelAppointmentByClient(conv.draftExtra);
        await setConv(waId, { draftExtra: null });
        await sendTextMessage(waId, 'Listo, cancelé el turno anterior.');
        await continueAfterCar(waId);
        return;
    }
    await stepMiss(waId, conv, 'Tocá una de las dos opciones.');
}

async function handleAwaitCarChoice(waId: string, conv: Conversation, input: StepInput) {
    const cars = await findCarsForWhatsApp(waId, { onlyWithHistory: false });
    const options = carChoiceOptions(cars);

    let choice = input.id ?? pickByNumber(input.text, options);
    if (!choice) {
        if (isNo(input.text)) {
            choice = 'car:other';
        } else if (cars.length === 1 && isYes(input.text)) {
            choice = `car:${cars[0].id}`;
        } else {
            const byPlate = pickCarByPlate(cars, input.text);
            if (byPlate) choice = `car:${byPlate.id}`;
        }
    }

    if (choice === 'car:other') {
        await askPlate(waId);
        return;
    }
    const car = choice ? cars.find((c) => `car:${c.id}` === choice) : null;
    if (!car) {
        await stepMiss(waId, conv, 'No encontré ese auto.');
        return;
    }
    const ownerName = (await getCurrentOwnerName(car.id)) ?? conv.draftName;
    await proceedWithResolved(waId, {
        plate: car.licensePlate,
        carId: car.id,
        ownerName,
    });
}

async function handleAwaitPlate(waId: string, conv: Conversation, input: StepInput) {
    const validation = validateNewLicensePlate(input.text);
    if (!validation.ok || !validation.plate) {
        await stepMiss(
            waId,
            conv,
            `No entendí el dominio. ${validation.message || ''} Ejemplos: *ABC123* o *AA123BB*.`.trim()
        );
        return;
    }

    const plate = validation.plate;
    const carId = await findCarIdByNormalizedPlateExact(plate);
    if (carId) {
        const ownerName = await getCurrentOwnerName(carId);
        await proceedWithResolved(waId, { plate, carId, ownerName });
        return;
    }

    const fuzzy = await findFuzzyPlateMatches(plate);
    if (fuzzy.length > 0) {
        await setConv(waId, { step: 'AWAIT_PLATE_CONFIRM', draftPlate: plate });
        await askPlateConfirm(waId);
        return;
    }

    await proceedWithResolved(waId, { plate, carId: null, ownerName: null });
}

function fuzzyOptions(matches: FuzzyPlateMatch[]): ChoiceOption[] {
    if (matches.length === 1) {
        return [
            { id: `fuzzy:${matches[0].carId}`, title: 'Sí, es ese' },
            { id: 'fuzzy:none', title: 'No, es otro' },
        ];
    }
    return [
        ...matches.slice(0, 9).map((m) => ({
            id: `fuzzy:${m.carId}`,
            title: m.storedPlate,
            description:
                [[m.make, m.model].filter(Boolean).join(' '), m.ownerName].filter(Boolean).join(' · ') ||
                undefined,
        })),
        { id: 'fuzzy:none', title: 'Ninguno' },
    ];
}

async function askPlateConfirm(waId: string) {
    const conv = await getOrCreateConversation(waId);
    if (!conv.draftPlate) {
        await askPlate(waId);
        return;
    }
    const matches = await findFuzzyPlateMatches(conv.draftPlate);
    if (!matches.length) {
        await proceedWithResolved(waId, { plate: conv.draftPlate, carId: null, ownerName: null });
        return;
    }
    if (matches.length === 1) {
        const m = matches[0];
        const vehicle = [m.make, m.model].filter(Boolean).join(' ') || 'un vehículo';
        const owner = m.ownerName ? ` de *${m.ownerName}*` : '';
        await sendChoice(
            waId,
            `Escribiste *${conv.draftPlate}* y tenemos cargado *${m.storedPlate}* (${vehicle}${owner}). ¿Es tu auto?`,
            fuzzyOptions(matches)
        );
        return;
    }
    await sendChoice(
        waId,
        `No tenemos *${conv.draftPlate}* exacto, pero hay dominios parecidos. ¿Cuál es el tuyo?`,
        fuzzyOptions(matches),
        { listButtonLabel: 'Ver autos' }
    );
}

async function handleAwaitPlateConfirm(waId: string, conv: Conversation, input: StepInput) {
    if (!conv.draftPlate) {
        await askPlate(waId);
        return;
    }
    const plate = conv.draftPlate;
    const matches = await findFuzzyPlateMatches(plate);
    if (!matches.length) {
        await proceedWithResolved(waId, { plate, carId: null, ownerName: null });
        return;
    }

    const options = fuzzyOptions(matches);
    let choice = input.id ?? pickByNumber(input.text, options);
    if (!choice) {
        if (isNo(input.text)) choice = 'fuzzy:none';
        else if (matches.length === 1 && isYes(input.text)) choice = `fuzzy:${matches[0].carId}`;
        else {
            const byPlate = matches.find(
                (m) => normalizeLicensePlate(m.storedPlate) === normalizeLicensePlate(input.text)
            );
            if (byPlate) choice = `fuzzy:${byPlate.carId}`;
        }
    }

    if (choice === 'fuzzy:none') {
        await proceedWithResolved(waId, { plate, carId: null, ownerName: null });
        return;
    }
    const match = choice ? matches.find((m) => `fuzzy:${m.carId}` === choice) : null;
    if (!match) {
        await stepMiss(waId, conv, 'Elegí una de las opciones.');
        return;
    }

    // El bot NO modifica el dominio del auto: se guarda lo que escribió el cliente
    // y una nota para que el taller valide o corrija el dato.
    const ownerName = match.ownerName ?? (await getCurrentOwnerName(match.carId));
    await proceedWithResolved(waId, {
        plate,
        carId: match.carId,
        ownerName,
        plateNote: `El cliente escribió ${plate}; en el sistema figura ${match.storedPlate}. Validar el dominio.`,
    });
}

async function handleAwaitName(waId: string, conv: Conversation, input: StepInput) {
    const name = input.text.slice(0, 120).trim();
    if (!name) {
        await stepMiss(waId, conv, 'Necesito tu *nombre y apellido* para el turno.');
        return;
    }
    await setConv(waId, { draftName: name });
    await askIssue(waId, `Gracias, ${name.split(' ')[0]}.`);
}

async function handleAwaitIssue(waId: string, _conv: Conversation, input: StepInput) {
    const issue = input.text.slice(0, 500).trim();
    await setConv(waId, { draftIssue: issue });
    await askDay(waId);
}

// --- Día y hora -------------------------------------------------------------

function pad2(n: number) {
    return String(n).padStart(2, '0');
}

function dayId(day: Date) {
    return `day:${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}`;
}

function parseDayId(id: string): Date | null {
    const match = id.match(/^day:(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
}

function timeId(slot: Date) {
    return `time:${pad2(slot.getHours())}:${pad2(slot.getMinutes())}`;
}

function hhmm(slot: Date) {
    return `${pad2(slot.getHours())}:${pad2(slot.getMinutes())}`;
}

function sameDay(a: Date, b: Date) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function dayTitle(day: Date, now: Date) {
    const short = `${pad2(day.getDate())}/${pad2(day.getMonth() + 1)}`;
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (sameDay(day, now)) return `Hoy · ${short}`;
    if (sameDay(day, tomorrow)) return `Mañana · ${short}`;
    const weekday = day.toLocaleDateString('es-AR', { weekday: 'short' }).replace(/\./g, '');
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${short}`;
}

async function dayOptions(now: Date): Promise<{ options: ChoiceOption[]; empty: boolean }> {
    const schedule = await getWorkshopSchedule();
    const days = await listAvailableDays(schedule, now, { maxDays: 7 });
    return {
        empty: days.length === 0,
        options: days.map(({ day, slots }) => ({
            id: dayId(day),
            title: dayTitle(day, now),
            description: `Libres: ${slots.map(hhmm).join(', ')}`,
        })),
    };
}

async function askDay(waId: string, prefix?: string) {
    const now = new Date();
    const { options, empty } = await dayOptions(now);
    if (empty) {
        await clearDrafts(waId);
        await sendContact(
            waId,
            'Por ahora no tenemos horarios libres en los próximos días, así que no puedo reservarlo por acá.'
        );
        return;
    }
    await setConv(waId, { step: 'AWAIT_SLOT_DAY', draftStartsAt: null });
    await sendChoice(
        waId,
        `${prefix ? `${prefix}\n\n` : ''}¿Qué día querés traer el auto? Elegí uno o escribilo ` +
            `(por ejemplo *mañana 9* o *15/8*).`,
        options,
        { listButtonLabel: 'Ver días' }
    );
}

type TimeOptionsResult = { options: ChoiceOption[]; slots: Date[] };

async function timeOptions(day: Date, near?: Date): Promise<TimeOptionsResult> {
    const schedule = await getWorkshopSchedule();
    let slots = await listFreeSlotsForDay(day, schedule);
    if (near) {
        const target = near.getTime();
        slots = [...slots]
            .sort((a, b) => Math.abs(a.getTime() - target) - Math.abs(b.getTime() - target))
            .slice(0, 3)
            .sort((a, b) => a.getTime() - b.getTime());
    }
    return {
        slots,
        options: [
            ...slots.map((slot) => ({ id: timeId(slot), title: `${hhmm(slot)} hs` })),
            { id: 'day:change', title: 'Cambiar día' },
        ],
    };
}

async function askTime(waId: string, day: Date, opts: { prefix?: string; near?: Date } = {}) {
    const { options, slots } = await timeOptions(day, opts.near);
    if (!slots.length) {
        await askDay(waId, `${dayLabelShort(day)} ya no tiene horarios libres.`);
        return;
    }
    await setConv(waId, { step: 'AWAIT_SLOT_TIME', draftStartsAt: day });
    const dayLabel = day.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    await sendChoice(
        waId,
        `${opts.prefix ? `${opts.prefix}\n\n` : ''}Para el *${dayLabel}* tenemos estos horarios. ` +
            `Elegí uno o escribí otra hora.`,
        options,
        { listButtonLabel: 'Ver horarios' }
    );
}

function dayLabelShort(day: Date) {
    return `Ese día (${day.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'numeric' })})`;
}

/** Valida el día elegido; si trae hora, sigue con la hora, si no pide el horario. */
async function applyDay(
    waId: string,
    day: Date,
    time?: ReturnType<typeof parseClientTime>
) {
    const now = new Date();
    if (day.getTime() < startOfDay(now).getTime()) {
        await askDay(waId, 'Ese día ya pasó.');
        return;
    }
    const schedule = await getWorkshopSchedule();
    if (!isWorkingDay(day, schedule)) {
        await askDay(waId, `Los *${pluralWeekday(day)}* el taller no atiende. ${describeSchedule(schedule)}`);
        return;
    }
    const free = await listFreeSlotsForDay(day, schedule, now);
    if (!free.length) {
        await askDay(waId, 'Ese día no tiene horarios libres.');
        return;
    }

    if (!time) {
        await askTime(waId, day);
        return;
    }
    if (!time.ok) {
        await setConv(waId, { step: 'AWAIT_SLOT_TIME', draftStartsAt: day });
        await sendTextMessage(
            waId,
            `¿Esa hora es de la mañana o de la tarde? Escribila en formato de 24 horas ` +
                `(*16* para las 4 de la tarde) o aclarame, por ejemplo *4 de la tarde*.`
        );
        return;
    }
    await applyTime(waId, day, time.hour, time.minute);
}

async function applyTime(waId: string, day: Date, hour: number, minute: number) {
    const now = new Date();
    const startsAt = combineDateAndTime(day, hour, minute);
    const schedule = await getWorkshopSchedule();

    const slotCheck = checkSlotWithinSchedule(startsAt, schedule);
    if (!slotCheck.ok) {
        await askTime(waId, day, { prefix: slotCheck.message });
        return;
    }
    if (startsAt.getTime() <= now.getTime()) {
        await askTime(waId, day, { prefix: 'Ese horario ya pasó.' });
        return;
    }
    if (!(await isSlotFree(startsAt))) {
        await askTime(waId, day, {
            prefix: `A las *${hhmm(startsAt)}* ya tenemos otro turno.`,
            near: startsAt,
        });
        return;
    }
    await askConfirm(waId, startsAt);
}

async function handleAwaitSlotDay(waId: string, conv: Conversation, input: StepInput) {
    const now = new Date();
    if (input.id) {
        const day = parseDayId(input.id);
        if (day) {
            await applyDay(waId, day);
            return;
        }
    }

    const { options } = await dayOptions(now);
    const pickedId = pickByNumber(input.text, options);
    if (pickedId) {
        const day = parseDayId(pickedId);
        if (day) {
            await applyDay(waId, day);
            return;
        }
    }

    const dayOnly = parseClientDate(input.text, now);
    if (dayOnly) {
        await applyDay(waId, dayOnly);
        return;
    }
    const withTime = parseClientDateTime(input.text, now);
    if (withTime) {
        await applyDay(waId, withTime.day, withTime.time);
        return;
    }
    await stepMiss(waId, conv, 'No entendí ese día.');
}

async function handleAwaitSlotTime(waId: string, conv: Conversation, input: StepInput) {
    const day = conv.draftStartsAt;
    if (!day) {
        await askDay(waId, 'Se perdió el día elegido, lo volvemos a pedir.');
        return;
    }

    if (input.id === 'day:change' || CHANGE_WORDS.has(normalizeBotKeyword(input.text))) {
        await askDay(waId, 'Sin problema, elegí otro día.');
        return;
    }
    if (input.id?.startsWith('time:')) {
        const match = input.id.match(/^time:(\d{2}):(\d{2})$/);
        if (match) {
            await applyTime(waId, day, parseInt(match[1], 10), parseInt(match[2], 10));
            return;
        }
    }

    const { options } = await timeOptions(day);
    const pickedId = pickByNumber(input.text, options);
    if (pickedId === 'day:change') {
        await askDay(waId, 'Sin problema, elegí otro día.');
        return;
    }
    if (pickedId?.startsWith('time:')) {
        const match = pickedId.match(/^time:(\d{2}):(\d{2})$/);
        if (match) {
            await applyTime(waId, day, parseInt(match[1], 10), parseInt(match[2], 10));
            return;
        }
    }

    const parsed = parseClientTime(input.text);
    if (parsed.ok) {
        await applyTime(waId, day, parsed.hour, parsed.minute);
        return;
    }
    if (parsed.reason === 'AMBIGUOUS') {
        await sendTextMessage(
            waId,
            `¿Esa hora es de la mañana o de la tarde? Escribila en formato de 24 horas ` +
                `(*16* para las 4 de la tarde) o aclarame, por ejemplo *4 de la tarde*.`
        );
        return;
    }

    // ¿Quiso cambiar de día escribiendo otra fecha?
    const now = new Date();
    const otherDay = parseClientDate(input.text, now);
    if (otherDay) {
        await applyDay(waId, otherDay);
        return;
    }
    const withTime = parseClientDateTime(input.text, now);
    if (withTime) {
        await applyDay(waId, withTime.day, withTime.time);
        return;
    }

    await stepMiss(waId, conv, 'No entendí esa hora.');
}

// --- Confirmación -----------------------------------------------------------

async function askConfirm(waId: string, startsAt?: Date) {
    if (startsAt) await setConv(waId, { step: 'AWAIT_CONFIRM', draftStartsAt: startsAt });
    const conv = await getOrCreateConversation(waId);
    if (!conv.draftIssue || !conv.draftPlate || !conv.draftStartsAt || !conv.draftName) {
        await clearDrafts(waId);
        await sendMenu(waId, { prefix: 'Se perdieron algunos datos del pedido, empecemos de nuevo.' });
        return;
    }
    const { full } = formatDateTimeEsAr(conv.draftStartsAt);
    await sendChoice(
        waId,
        `Revisá tu pedido:\n` +
            `• Auto: *${conv.draftPlate}*\n` +
            `• Motivo: ${conv.draftIssue}\n` +
            `• Llegada: *${full}*`,
        [
            { id: 'confirm:yes', title: 'Confirmar' },
            { id: 'confirm:change', title: 'Cambiar horario' },
        ]
    );
}

async function handleAwaitConfirm(waId: string, conv: Conversation, input: StepInput) {
    const choice =
        input.id ??
        (isYes(input.text)
            ? 'confirm:yes'
            : isNo(input.text) || CHANGE_WORDS.has(normalizeBotKeyword(input.text))
              ? 'confirm:change'
              : null);

    if (choice === 'confirm:change') {
        await askDay(waId, 'Sin problema, elegí otro horario.');
        return;
    }
    if (choice === 'confirm:yes') {
        await createPendingFromDraft(waId, conv);
        return;
    }
    await stepMiss(waId, conv, 'Tocá *Confirmar* para dejar el pedido o *Cambiar horario*.');
}

async function createPendingFromDraft(waId: string, conv: Conversation) {
    if (!conv.draftIssue || !conv.draftPlate || !conv.draftStartsAt || !conv.draftName) {
        await clearDrafts(waId);
        await sendMenu(waId, { prefix: 'Se perdieron algunos datos del pedido, empecemos de nuevo.' });
        return;
    }

    // Otro cliente pudo tomar el horario mientras este confirmaba.
    if (!(await isSlotFree(conv.draftStartsAt))) {
        await askTime(waId, startOfDay(conv.draftStartsAt), {
            prefix: 'Ese horario se acaba de ocupar. Elegí otro.',
            near: conv.draftStartsAt,
        });
        return;
    }

    const botId = await getOrCreateBotUserId();
    const phone = normalizeWaId(waId) || waId;
    const notes = conv.draftPlateNote
        ? `${conv.draftIssue}\n[Dominio a validar] ${conv.draftPlateNote}`
        : conv.draftIssue;

    await prisma.appointment.create({
        data: {
            startsAt: conv.draftStartsAt,
            clientName: conv.draftName,
            clientPhone: phone,
            notes,
            licensePlate: conv.draftPlate,
            carId: conv.draftCarId || null,
            status: 'PENDIENTE',
            source: 'WHATSAPP',
            whatsappWaId: waId,
            createdById: botId,
        },
    });
    refreshCalendar();
    await clearDrafts(waId);

    const { full } = formatDateTimeEsAr(conv.draftStartsAt);
    await sendTextMessage(
        waId,
        `Listo ${conv.draftName.split(' ')[0]}, anoté tu pedido para el *${full}* (${conv.draftPlate}). ` +
            `Queda *pendiente de confirmación* del taller y te avisamos por acá.`
    );
}

// ---------------------------------------------------------------------------
// Estado de la OT
// ---------------------------------------------------------------------------

async function sendOtStatusForCar(waId: string, car: StatusCar) {
    await clearDrafts(waId);
    const reply = await buildOtStatusReply(car);
    await sendTextMessage(waId, reply);
}

async function startStatus(waId: string, plate?: string) {
    await clearDrafts(waId);
    const cars = await findCarsWithOpenOtForWhatsApp(waId);
    if (cars.length === 0) {
        await sendNoDataChoice(
            waId,
            'No veo ningún auto tuyo en el taller en este momento. ¿Querés sacar un turno o hablar con el taller?'
        );
        return;
    }

    if (plate) {
        const car = pickCarByPlate(cars, plate);
        if (!car) {
            await sendNoDataChoice(
                waId,
                `No veo el dominio *${normalizeLicensePlate(plate)}* en el taller con este número.`
            );
            return;
        }
        await sendOtStatusForCar(waId, car);
        return;
    }

    if (cars.length === 1) {
        await sendOtStatusForCar(waId, cars[0]);
        return;
    }

    await setConv(waId, { step: 'AWAIT_STATUS_PLATE' });
    await askStatusCar(waId);
}

async function askStatusCar(waId: string) {
    const cars = await findCarsWithOpenOtForWhatsApp(waId);
    await sendChoice(waId, '¿De cuál auto querés saber el estado?', carOptions('scar', cars), {
        listButtonLabel: 'Ver autos',
    });
}

async function handleAwaitStatusCar(waId: string, conv: Conversation, input: StepInput) {
    const cars = await findCarsWithOpenOtForWhatsApp(waId);
    if (cars.length === 0) {
        await clearDrafts(waId);
        await sendNoDataChoice(waId, 'No veo ningún auto tuyo en el taller en este momento.');
        return;
    }
    const options = carOptions('scar', cars);
    const choice = input.id ?? pickByNumber(input.text, options);
    const car = choice
        ? cars.find((c) => `scar:${c.id}` === choice)
        : pickCarByPlate(cars, input.text);
    if (!car) {
        await stepMiss(waId, conv, 'No encontré ese auto.');
        return;
    }
    await sendOtStatusForCar(waId, car);
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------

async function startHistory(waId: string, plate?: string) {
    await clearDrafts(waId);
    const cars = await findCarsWithHistoryForWhatsApp(waId);
    if (cars.length === 0) {
        await sendNoDataChoice(
            waId,
            'No encuentro historial de taller asociado a este número. ¿Querés sacar un turno o hablar con el taller?'
        );
        return;
    }

    if (plate) {
        const car = pickCarByPlate(cars, plate);
        if (!car) {
            await sendNoDataChoice(
                waId,
                `No encuentro historial del dominio *${normalizeLicensePlate(plate)}* con este número.`
            );
            return;
        }
        await askHistoryEmail(waId, car);
        return;
    }

    if (cars.length === 1) {
        await askHistoryEmail(waId, cars[0]);
        return;
    }

    await setConv(waId, { step: 'AWAIT_HISTORY_PLATE' });
    await askHistoryCar(waId);
}

async function askHistoryCar(waId: string) {
    const cars = await findCarsWithHistoryForWhatsApp(waId);
    await sendChoice(waId, '¿De cuál auto querés el historial?', carOptions('hcar', cars), {
        listButtonLabel: 'Ver autos',
    });
}

async function handleAwaitHistoryCar(waId: string, conv: Conversation, input: StepInput) {
    const cars = await findCarsWithHistoryForWhatsApp(waId);
    if (cars.length === 0) {
        await clearDrafts(waId);
        await sendNoDataChoice(waId, 'No encuentro historial de taller asociado a este número.');
        return;
    }
    const options = carOptions('hcar', cars);
    const choice = input.id ?? pickByNumber(input.text, options);
    const car = choice
        ? cars.find((c) => `hcar:${c.id}` === choice)
        : pickCarByPlate(cars, input.text);
    if (!car) {
        await stepMiss(waId, conv, 'No encontré ese auto.');
        return;
    }
    await askHistoryEmail(waId, car);
}

async function savedClientEmail(waId: string): Promise<string | null> {
    try {
        const clients = await findClientsByWaId(waId);
        return clients.find((c) => c.email)?.email ?? null;
    } catch {
        return null;
    }
}

async function askHistoryEmail(waId: string, car: StatusCar) {
    const saved = await savedClientEmail(waId);
    if (saved) {
        await setConv(waId, {
            step: 'AWAIT_HISTORY_EMAIL_CHOICE',
            draftCarId: car.id,
            draftPlate: car.licensePlate,
            draftExtra: saved,
        });
        await askHistoryEmailChoice(waId);
        return;
    }
    await setConv(waId, {
        step: 'AWAIT_HISTORY_EMAIL',
        draftCarId: car.id,
        draftPlate: car.licensePlate,
        draftExtra: null,
    });
    await askHistoryEmailText(waId);
}

async function askHistoryEmailChoice(waId: string) {
    const conv = await getOrCreateConversation(waId);
    await sendChoice(
        waId,
        `Historial de *${conv.draftPlate}*. ¿Te lo mandamos a *${conv.draftExtra}*? ` +
            `Un administrador del taller tiene que autorizar el envío.`,
        [
            { id: 'email:use', title: 'Usar ese email' },
            { id: 'email:other', title: 'Otro email' },
        ]
    );
}

async function askHistoryEmailText(waId: string) {
    const conv = await getOrCreateConversation(waId);
    await sendTextMessage(
        waId,
        `Historial de *${conv.draftPlate}*. ¿A qué *email* te lo mandamos? ` +
            `Un administrador del taller tiene que autorizar el envío.`
    );
}

async function submitHistoryRequest(waId: string, conv: Conversation, email: string) {
    if (!conv.draftCarId) {
        await clearDrafts(waId);
        await sendMenu(waId, { prefix: 'Se perdió el auto elegido, empecemos de nuevo.' });
        return;
    }
    const result = await createPendingHistoryRequest({ waId, carId: conv.draftCarId, email });
    await clearDrafts(waId);

    if (!result.ok) {
        await sendTextMessage(waId, result.message);
        return;
    }
    await sendTextMessage(
        waId,
        `Listo, pedimos el historial de *${result.plate}* para *${email.trim().toLowerCase()}*. ` +
            `Queda pendiente de autorización del taller; cuando lo aprueben te llega el PDF a ese correo y te avisamos por acá.`
    );
}

async function handleAwaitHistoryEmailChoice(waId: string, conv: Conversation, input: StepInput) {
    if (isValidEmail(input.text)) {
        await submitHistoryRequest(waId, conv, input.text);
        return;
    }
    const choice =
        input.id ??
        (isYes(input.text) ? 'email:use' : isNo(input.text) ? 'email:other' : null);
    if (choice === 'email:use' && conv.draftExtra) {
        await submitHistoryRequest(waId, conv, conv.draftExtra);
        return;
    }
    if (choice === 'email:other') {
        await setConv(waId, { step: 'AWAIT_HISTORY_EMAIL', draftExtra: null });
        await askHistoryEmailText(waId);
        return;
    }
    await stepMiss(waId, conv, 'Tocá una opción o escribime el email.');
}

async function handleAwaitHistoryEmail(waId: string, conv: Conversation, input: StepInput) {
    if (!isValidEmail(input.text)) {
        await stepMiss(waId, conv, 'Ese email no parece válido. Ejemplo: *juan@correo.com*');
        return;
    }
    await submitHistoryRequest(waId, conv, input.text);
}

// ---------------------------------------------------------------------------
// Cancelar turno
// ---------------------------------------------------------------------------

function appointmentOptions(appointments: ClientAppointment[]): ChoiceOption[] {
    return appointments.slice(0, 10).map((ap) => ({
        id: `cancel:${ap.id}`,
        title: formatSlotButtonLabel(ap.startsAt),
        description: `${ap.licensePlate ?? 'sin dominio'} · ${appointmentStatusWord(ap.status)}`,
    }));
}

async function startCancel(waId: string, pickIndex?: number) {
    await clearDrafts(waId);
    const appointments = await findClientAppointments(waId);
    if (appointments.length === 0) {
        await sendNoDataChoice(
            waId,
            'No tenés turnos activos con este número. ¿Querés sacar uno o hablar con el taller?'
        );
        return;
    }

    if (pickIndex !== undefined) {
        const ap = appointments[pickIndex - 1];
        if (ap) {
            await askCancelConfirm(waId, ap);
            return;
        }
    }

    if (appointments.length === 1) {
        await askCancelConfirm(waId, appointments[0]);
        return;
    }

    await setConv(waId, { step: 'AWAIT_CANCEL_CHOICE' });
    await askCancelChoice(waId);
}

async function askCancelChoice(waId: string) {
    const appointments = await findClientAppointments(waId);
    await sendChoice(waId, '¿Cuál turno querés cancelar?', appointmentOptions(appointments), {
        listButtonLabel: 'Ver turnos',
    });
}

async function askCancelConfirm(waId: string, ap: ClientAppointment) {
    await setConv(waId, { step: 'AWAIT_CANCEL_CONFIRM', draftExtra: ap.id });
    const { full } = formatDateTimeEsAr(ap.startsAt);
    await sendChoice(
        waId,
        `¿Cancelamos tu turno del *${full}*${ap.licensePlate ? ` (${ap.licensePlate})` : ''}?`,
        [
            { id: 'cancelok:yes', title: 'Sí, cancelar' },
            { id: 'cancelok:no', title: 'No, mantener' },
        ]
    );
}

async function handleAwaitCancelChoice(waId: string, conv: Conversation, input: StepInput) {
    const appointments = await findClientAppointments(waId);
    if (appointments.length === 0) {
        await clearDrafts(waId);
        await sendNoDataChoice(waId, 'No tenés turnos activos con este número.');
        return;
    }
    const options = appointmentOptions(appointments);
    const choice = input.id ?? pickByNumber(input.text, options);
    const ap = choice ? appointments.find((a) => `cancel:${a.id}` === choice) : null;
    if (!ap) {
        await stepMiss(waId, conv, 'No encontré ese turno.');
        return;
    }
    await askCancelConfirm(waId, ap);
}

async function handleAwaitCancelConfirm(waId: string, conv: Conversation, input: StepInput) {
    const choice =
        input.id ?? (isYes(input.text) ? 'cancelok:yes' : isNo(input.text) ? 'cancelok:no' : null);

    if (choice === 'cancelok:no') {
        await clearDrafts(waId);
        await sendTextMessage(waId, 'Listo, tu turno sigue como estaba.');
        return;
    }
    if (choice === 'cancelok:yes') {
        // Solo se cancela un turno que realmente es de este teléfono.
        const ap = (await findClientAppointments(waId)).find((a) => a.id === conv.draftExtra);
        await clearDrafts(waId);
        if (!ap) {
            await sendTextMessage(waId, 'Ese turno ya no está activo.');
            return;
        }
        await cancelAppointmentByClient(ap.id);
        const { full } = formatDateTimeEsAr(ap.startsAt);
        await sendTextMessage(waId, `Listo, cancelé tu turno del *${full}*. Avisamos al taller.`);
        return;
    }
    await stepMiss(waId, conv, 'Tocá *Sí, cancelar* o *No, mantener*.');
}

// ---------------------------------------------------------------------------
// Propuestas de horario del taller (botones turno_slot_N)
// ---------------------------------------------------------------------------

async function findPendingProposal(waId: string) {
    const variants = waIdLookupVariants(waId);
    return prisma.appointment.findFirst({
        where: {
            status: 'PROPUESTA_ENVIADA',
            OR: [{ whatsappWaId: { in: variants } }, { clientPhone: { in: variants } }],
        },
        orderBy: { updatedAt: 'desc' },
    });
}

function proposalOptions(slots: string[]): ChoiceOption[] {
    return slots.map((iso, i) => ({
        id: `${SLOT_BUTTON_PREFIX}${i}`,
        title: formatSlotButtonLabel(new Date(iso)),
    }));
}

async function resendProposal(waId: string): Promise<boolean> {
    const pending = await findPendingProposal(waId);
    if (!pending) return false;
    const slots = asProposedSlots(pending.proposedSlots);
    if (!slots.length) return false;
    await sendChoice(waId, 'Tenés horarios propuestos por el taller. Elegí el que te convenga:', proposalOptions(slots));
    return true;
}

/** El cliente tocó un botón `turno_slot_N` (o respondió 1/2/3 con una propuesta pendiente). */
async function handleProposalChoice(waId: string, text: string, buttonId?: string): Promise<boolean> {
    const pending = await findPendingProposal(waId);
    if (!pending) return false;

    const slots = asProposedSlots(pending.proposedSlots);
    if (slots.length === 0) return false;

    const fromButton = buttonId?.startsWith(SLOT_BUTTON_PREFIX)
        ? buttonId.slice(SLOT_BUTTON_PREFIX.length)
        : null;
    const fromText = text.trim().match(/^[1-3]$/)?.[0];
    if (fromButton === null && !fromText) return false;

    const index = fromButton !== null ? parseInt(fromButton, 10) : parseInt(fromText as string, 10) - 1;
    if (Number.isNaN(index) || index < 0 || index >= slots.length) {
        await sendTextMessage(waId, `Esa opción no está disponible. Elegí entre 1 y ${slots.length}.`);
        return true;
    }

    const startsAt = new Date(slots[index]);
    if (Number.isNaN(startsAt.getTime())) {
        await sendTextMessage(waId, 'Esa opción ya no es válida. Escribí *taller* si necesitás ayuda.');
        return true;
    }

    const updated = await prisma.appointment.update({
        where: { id: pending.id },
        data: {
            startsAt,
            status: 'CONFIRMADO',
            proposedSlots: Prisma.DbNull,
            whatsappWaId: pending.whatsappWaId || waId,
            clientPhone: pending.clientPhone || normalizeWaId(waId) || waId,
        },
    });
    refreshCalendar();

    await notifyAppointmentConfirmed({
        toWaId: waId,
        clientName: updated.clientName,
        startsAt: updated.startsAt,
    });

    await clearDrafts(waId);
    return true;
}

// ---------------------------------------------------------------------------
// Despacho
// ---------------------------------------------------------------------------

type StepInput = { id?: string; text: string };

/**
 * Respuesta inválida dentro de un paso: avisa en una línea y repite la pregunta.
 * A la segunda vez seguida ofrece salir o llamar al taller.
 */
async function stepMiss(waId: string, conv: Conversation, message: string) {
    const misses = conv.unknownCount + 1;
    const exitHint =
        misses >= 2
            ? ` Si querés salir, escribí *menu* o llamá al taller al *${getWorkshopContactPhone()}*.`
            : '';
    await sendTextMessage(waId, `${message}${exitHint}`);
    await rePrompt(waId);
    await prisma.whatsAppConversation.update({
        where: { waId },
        data: { unknownCount: misses },
    });
}

/** Repite la pregunta del paso actual. */
async function rePrompt(waId: string) {
    const conv = await getOrCreateConversation(waId);
    switch (conv.step) {
        case 'AWAIT_CAR_CHOICE':
            return askCarChoice(waId);
        case 'AWAIT_PLATE':
            return askPlate(waId);
        case 'AWAIT_PLATE_CONFIRM':
            return askPlateConfirm(waId);
        case 'AWAIT_NAME':
            return askName(waId);
        case 'AWAIT_ISSUE':
            return askIssue(waId);
        case 'AWAIT_DUP':
            return askDup(waId);
        case 'AWAIT_SLOT_DAY':
            return askDay(waId);
        case 'AWAIT_SLOT_TIME':
            return conv.draftStartsAt ? askTime(waId, conv.draftStartsAt) : askDay(waId);
        case 'AWAIT_CONFIRM':
            return askConfirm(waId);
        case 'AWAIT_STATUS_PLATE':
            return askStatusCar(waId);
        case 'AWAIT_HISTORY_PLATE':
            return askHistoryCar(waId);
        case 'AWAIT_HISTORY_EMAIL_CHOICE':
            return askHistoryEmailChoice(waId);
        case 'AWAIT_HISTORY_EMAIL':
            return askHistoryEmailText(waId);
        case 'AWAIT_CANCEL_CHOICE':
            return askCancelChoice(waId);
        case 'AWAIT_CANCEL_CONFIRM': {
            const ap = (await findClientAppointments(waId)).find((a) => a.id === conv.draftExtra);
            return ap ? askCancelConfirm(waId, ap) : startCancel(waId);
        }
        default:
            return sendMenu(waId);
    }
}

/** Respuesta del cliente (texto o botón) al paso en curso. */
async function handleStep(waId: string, conv: Conversation, input: StepInput) {
    switch (conv.step) {
        case 'AWAIT_CAR_CHOICE':
            return handleAwaitCarChoice(waId, conv, input);
        case 'AWAIT_PLATE':
            return handleAwaitPlate(waId, conv, input);
        case 'AWAIT_PLATE_CONFIRM':
            return handleAwaitPlateConfirm(waId, conv, input);
        case 'AWAIT_NAME':
            return handleAwaitName(waId, conv, input);
        case 'AWAIT_ISSUE':
            return handleAwaitIssue(waId, conv, input);
        case 'AWAIT_DUP':
            return handleAwaitDup(waId, conv, input);
        case 'AWAIT_SLOT_DAY':
            return handleAwaitSlotDay(waId, conv, input);
        case 'AWAIT_SLOT_TIME':
            return handleAwaitSlotTime(waId, conv, input);
        case 'AWAIT_CONFIRM':
            return handleAwaitConfirm(waId, conv, input);
        case 'AWAIT_STATUS_PLATE':
            return handleAwaitStatusCar(waId, conv, input);
        case 'AWAIT_HISTORY_PLATE':
            return handleAwaitHistoryCar(waId, conv, input);
        case 'AWAIT_HISTORY_EMAIL_CHOICE':
            return handleAwaitHistoryEmailChoice(waId, conv, input);
        case 'AWAIT_HISTORY_EMAIL':
            return handleAwaitHistoryEmail(waId, conv, input);
        case 'AWAIT_CANCEL_CHOICE':
            return handleAwaitCancelChoice(waId, conv, input);
        case 'AWAIT_CANCEL_CONFIRM':
            return handleAwaitCancelConfirm(waId, conv, input);
        default:
            // Paso desconocido: se descarta y se vuelve al menú.
            await clearDrafts(waId);
            return sendMenu(waId);
    }
}

async function runIntent(waId: string, detected: DetectedIntent) {
    switch (detected.intent) {
        case 'menu':
            await clearDrafts(waId);
            return sendMenu(waId, { prefix: 'Listo, empecemos de nuevo.' });
        case 'help':
            await clearDrafts(waId);
            return sendMenu(waId);
        case 'greeting':
            await clearDrafts(waId);
            return sendMenu(waId, { withName: true });
        case 'turno':
            return startTurno(waId);
        case 'status':
            return startStatus(waId, detected.plate);
        case 'history':
            return startHistory(waId, detected.plate);
        case 'cancel':
            return startCancel(waId, detected.cancelIndex);
        case 'contact':
            await clearDrafts(waId);
            return sendContact(waId);
        default:
            return sendMenu(waId);
    }
}

/** Botones del menú principal y de "Más opciones". */
async function handleMenuAction(waId: string, value: string) {
    switch (value) {
        case 'turno':
            return startTurno(waId);
        case 'estado':
            return startStatus(waId);
        case 'historial':
            return startHistory(waId);
        case 'cancelar':
            return startCancel(waId);
        case 'mas':
            await clearDrafts(waId);
            return sendMoreOptions(waId);
        case 'taller':
            await clearDrafts(waId);
            return sendContact(waId);
        default:
            return sendMenu(waId);
    }
}

async function handleAction(waId: string, conv: Conversation, buttonId: string, title: string) {
    const [kind, ...rest] = buttonId.split(':');
    if (kind === 'menu') {
        await handleMenuAction(waId, rest.join(':'));
        return;
    }

    const accepted = STEP_BUTTON_KIND[conv.step];
    if (!accepted || !accepted.split('|').includes(kind)) {
        await sendStaleOption(waId);
        return;
    }
    await handleStep(waId, conv, { id: buttonId, text: title });
}

async function handleText(waId: string, conv: Conversation, text: string) {
    // 1/2/3 sin nada en curso: respuesta a una propuesta de horarios del taller.
    if (conv.step === 'IDLE' && /^[1-3]$/.test(text)) {
        if (await handleProposalChoice(waId, text)) return;
    }

    const detected = detectIntent(text);
    const keyword = normalizeBotKeyword(text);

    // Reiniciar / menú: siempre, en cualquier paso.
    if (detected.intent === 'menu') {
        await runIntent(waId, detected);
        return;
    }

    if (conv.step !== 'IDLE') {
        // "cancelar" en medio de un pedido = abandonar el pedido (no cancelar un turno).
        if (!conv.step.startsWith('AWAIT_CANCEL') && CANCEL_WORDS.has(keyword)) {
            await clearDrafts(waId);
            await sendMenu(waId, { prefix: 'Listo, dejé el pedido sin guardar.' });
            return;
        }

        if (detected.intent === 'help') {
            await sendTextMessage(waId, 'Seguimos con tu pedido. Si querés salir, escribí *menu*.');
            await rePrompt(waId);
            return;
        }

        // En pasos de texto libre las palabras clave no interrumpen (una avería puede decir "historial").
        if (!FREE_TEXT_STEPS.has(conv.step) && detected.intent) {
            await runIntent(waId, detected);
            return;
        }

        await handleStep(waId, conv, { text });
        return;
    }

    // IDLE
    if (detected.intent) {
        await runIntent(waId, detected);
        return;
    }

    // No se entendió: si hay horarios propuestos pendientes se los recuerda, si no, menú.
    if (await resendProposal(waId)) return;

    const misses = conv.unknownCount + 1;
    await sendMenu(waId, { prefix: 'No te entendí.' });
    if (misses >= 2) {
        await sendContact(waId, 'Si preferís, hablá directamente con el taller.');
    }
    await prisma.whatsAppConversation.update({ where: { waId }, data: { unknownCount: misses } });
}

/**
 * FSM del bot. Pasos:
 *   Turno:    AWAIT_CAR_CHOICE | AWAIT_PLATE → [AWAIT_PLATE_CONFIRM] → [AWAIT_DUP] → [AWAIT_NAME]
 *             → AWAIT_ISSUE → AWAIT_SLOT_DAY → AWAIT_SLOT_TIME → AWAIT_CONFIRM → crea PENDIENTE
 *   Estado:   [AWAIT_STATUS_PLATE]
 *   Historial:[AWAIT_HISTORY_PLATE] → AWAIT_HISTORY_EMAIL_CHOICE | AWAIT_HISTORY_EMAIL
 *   Cancelar: [AWAIT_CANCEL_CHOICE] → AWAIT_CANCEL_CONFIRM → CANCELADO
 *
 * Reglas:
 * - El Appointment solo se crea al confirmar; los drafts son descartables.
 * - El timeout de 30 min se evalúa al próximo mensaje del cliente y se le avisa.
 * - Cancelar NO borra: deja el turno en CANCELADO.
 * - El bot nunca modifica datos maestros (dominio del auto, email del cliente).
 */
export async function handleIncomingWhatsAppMessage(msg: IncomingMessage): Promise<void> {
    const waId = normalizeWaId(msg.from) || msg.from;

    if (msg.unsupported) {
        await sendMenu(waId, {
            prefix: 'Por acá solo puedo leer mensajes de texto.',
        });
        return;
    }

    const text = (msg.text || '').trim();
    const buttonId = msg.buttonId?.trim();
    if (!text && !buttonId) return;

    // Botón/plantilla de propuesta del taller (turno_slot_N)
    if (buttonId?.startsWith(SLOT_BUTTON_PREFIX)) {
        if (await handleProposalChoice(waId, text, buttonId)) return;
        await sendStaleOption(waId);
        return;
    }

    let conv = await getOrCreateConversation(waId);

    // Timeout por inactividad: se descarta el borrador y se avisa al cliente.
    if (conv.step !== 'IDLE' && Date.now() - conv.updatedAt.getTime() > CONVERSATION_IDLE_MS) {
        await clearDrafts(waId);
        conv = await getOrCreateConversation(waId);

        const startsFresh = buttonId
            ? buttonId.startsWith('menu:')
            : detectIntent(text).intent !== null;
        if (!startsFresh) {
            await sendChoice(
                waId,
                'El pedido se cerró por inactividad y no se guardó nada. ¿Empezamos de nuevo?',
                [
                    { id: 'menu:turno', title: 'Sacar turno' },
                    { id: 'menu:inicio', title: 'Ver menú' },
                ],
                { fallbackText: 'El pedido se cerró por inactividad y no se guardó nada. Escribí *turno* o *menu* para empezar de nuevo.' }
            );
            return;
        }
    }

    if (buttonId) {
        await handleAction(waId, conv, buttonId, text);
        return;
    }

    await handleText(waId, conv, text);
}
