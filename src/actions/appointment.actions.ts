'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '../../generated/prisma';
import prisma from '../../lib/prisma';
import { requireStaff } from '@/lib/auth-guards';
import { isWhatsAppConfigured } from '@/lib/whatsapp/config';
import {
    notifyAppointmentAlternatives,
    notifyAppointmentConfirmed,
} from '@/lib/whatsapp/meta-client';
import { formatDateTimeEsAr, normalizeWaId } from '@/lib/whatsapp/phone';
import { checkSlotWithinSchedule, getWorkshopSchedule } from '@/lib/workshop-schedule';

export type AppointmentListItem = {
    id: string;
    startsAt: Date;
    endsAt: Date | null;
    clientName: string;
    clientPhone: string | null;
    notes: string | null;
    licensePlate: string | null;
    carId: string | null;
    carLinked: boolean;
    status: 'PENDIENTE' | 'PROPUESTA_ENVIADA' | 'CONFIRMADO';
    source: 'MANUAL' | 'WHATSAPP';
    whatsappWaId: string | null;
    proposedSlots: string[] | null;
    createdByName: string | null;
    createdAt: Date;
    /** OT ya abierta desde este turno (si existe) */
    interventionId: string | null;
    interventionOtNumber: number | null;
};

function asProposedSlots(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const slots = value.filter((v): v is string => typeof v === 'string');
    return slots.length ? slots : null;
}

function resolveNotifyWaId(clientPhone: string | null, whatsappWaId: string | null): string | null {
    return whatsappWaId || normalizeWaId(clientPhone);
}

async function purgeStalePendingAppointments() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    await prisma.appointment.deleteMany({
        where: {
            status: { in: ['PENDIENTE', 'PROPUESTA_ENVIADA'] },
            createdAt: { lt: cutoff },
        },
    });

    // Conversaciones a medias abandonadas (>30 min): solo drafts, sin turnos
    const idleCutoff = new Date(Date.now() - 30 * 60 * 1000);
    await prisma.whatsAppConversation.updateMany({
        where: {
            step: { not: 'IDLE' },
            updatedAt: { lt: idleCutoff },
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
}

export type AppointmentOtContext = {
    id: string;
    startsAt: Date;
    clientName: string;
    clientPhone: string | null;
    licensePlate: string | null;
    notes: string | null;
};

/**
 * Datos del turno para precargar el alta de OT.
 * Devuelve null si el turno no existe, no está confirmado o ya tiene OT.
 */
export async function getAppointmentForOt(id: string): Promise<AppointmentOtContext | null> {
    const session = await requireStaff();
    if (!session) return null;

    const appointment = await prisma.appointment.findUnique({
        where: { id },
        select: {
            id: true,
            startsAt: true,
            clientName: true,
            clientPhone: true,
            licensePlate: true,
            notes: true,
            status: true,
            interventionId: true,
        },
    });

    if (!appointment) return null;
    if (appointment.status !== 'CONFIRMADO') return null;
    if (appointment.interventionId) return null;

    return {
        id: appointment.id,
        startsAt: appointment.startsAt,
        clientName: appointment.clientName,
        clientPhone: appointment.clientPhone,
        licensePlate: appointment.licensePlate,
        notes: appointment.notes,
    };
}

export async function listAppointmentsInRange(
    fromIso: string,
    toIso: string
): Promise<AppointmentListItem[]> {
    const session = await requireStaff();
    if (!session) return [];

    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];

    await purgeStalePendingAppointments();

    const rows = await prisma.appointment.findMany({
        where: {
            startsAt: { gte: from, lte: to },
        },
        orderBy: { startsAt: 'asc' },
        select: {
            id: true,
            startsAt: true,
            endsAt: true,
            clientName: true,
            clientPhone: true,
            notes: true,
            licensePlate: true,
            carId: true,
            status: true,
            source: true,
            whatsappWaId: true,
            proposedSlots: true,
            createdAt: true,
            createdBy: { select: { name: true } },
            interventionId: true,
            intervention: { select: { otNumber: true } },
        },
    });

    return rows.map((r) => ({
        id: r.id,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        clientName: r.clientName,
        clientPhone: r.clientPhone,
        notes: r.notes,
        licensePlate: r.licensePlate,
        carId: r.carId,
        carLinked: Boolean(r.carId),
        status: r.status,
        source: r.source,
        whatsappWaId: r.whatsappWaId,
        proposedSlots: asProposedSlots(r.proposedSlots),
        createdByName: r.createdBy.name,
        createdAt: r.createdAt,
        interventionId: r.interventionId,
        interventionOtNumber: r.intervention?.otNumber ?? null,
    }));
}

export async function createAppointment(data: {
    startsAt: string;
    endsAt?: string;
    clientName: string;
    clientPhone?: string;
    notes?: string;
}): Promise<{ success: boolean; message: string; id?: string }> {
    const session = await requireStaff();
    if (!session) {
        return { success: false, message: 'Acceso denegado.' };
    }

    const clientName = data.clientName?.trim();
    if (!clientName) {
        return { success: false, message: 'El nombre del cliente es obligatorio.' };
    }

    const startsAt = new Date(data.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
        return { success: false, message: 'Fecha/hora inválida.' };
    }

    const schedule = await getWorkshopSchedule();
    const slotCheck = checkSlotWithinSchedule(startsAt, schedule);
    if (!slotCheck.ok) {
        return { success: false, message: slotCheck.message };
    }

    let endsAt: Date | null = null;
    if (data.endsAt) {
        endsAt = new Date(data.endsAt);
        if (Number.isNaN(endsAt.getTime())) {
            return { success: false, message: 'Hora de fin inválida.' };
        }
    }

    const phoneRaw = data.clientPhone?.trim() || null;
    const waId = normalizeWaId(phoneRaw);

    try {
        const created = await prisma.appointment.create({
            data: {
                startsAt,
                endsAt,
                clientName,
                clientPhone: phoneRaw,
                notes: data.notes?.trim() || null,
                status: 'PENDIENTE',
                source: 'MANUAL',
                whatsappWaId: waId,
                createdById: session.user.id,
            },
            select: { id: true },
        });

        revalidatePath('/dashboard/turnos');
        return { success: true, message: 'Cita creada (pendiente de confirmación).', id: created.id };
    } catch (error) {
        console.error('Error creating appointment:', error);
        return { success: false, message: 'Error al crear la cita.' };
    }
}

export async function confirmAppointment(
    id: string
): Promise<{ success: boolean; message: string }> {
    const session = await requireStaff();
    if (!session) {
        return { success: false, message: 'Acceso denegado.' };
    }

    try {
        const existing = await prisma.appointment.findUnique({ where: { id } });
        if (!existing) {
            return { success: false, message: 'Cita no encontrada.' };
        }
        if (existing.status === 'CONFIRMADO') {
            return { success: false, message: 'La cita ya está confirmada.' };
        }

        const updated = await prisma.appointment.update({
            where: { id },
            data: {
                status: 'CONFIRMADO',
                proposedSlots: Prisma.DbNull,
            },
        });

        revalidatePath('/dashboard/turnos');

        const toWaId = resolveNotifyWaId(updated.clientPhone, updated.whatsappWaId);
        let notifyNote = '';

        if (toWaId && isWhatsAppConfigured()) {
            const notified = await notifyAppointmentConfirmed({
                toWaId,
                clientName: updated.clientName,
                startsAt: updated.startsAt,
            });
            notifyNote = notified.ok
                ? ' Se envió WhatsApp al cliente.'
                : ` No se pudo enviar WhatsApp: ${notified.error}`;
        } else if (toWaId && !isWhatsAppConfigured()) {
            notifyNote = ' (WhatsApp no configurado: no se envió notificación.)';
        } else {
            notifyNote = ' (Sin teléfono WhatsApp: no se envió notificación.)';
        }

        return {
            success: true,
            message: `Cita confirmada: el taller puede recibir el auto en ese horario.${notifyNote}`,
        };
    } catch (error) {
        console.error('Error confirming appointment:', error);
        return { success: false, message: 'No se pudo confirmar la cita.' };
    }
}

export async function proposeAppointmentAlternatives(
    id: string,
    slotIsos: string[]
): Promise<{ success: boolean; message: string }> {
    const session = await requireStaff();
    if (!session) {
        return { success: false, message: 'Acceso denegado.' };
    }

    const slots = slotIsos
        .map((s) => new Date(s))
        .filter((d) => !Number.isNaN(d.getTime()));

    if (slots.length < 2 || slots.length > 3) {
        return { success: false, message: 'Indicá entre 2 y 3 horarios alternativos.' };
    }

    const now = new Date();
    const schedule = await getWorkshopSchedule();
    for (const slot of slots) {
        const { full } = formatDateTimeEsAr(slot);
        if (slot.getTime() <= now.getTime()) {
            return { success: false, message: `El horario ${full} ya pasó.` };
        }
        const slotCheck = checkSlotWithinSchedule(slot, schedule);
        if (!slotCheck.ok) {
            return { success: false, message: `${full}: ${slotCheck.message}` };
        }
    }

    try {
        const existing = await prisma.appointment.findUnique({ where: { id } });
        if (!existing) {
            return { success: false, message: 'Cita no encontrada.' };
        }
        if (existing.status === 'CONFIRMADO') {
            return { success: false, message: 'La cita ya está confirmada.' };
        }

        const proposedSlots = slots.map((d) => d.toISOString());

        const updated = await prisma.appointment.update({
            where: { id },
            data: {
                status: 'PROPUESTA_ENVIADA',
                proposedSlots,
            },
        });

        revalidatePath('/dashboard/turnos');

        const toWaId = resolveNotifyWaId(updated.clientPhone, updated.whatsappWaId);
        if (!toWaId) {
            return {
                success: true,
                message:
                    'Alternativas guardadas, pero la cita no tiene teléfono WhatsApp: el cliente no fue notificado.',
            };
        }

        if (!isWhatsAppConfigured()) {
            return {
                success: true,
                message:
                    'Alternativas guardadas. WhatsApp no está configurado: no se envió el mensaje al cliente.',
            };
        }

        const notified = await notifyAppointmentAlternatives({
            toWaId,
            clientName: updated.clientName,
            slots,
        });

        if (!notified.ok) {
            return {
                success: true,
                message: `Alternativas guardadas, pero falló el WhatsApp: ${notified.error}`,
            };
        }

        // Repetimos los horarios enviados para que el mecánico verifique que salieron tal cual los cargó
        const sent = slots.map((slot) => formatDateTimeEsAr(slot).full).join(' · ');
        return {
            success: true,
            message: `Se enviaron estas opciones por WhatsApp: ${sent}. Esperando respuesta del cliente.`,
        };
    } catch (error) {
        console.error('Error proposing alternatives:', error);
        return { success: false, message: 'No se pudieron enviar las alternativas.' };
    }
}

export async function deleteAppointment(
    id: string
): Promise<{ success: boolean; message: string }> {
    const session = await requireStaff();
    if (!session) {
        return { success: false, message: 'Acceso denegado.' };
    }

    try {
        await prisma.appointment.delete({ where: { id } });
        revalidatePath('/dashboard/turnos');
        return { success: true, message: 'Cita eliminada.' };
    } catch (error) {
        console.error('Error deleting appointment:', error);
        return { success: false, message: 'No se pudo eliminar la cita.' };
    }
}
