'use server'

import { revalidatePath } from 'next/cache';
import { InterventionItemType, Prisma, QuoteStatus } from '../../generated/prisma';
import prisma from '../../lib/prisma';
import { normalizeLicensePlate } from '../../lib/utils';
import { requireStaff } from '@/lib/auth-guards';
import { WORKSHOP_SETTINGS_ID } from '@/lib/workshop-schedule';
import { startOfDay } from '@/lib/whatsapp/phone';
import { renderToBuffer } from '@react-pdf/renderer';
import { getLogoBase64 } from '@/lib/pdf-logo';
import { QuotePdf, type QuotePdfData } from '@/components/quotes/QuotePdf';
import { isMailConfigured, sendMailWithPdfAttachment } from '@/lib/mail/smtp';

const QUOTE_PAGE_SIZE = 10;

/** Estado a mostrar: el de la base, o VENCIDO si está BORRADOR/ENVIADO con validez pasada. */
export type QuoteDisplayStatus = QuoteStatus | 'VENCIDO';

const QUOTE_STATUSES: readonly QuoteStatus[] = ['BORRADOR', 'ENVIADO', 'ACEPTADO', 'RECHAZADO'];
const EXPIRABLE_STATUSES: readonly QuoteStatus[] = ['BORRADOR', 'ENVIADO'];

/** Inicio del día actual en hora local del taller (el proceso corre con TZ del taller). */
function todayStart(): Date {
    return startOfDay(new Date());
}

function displayStatusOf(status: QuoteStatus, validUntil: Date, today: Date): QuoteDisplayStatus {
    return EXPIRABLE_STATUSES.includes(status) && validUntil < today ? 'VENCIDO' : status;
}

/** Filtro por estado *mostrado*: BORRADOR/ENVIADO excluyen los vencidos; VENCIDO es el calculado. */
function statusWhere(estado: string, today: Date): Prisma.QuoteWhereInput {
    if (estado === 'VENCIDO') {
        return { status: { in: [...EXPIRABLE_STATUSES] }, validUntil: { lt: today } };
    }
    if ((QUOTE_STATUSES as readonly string[]).includes(estado)) {
        const status = estado as QuoteStatus;
        return EXPIRABLE_STATUSES.includes(status)
            ? { status, validUntil: { gte: today } }
            : { status };
    }
    return {};
}

/** Cada palabra debe matchear Nº, nombre del cliente o dominio (ignorando guiones/espacios). */
function searchWhere(query: string): Prisma.QuoteWhereInput {
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return {};

    const termClause = (term: string): Prisma.QuoteWhereInput => {
        const cleanNumber = term.replace(/^#|^n[ºo°]?/i, '');
        const or: Prisma.QuoteWhereInput[] = [
            { customerName: { contains: term, mode: 'insensitive' } },
        ];
        const plate = normalizeLicensePlate(term);
        if (plate.length >= 2) or.push({ vehiclePlate: { contains: plate } });
        if (/^\d+$/.test(cleanNumber)) {
            const n = Number(cleanNumber);
            if (Number.isSafeInteger(n) && n <= 2_147_483_647) or.push({ quoteNumber: n });
        }
        return { OR: or };
    };

    return { AND: terms.map(termClause) };
}

// ====================================================================
// A. LISTADO PAGINADO
// ====================================================================

export interface QuoteListItem {
    id: string;
    quoteNumber: number;
    createdAt: string;
    validUntil: string;
    customerName: string;
    vehiclePlate: string | null;
    vehicleDescription: string | null;
    total: number;
    status: QuoteStatus;
    displayStatus: QuoteDisplayStatus;
    interventionId: string | null;
}

export interface QuotesPageResult {
    quotes: QuoteListItem[];
    totalCount: number;
    totalPages: number;
    currentPage: number;
}

export async function getQuotesPage(params: {
    page?: number;
    query?: string;
    status?: string;
}): Promise<QuotesPageResult> {
    const empty: QuotesPageResult = { quotes: [], totalCount: 0, totalPages: 0, currentPage: 1 };

    const session = await requireStaff();
    if (!session) return empty;

    const rawPage = params.page ?? 1;
    const currentPage = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const today = todayStart();

    const where: Prisma.QuoteWhereInput = {
        AND: [statusWhere(params.status ?? '', today), searchWhere(params.query ?? '')],
    };

    try {
        const [totalCount, rows] = await Promise.all([
            prisma.quote.count({ where }),
            prisma.quote.findMany({
                where,
                orderBy: { quoteNumber: 'desc' },
                skip: (currentPage - 1) * QUOTE_PAGE_SIZE,
                take: QUOTE_PAGE_SIZE,
                select: {
                    id: true,
                    quoteNumber: true,
                    createdAt: true,
                    validUntil: true,
                    customerName: true,
                    vehiclePlate: true,
                    vehicleDescription: true,
                    total: true,
                    status: true,
                    interventionId: true,
                },
            }),
        ]);

        return {
            quotes: rows.map((q) => ({
                id: q.id,
                quoteNumber: q.quoteNumber,
                createdAt: q.createdAt.toISOString(),
                validUntil: q.validUntil.toISOString(),
                customerName: q.customerName,
                vehiclePlate: q.vehiclePlate,
                vehicleDescription: q.vehicleDescription,
                total: q.total.toNumber(),
                status: q.status,
                displayStatus: displayStatusOf(q.status, q.validUntil, today),
                interventionId: q.interventionId,
            })),
            totalCount,
            totalPages: Math.ceil(totalCount / QUOTE_PAGE_SIZE),
            currentPage,
        };
    } catch (error) {
        console.error('Error fetching quotes page:', error);
        return empty;
    }
}

// ====================================================================
// B. DETALLE
// ====================================================================

export interface QuoteItemRow {
    id: string;
    type: InterventionItemType;
    description: string;
    amount: number;
    sortOrder: number;
}

export interface QuoteDetail {
    id: string;
    quoteNumber: number;
    status: QuoteStatus;
    displayStatus: QuoteDisplayStatus;
    clientId: string | null;
    /** Texto del cliente vinculado (para mostrar el vínculo), o null. */
    clientLabel: string | null;
    carId: string | null;
    /** Texto del auto vinculado (para mostrar el vínculo), o null. */
    carLabel: string | null;
    /** El presupuesto todavía se puede editar (status != ACEPTADO). */
    editable: boolean;
    customerName: string;
    customerPhone: string | null;
    customerEmail: string | null;
    vehiclePlate: string | null;
    vehicleDescription: string | null;
    description: string | null;
    notes: string | null;
    validUntil: string;
    total: number;
    totalsByType: Record<InterventionItemType, number>;
    sentAt: string | null;
    acceptedAt: string | null;
    rejectedAt: string | null;
    intervention: { id: string; otNumber: number } | null;
    createdBy: { id: string; name: string | null };
    createdAt: string;
    items: QuoteItemRow[];
}

export async function getQuoteDetail(id: string): Promise<QuoteDetail | null> {
    const session = await requireStaff();
    if (!session) return null;

    const q = await prisma.quote.findUnique({
        where: { id },
        include: {
            items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
            intervention: { select: { id: true, otNumber: true } },
            createdBy: { select: { id: true, name: true } },
            client: { select: { firstName: true, lastName: true, dni: true } },
            car: { select: { licensePlate: true, make: true, model: true, year: true } },
        },
    });
    if (!q) return null;

    const totalsByType: Record<InterventionItemType, number> = {
        MANO_DE_OBRA: 0,
        REPUESTO: 0,
        TRABAJO_TERCERO: 0,
    };
    const items: QuoteItemRow[] = q.items.map((it) => {
        const amount = it.amount.toNumber();
        totalsByType[it.type] += amount;
        return { id: it.id, type: it.type, description: it.description, amount, sortOrder: it.sortOrder };
    });

    return {
        id: q.id,
        quoteNumber: q.quoteNumber,
        status: q.status,
        displayStatus: displayStatusOf(q.status, q.validUntil, todayStart()),
        clientId: q.clientId,
        clientLabel: q.client ? `${q.client.firstName} ${q.client.lastName} · DNI ${q.client.dni}` : null,
        carId: q.carId,
        carLabel: q.car
            ? [q.car.licensePlate, describeCar(q.car)].filter(Boolean).join(' · ')
            : null,
        editable: q.status !== 'ACEPTADO',
        customerName: q.customerName,
        customerPhone: q.customerPhone,
        customerEmail: q.customerEmail,
        vehiclePlate: q.vehiclePlate,
        vehicleDescription: q.vehicleDescription,
        description: q.description,
        notes: q.notes,
        validUntil: q.validUntil.toISOString(),
        total: q.total.toNumber(),
        totalsByType,
        sentAt: q.sentAt?.toISOString() ?? null,
        acceptedAt: q.acceptedAt?.toISOString() ?? null,
        rejectedAt: q.rejectedAt?.toISOString() ?? null,
        intervention: q.intervention,
        createdBy: q.createdBy,
        createdAt: q.createdAt.toISOString(),
        items,
    };
}

// ====================================================================
// C. ALTA
// ====================================================================

export interface QuoteFormInput {
    clientId?: string | null;
    carId?: string | null;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    vehiclePlate?: string;
    vehicleDescription?: string;
    description?: string;
    notes?: string;
    /** YYYY-MM-DD (hora local del taller). Vacío → hoy + quoteValidityDays. */
    validUntil?: string;
}

export interface QuoteActionResult {
    success: boolean;
    message: string;
    quote?: { id: string; quoteNumber: number };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: string | null | undefined): string | null {
    const v = (value ?? '').trim();
    return v.length > 0 ? v : null;
}

/** Parsea YYYY-MM-DD como medianoche local. */
function parseLocalDate(value: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

function describeCar(car: { make: string | null; model: string | null; year: number | null }): string | null {
    return clean([car.make, car.model, car.year?.toString()].filter(Boolean).join(' '));
}

type QuoteFields = Omit<Prisma.QuoteUncheckedCreateInput, 'createdById'>;

/**
 * Valida y normaliza los datos del formulario.
 * `fillFromLinked`: en el alta, los campos vacíos se completan desde el Client/Car vinculado.
 * En la edición se toman tal cual vienen (el formulario ya trae el snapshot precargado).
 */
async function buildQuoteFields(
    input: QuoteFormInput,
    opts: { fillFromLinked: boolean; keepValidUntil?: Date }
): Promise<{ fields: QuoteFields } | { error: string }> {
    const clientId = clean(input.clientId);
    const carId = clean(input.carId);

    const [client, car] = await Promise.all([
        clientId ? prisma.client.findUnique({ where: { id: clientId } }) : null,
        carId ? prisma.car.findUnique({ where: { id: carId } }) : null,
    ]);
    if (clientId && !client) return { error: 'El cliente seleccionado no existe.' };
    if (carId && !car) return { error: 'El vehículo seleccionado no existe.' };

    const linkedClient = opts.fillFromLinked ? client : null;
    const linkedCar = opts.fillFromLinked ? car : null;

    // Snapshot: lo que venga en el formulario manda; si falta (solo en alta), se toma del registro vinculado.
    const customerName =
        clean(input.customerName) ??
        (linkedClient ? clean(`${linkedClient.firstName} ${linkedClient.lastName}`) : null);
    const customerPhone = clean(input.customerPhone) ?? linkedClient?.phone ?? null;
    const customerEmail = clean(input.customerEmail) ?? linkedClient?.email ?? null;
    const plateRaw = clean(input.vehiclePlate) ?? linkedCar?.licensePlate ?? null;
    const vehiclePlate = plateRaw ? normalizeLicensePlate(plateRaw) : null;
    const vehicleDescription = clean(input.vehicleDescription) ?? (linkedCar ? describeCar(linkedCar) : null);

    if (!customerName) return { error: 'Ingresá el nombre del cliente.' };
    if (customerEmail && !EMAIL_RE.test(customerEmail)) {
        return { error: 'El email del cliente no tiene un formato válido.' };
    }

    let validUntil: Date;
    if (clean(input.validUntil)) {
        const parsed = parseLocalDate(input.validUntil!);
        if (!parsed) return { error: 'La fecha "válido hasta" no es válida.' };
        validUntil = parsed;
    } else if (opts.keepValidUntil) {
        validUntil = opts.keepValidUntil;
    } else {
        const settings = await prisma.workshopSettings.findUnique({
            where: { id: WORKSHOP_SETTINGS_ID },
            select: { quoteValidityDays: true },
        });
        const days = settings?.quoteValidityDays ?? 15;
        const today = todayStart();
        validUntil = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
    }

    return {
        fields: {
            clientId,
            carId,
            customerName,
            customerPhone,
            customerEmail,
            vehiclePlate,
            vehicleDescription,
            description: clean(input.description),
            notes: clean(input.notes),
            validUntil,
        },
    };
}

export async function createQuote(input: QuoteFormInput): Promise<QuoteActionResult> {
    const session = await requireStaff();
    if (!session) {
        return { success: false, message: 'Acceso denegado. Se requiere ser personal del taller.' };
    }

    const built = await buildQuoteFields(input, { fillFromLinked: true });
    if ('error' in built) return { success: false, message: built.error };

    try {
        // quoteNumber lo asigna la secuencia de Postgres (autoincrement): nunca se reutiliza.
        const quote = await prisma.quote.create({
            data: { ...built.fields, createdById: session.user.id },
            select: { id: true, quoteNumber: true },
        });

        revalidatePath('/dashboard/presupuestos');
        return { success: true, message: `Presupuesto Nº ${quote.quoteNumber} creado.`, quote };
    } catch (error) {
        console.error('Error creating quote:', error);
        return { success: false, message: 'Error al crear el presupuesto.' };
    }
}

// ====================================================================
// D. EDICIÓN (bloqueada si el presupuesto está ACEPTADO)
// ====================================================================

const ACCESS_DENIED = 'Acceso denegado. Se requiere ser personal del taller.';
const LOCKED_MESSAGE = 'El presupuesto está aceptado: es un documento cerrado y no se puede modificar.';

/** Error de negocio que se lanza dentro de una transacción y se devuelve como mensaje. */
class QuoteRuleError extends Error {}

/** Verifica dentro de la transacción que el presupuesto exista y no esté ACEPTADO. */
async function assertEditableInTx(tx: Prisma.TransactionClient, quoteId: string) {
    const quote = await tx.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
    if (!quote) throw new QuoteRuleError('El presupuesto no existe.');
    if (quote.status === 'ACEPTADO') throw new QuoteRuleError(LOCKED_MESSAGE);
}

/** Recalcula Quote.total como la suma de los importes de sus ítems. */
async function recalcTotalInTx(tx: Prisma.TransactionClient, quoteId: string) {
    const agg = await tx.quoteItem.aggregate({ where: { quoteId }, _sum: { amount: true } });
    await tx.quote.update({
        where: { id: quoteId },
        data: { total: agg._sum.amount ?? new Prisma.Decimal(0) },
    });
}

function revalidateQuote(quoteId: string) {
    revalidatePath('/dashboard/presupuestos');
    revalidatePath(`/dashboard/presupuestos/${quoteId}`);
}

function toResult(error: unknown, fallback: string): { success: false; message: string } {
    if (error instanceof QuoteRuleError) return { success: false, message: error.message };
    console.error(fallback, error);
    return { success: false, message: fallback };
}

export async function updateQuote(id: string, input: QuoteFormInput): Promise<QuoteActionResult> {
    const session = await requireStaff();
    if (!session) return { success: false, message: ACCESS_DENIED };

    const current = await prisma.quote.findUnique({ where: { id }, select: { validUntil: true } });
    if (!current) return { success: false, message: 'El presupuesto no existe.' };

    const built = await buildQuoteFields(input, { fillFromLinked: false, keepValidUntil: current.validUntil });
    if ('error' in built) return { success: false, message: built.error };

    try {
        const quote = await prisma.$transaction(async (tx) => {
            await assertEditableInTx(tx, id);
            return tx.quote.update({
                where: { id },
                data: built.fields,
                select: { id: true, quoteNumber: true },
            });
        });
        revalidateQuote(id);
        return { success: true, message: 'Datos del presupuesto actualizados.', quote };
    } catch (error) {
        return toResult(error, 'Error al actualizar el presupuesto.');
    }
}

const ITEM_TYPES: readonly InterventionItemType[] = ['MANO_DE_OBRA', 'REPUESTO', 'TRABAJO_TERCERO'];

export interface UpsertQuoteItemInput {
    quoteId: string;
    /** Si viene, se edita ese ítem; si no, se agrega uno nuevo. */
    itemId?: string;
    type: string;
    description: string;
    /** Importe manual en ARS. Puede ser negativo (descuento cargado como ítem). */
    amount: string;
}

export async function upsertQuoteItem(
    input: UpsertQuoteItemInput
): Promise<{ success: boolean; message: string }> {
    const session = await requireStaff();
    if (!session) return { success: false, message: ACCESS_DENIED };

    if (!(ITEM_TYPES as readonly string[]).includes(input.type)) {
        return { success: false, message: 'Tipo de ítem inválido.' };
    }
    const type = input.type as InterventionItemType;
    const description = input.description.trim();
    if (!description) return { success: false, message: 'Ingresá la descripción del ítem.' };

    const amountNum = Number(String(input.amount).replace(',', '.'));
    if (!String(input.amount).trim() || !Number.isFinite(amountNum)) {
        return { success: false, message: 'El importe debe ser un número válido.' };
    }
    if (Math.abs(amountNum) >= 1e8) {
        return { success: false, message: 'El importe es demasiado grande.' };
    }
    const amount = new Prisma.Decimal(amountNum.toFixed(2));

    try {
        await prisma.$transaction(async (tx) => {
            await assertEditableInTx(tx, input.quoteId);

            if (input.itemId) {
                const existing = await tx.quoteItem.findFirst({
                    where: { id: input.itemId, quoteId: input.quoteId },
                    select: { id: true },
                });
                if (!existing) throw new QuoteRuleError('El ítem no existe en este presupuesto.');
                await tx.quoteItem.update({
                    where: { id: input.itemId },
                    data: { type, description, amount },
                });
            } else {
                const last = await tx.quoteItem.aggregate({
                    where: { quoteId: input.quoteId },
                    _max: { sortOrder: true },
                });
                await tx.quoteItem.create({
                    data: {
                        quoteId: input.quoteId,
                        type,
                        description,
                        amount,
                        sortOrder: (last._max.sortOrder ?? -1) + 1,
                    },
                });
            }

            await recalcTotalInTx(tx, input.quoteId);
        });
        revalidateQuote(input.quoteId);
        return { success: true, message: input.itemId ? 'Ítem actualizado.' : 'Ítem agregado.' };
    } catch (error) {
        return toResult(error, 'Error al guardar el ítem.');
    }
}

export async function deleteQuoteItem(
    itemId: string,
    quoteId: string
): Promise<{ success: boolean; message: string }> {
    const session = await requireStaff();
    if (!session) return { success: false, message: ACCESS_DENIED };

    try {
        await prisma.$transaction(async (tx) => {
            await assertEditableInTx(tx, quoteId);
            const deleted = await tx.quoteItem.deleteMany({ where: { id: itemId, quoteId } });
            if (deleted.count === 0) throw new QuoteRuleError('El ítem no existe en este presupuesto.');
            await recalcTotalInTx(tx, quoteId);
        });
        revalidateQuote(quoteId);
        return { success: true, message: 'Ítem eliminado.' };
    } catch (error) {
        return toResult(error, 'Error al eliminar el ítem.');
    }
}

// ====================================================================
// E. BORRADO (solo presupuestos no aceptados)
// ====================================================================

export async function deleteQuote(id: string): Promise<{ success: boolean; message: string }> {
    const session = await requireStaff();
    if (!session) return { success: false, message: ACCESS_DENIED };

    try {
        const quoteNumber = await prisma.$transaction(async (tx) => {
            const quote = await tx.quote.findUnique({ where: { id }, select: { status: true, quoteNumber: true } });
            if (!quote) throw new QuoteRuleError('El presupuesto no existe.');
            if (quote.status === 'ACEPTADO') {
                throw new QuoteRuleError('El presupuesto está aceptado: es un documento cerrado y no se puede borrar.');
            }
            // Los ítems se borran en cascada (QuoteItem.quote onDelete: Cascade).
            await tx.quote.delete({ where: { id } });
            return quote.quoteNumber;
        });
        revalidateQuote(id);
        return { success: true, message: `Presupuesto Nº ${quoteNumber} borrado.` };
    } catch (error) {
        return toResult(error, 'Error al borrar el presupuesto.');
    }
}

// ====================================================================
// F. PDF (disponible en cualquier estado)
// ====================================================================

/** Arma el PDF con los datos actuales del presupuesto. Lo reutiliza el envío por email. */
async function renderQuotePdf(quoteId: string): Promise<{ buffer: Buffer; quoteNumber: number } | null> {
    const q = await prisma.quote.findUnique({
        where: { id: quoteId },
        include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!q) return null;

    const totalsByType: Record<InterventionItemType, number> = { MANO_DE_OBRA: 0, REPUESTO: 0, TRABAJO_TERCERO: 0 };
    const items = q.items.map((it) => {
        const amount = it.amount.toNumber();
        totalsByType[it.type] += amount;
        return { type: it.type, description: it.description, amount };
    });

    const data: QuotePdfData = {
        quoteNumber: q.quoteNumber,
        createdAt: q.createdAt,
        validUntil: q.validUntil,
        logoSrc: getLogoBase64(),
        customer: { name: q.customerName, phone: q.customerPhone, email: q.customerEmail },
        vehicle: { plate: q.vehiclePlate, description: q.vehicleDescription },
        description: q.description,
        notes: q.notes,
        items,
        totalsByType,
        total: q.total.toNumber(),
    };

    const buffer = await renderToBuffer(<QuotePdf data={data} />);
    return { buffer, quoteNumber: q.quoteNumber };
}

export async function generateQuotePdfBase64(quoteId: string): Promise<{
    success: boolean;
    base64Data?: string;
    fileName?: string;
    message?: string;
}> {
    const session = await requireStaff();
    if (!session) return { success: false, message: ACCESS_DENIED };

    try {
        const pdf = await renderQuotePdf(quoteId);
        if (!pdf) return { success: false, message: 'El presupuesto no existe.' };
        return {
            success: true,
            base64Data: pdf.buffer.toString('base64'),
            fileName: `Presupuesto-${pdf.quoteNumber}.pdf`,
        };
    } catch (error) {
        console.error('Error generating quote PDF:', error);
        return { success: false, message: 'Error al generar el PDF del presupuesto.' };
    }
}

// ====================================================================
// G. EMITIR Y REENVIAR
// ====================================================================

const MAIL_NOT_CONFIGURED =
    'El correo no está configurado (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM). No se envió nada.';

const formatMoneyAr = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

/** Envía el PDF actual del presupuesto al email indicado. */
async function sendQuoteEmail(
    quote: { id: string; quoteNumber: number; customerName: string; total: Prisma.Decimal; validUntil: Date },
    to: string
): Promise<{ ok: true } | { ok: false; message: string }> {
    const pdf = await renderQuotePdf(quote.id);
    if (!pdf) return { ok: false, message: 'El presupuesto no existe.' };

    return sendMailWithPdfAttachment({
        to,
        subject: `Presupuesto Nº ${quote.quoteNumber} — Nóbile`,
        text:
            `Hola ${quote.customerName},\n\n` +
            `Te enviamos adjunto el presupuesto Nº ${quote.quoteNumber} ` +
            `por un total de ${formatMoneyAr(quote.total.toNumber())}, ` +
            `válido hasta el ${quote.validUntil.toLocaleDateString('es-AR')}.\n\n` +
            `Ante cualquier consulta, respondé este correo o escribinos por WhatsApp.\n\n` +
            `— Nóbile, Servicios del automotor`,
        pdfBuffer: pdf.buffer,
        pdfFilename: `Presupuesto-${quote.quoteNumber}.pdf`,
    });
}

export interface IssueQuoteResult {
    success: boolean;
    message: string;
    /** true si se mandó el email; false si no había email (la UI ofrece descargar el PDF). */
    emailed?: boolean;
}

/**
 * Emite un presupuesto en BORRADOR.
 * - Con email: lo envía y, solo si el envío sale bien, pasa a ENVIADO.
 * - Sin email: pasa a ENVIADO sin enviar nada.
 */
export async function issueQuote(id: string): Promise<IssueQuoteResult> {
    const session = await requireStaff();
    if (!session) return { success: false, message: ACCESS_DENIED };

    const quote = await prisma.quote.findUnique({
        where: { id },
        select: { id: true, quoteNumber: true, status: true, customerName: true, customerEmail: true, total: true, validUntil: true },
    });
    if (!quote) return { success: false, message: 'El presupuesto no existe.' };
    if (quote.status !== 'BORRADOR') {
        return { success: false, message: 'Solo se puede emitir un presupuesto en borrador.' };
    }

    const email = clean(quote.customerEmail);
    if (email) {
        if (!EMAIL_RE.test(email)) {
            return { success: false, message: 'El email del cliente no tiene un formato válido. Corregilo antes de emitir.' };
        }
        if (!isMailConfigured()) return { success: false, message: MAIL_NOT_CONFIGURED };

        try {
            const mail = await sendQuoteEmail(quote, email);
            if (!mail.ok) {
                return { success: false, message: `No se pudo enviar el email: ${mail.message}. El presupuesto sigue en borrador.` };
            }
        } catch (error) {
            console.error('Error sending quote email:', error);
            return { success: false, message: 'No se pudo enviar el email. El presupuesto sigue en borrador.' };
        }
    }

    // Condicional sobre BORRADOR: si otro usuario lo cambió mientras tanto, no se pisa.
    const updated = await prisma.quote.updateMany({
        where: { id, status: 'BORRADOR' },
        data: { status: 'ENVIADO', sentAt: new Date() },
    });
    revalidateQuote(id);

    if (updated.count === 0) {
        return { success: false, message: 'El presupuesto cambió de estado mientras se emitía. Recargá la página.' };
    }
    return email
        ? { success: true, emailed: true, message: `Presupuesto Nº ${quote.quoteNumber} enviado a ${email}.` }
        : {
              success: true,
              emailed: false,
              message: `Presupuesto Nº ${quote.quoteNumber} emitido sin email. Descargá el PDF para entregarlo.`,
          };
}

/** Reenvía el PDF actual a un presupuesto ENVIADO o ACEPTADO con email. No cambia el estado; actualiza sentAt. */
export async function resendQuoteEmail(id: string): Promise<{ success: boolean; message: string }> {
    const session = await requireStaff();
    if (!session) return { success: false, message: ACCESS_DENIED };

    const quote = await prisma.quote.findUnique({
        where: { id },
        select: { id: true, quoteNumber: true, status: true, customerName: true, customerEmail: true, total: true, validUntil: true },
    });
    if (!quote) return { success: false, message: 'El presupuesto no existe.' };
    if (quote.status !== 'ENVIADO' && quote.status !== 'ACEPTADO') {
        return { success: false, message: 'Solo se puede reenviar un presupuesto enviado o aceptado.' };
    }

    const email = clean(quote.customerEmail);
    if (!email) return { success: false, message: 'El presupuesto no tiene email del cliente.' };
    if (!EMAIL_RE.test(email)) return { success: false, message: 'El email del cliente no tiene un formato válido.' };
    if (!isMailConfigured()) return { success: false, message: MAIL_NOT_CONFIGURED };

    try {
        const mail = await sendQuoteEmail(quote, email);
        if (!mail.ok) return { success: false, message: `No se pudo enviar el email: ${mail.message}` };
    } catch (error) {
        console.error('Error resending quote email:', error);
        return { success: false, message: 'No se pudo enviar el email.' };
    }

    await prisma.quote.update({ where: { id }, data: { sentAt: new Date() } });
    revalidateQuote(id);
    return { success: true, message: `Presupuesto Nº ${quote.quoteNumber} reenviado a ${email}.` };
}

// ====================================================================
// H. ACEPTAR Y RECHAZAR
// ====================================================================

/**
 * Marca el presupuesto como ACEPTADO. Solo desde ENVIADO (aunque esté vencido).
 * Es irreversible: a partir de acá el presupuesto es un documento cerrado.
 */
export async function acceptQuote(id: string): Promise<{ success: boolean; message: string }> {
    const session = await requireStaff();
    if (!session) return { success: false, message: ACCESS_DENIED };

    try {
        // Condicional sobre el estado: evita aceptar algo que otro usuario cambió mientras tanto.
        const updated = await prisma.quote.updateMany({
            where: { id, status: 'ENVIADO' },
            data: { status: 'ACEPTADO', acceptedAt: new Date() },
        });
        if (updated.count === 0) {
            const exists = await prisma.quote.findUnique({ where: { id }, select: { status: true } });
            if (!exists) return { success: false, message: 'El presupuesto no existe.' };
            if (exists.status === 'ACEPTADO') return { success: false, message: 'El presupuesto ya está aceptado.' };
            return { success: false, message: 'Solo se puede aceptar un presupuesto enviado.' };
        }
        revalidateQuote(id);
        return { success: true, message: 'Presupuesto aceptado. Quedó cerrado y ya no se puede modificar ni borrar.' };
    } catch (error) {
        return toResult(error, 'Error al aceptar el presupuesto.');
    }
}

/** Marca el presupuesto como RECHAZADO. Desde BORRADOR o ENVIADO. */
export async function rejectQuote(id: string): Promise<{ success: boolean; message: string }> {
    const session = await requireStaff();
    if (!session) return { success: false, message: ACCESS_DENIED };

    try {
        const updated = await prisma.quote.updateMany({
            where: { id, status: { in: ['BORRADOR', 'ENVIADO'] } },
            data: { status: 'RECHAZADO', rejectedAt: new Date() },
        });
        if (updated.count === 0) {
            const exists = await prisma.quote.findUnique({ where: { id }, select: { status: true } });
            if (!exists) return { success: false, message: 'El presupuesto no existe.' };
            if (exists.status === 'ACEPTADO') return { success: false, message: LOCKED_MESSAGE };
            return { success: false, message: 'El presupuesto ya está rechazado.' };
        }
        revalidateQuote(id);
        return { success: true, message: 'Presupuesto marcado como rechazado.' };
    } catch (error) {
        return toResult(error, 'Error al rechazar el presupuesto.');
    }
}

// ====================================================================
// I. CONVERTIR EN OT (precarga del formulario "Abrir OT")
// ====================================================================

export interface QuoteForOt {
    id: string;
    quoteNumber: number;
    customerName: string;
    customerPhone: string | null;
    customerEmail: string | null;
    vehiclePlate: string | null;
    vehicleDescription: string | null;
    description: string | null;
    notes: string | null;
    total: number;
    items: { type: InterventionItemType; description: string; amount: number }[];
    /** Auto vinculado, con la forma que usa NewInterventionForm (incluye su dueño actual). */
    car: {
        id: string;
        plate: string;
        make: string;
        model: string;
        year: number | null;
        vin: string;
        ownerId: string | null;
        ownerName: string;
        ownerDni: string | null;
        ownerPhone: string | null;
    } | null;
    /** Cliente vinculado. */
    client: { id: string; fullName: string; dni: string; phone: string | null } | null;
}

/** Presupuesto ACEPTADO y todavía sin OT, listo para precargar "Abrir OT". Si no cumple, null. */
export async function getQuoteForOt(id: string): Promise<QuoteForOt | null> {
    const session = await requireStaff();
    if (!session) return null;

    const q = await prisma.quote.findUnique({
        where: { id },
        include: {
            items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
            client: { select: { id: true, firstName: true, lastName: true, dni: true, phone: true } },
            car: {
                select: {
                    id: true,
                    licensePlate: true,
                    make: true,
                    model: true,
                    year: true,
                    vin: true,
                    ownershipHistory: {
                        where: { endDate: null },
                        take: 1,
                        select: { client: { select: { id: true, firstName: true, lastName: true, dni: true, phone: true } } },
                    },
                },
            },
        },
    });
    if (!q || q.status !== 'ACEPTADO' || q.interventionId) return null;

    const owner = q.car?.ownershipHistory[0]?.client ?? null;

    return {
        id: q.id,
        quoteNumber: q.quoteNumber,
        customerName: q.customerName,
        customerPhone: q.customerPhone,
        customerEmail: q.customerEmail,
        vehiclePlate: q.vehiclePlate,
        vehicleDescription: q.vehicleDescription,
        description: q.description,
        notes: q.notes,
        total: q.total.toNumber(),
        items: q.items.map((it) => ({ type: it.type, description: it.description, amount: it.amount.toNumber() })),
        car: q.car
            ? {
                  id: q.car.id,
                  plate: q.car.licensePlate,
                  make: q.car.make || 'N/A',
                  model: q.car.model || 'N/A',
                  year: q.car.year,
                  vin: q.car.vin,
                  ownerId: owner?.id ?? null,
                  ownerName: owner ? `${owner.firstName} ${owner.lastName}` : 'Sin dueño',
                  ownerDni: owner?.dni ?? null,
                  ownerPhone: owner?.phone ?? null,
              }
            : null,
        client: q.client
            ? {
                  id: q.client.id,
                  fullName: `${q.client.firstName} ${q.client.lastName}`,
                  dni: q.client.dni,
                  phone: q.client.phone,
              }
            : null,
    };
}
