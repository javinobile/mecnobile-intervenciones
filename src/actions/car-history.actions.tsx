'use server';

import { revalidatePath } from 'next/cache';
import { renderToBuffer } from '@react-pdf/renderer';
import { CarHistoryRequestStatus } from '../../generated/prisma';
import prisma from '../../lib/prisma';
import { requireAdmin } from '@/lib/auth-guards';
import { getLogoBase64 } from '@/lib/pdf-logo';
import { isMailConfigured, sendMailWithPdfAttachment } from '@/lib/mail/smtp';
import { CarHistorialPdf, type CarHistoryPdfData } from '@/components/cars/CarHistorialPdf';
import { sendTextMessage } from '@/lib/whatsapp/meta-client';

async function buildHistoryPdfData(carId: string): Promise<CarHistoryPdfData | null> {
    const car = await prisma.car.findUnique({
        where: { id: carId },
        include: {
            ownershipHistory: {
                where: { endDate: null },
                take: 1,
                select: {
                    client: {
                        select: { firstName: true, lastName: true, dni: true },
                    },
                },
            },
            interventions: {
                where: { status: { in: ['CERRADA', 'ABIERTA'] } },
                orderBy: { dateOfIntervention: 'desc' },
                select: {
                    otNumber: true,
                    status: true,
                    dateOfIntervention: true,
                    mileageKm: true,
                    description: true,
                    notes: true,
                    items: {
                        orderBy: { sortOrder: 'asc' },
                        select: { type: true, description: true },
                    },
                },
            },
        },
    });

    if (!car) return null;

    const owner = car.ownershipHistory[0]?.client;
    return {
        logoSrc: getLogoBase64(),
        emittedAt: new Date(),
        car: {
            licensePlate: car.licensePlate,
            make: car.make,
            model: car.model,
            year: car.year,
            vin: car.vin,
            color: car.color,
            engineNumber: car.engineNumber,
        },
        owner: owner
            ? {
                  name: `${owner.firstName} ${owner.lastName}`.trim(),
                  dni: owner.dni,
              }
            : null,
        interventions: car.interventions.map((ot) => ({
            otNumber: ot.otNumber,
            status: ot.status,
            date: ot.dateOfIntervention,
            mileageKm: ot.mileageKm,
            description: ot.description,
            notes: ot.notes,
            items: ot.items.map((i) => ({ type: i.type, description: i.description })),
        })),
    };
}

export async function generateCarHistoryPdfBase64(carId: string): Promise<{
    success: boolean;
    base64Data?: string;
    licensePlate?: string;
    message?: string;
}> {
    const session = await requireAdmin();
    if (!session) {
        return { success: false, message: 'Solo un administrador puede emitir el historial.' };
    }

    try {
        const pdfData = await buildHistoryPdfData(carId);
        if (!pdfData) {
            return { success: false, message: 'Vehículo no encontrado.' };
        }

        const pdfBuffer = await renderToBuffer(<CarHistorialPdf data={pdfData} />);
        return {
            success: true,
            base64Data: pdfBuffer.toString('base64'),
            licensePlate: pdfData.car.licensePlate,
        };
    } catch (error) {
        console.error('Error al generar historial PDF:', error);
        return { success: false, message: 'Error interno al generar el PDF.' };
    }
}

export type HistoryRequestListItem = {
    id: string;
    email: string;
    status: CarHistoryRequestStatus;
    createdAt: Date;
    reviewedAt: Date | null;
    sentAt: Date | null;
    rejectReason: string | null;
    whatsappWaId: string;
    car: {
        id: string;
        licensePlate: string;
        make: string | null;
        model: string | null;
    };
    client: { id: string; firstName: string; lastName: string; email: string | null } | null;
    reviewedByName: string | null;
};

export async function listCarHistoryRequests(): Promise<HistoryRequestListItem[]> {
    const session = await requireAdmin();
    if (!session) return [];

    const rows = await prisma.carHistoryRequest.findMany({
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 100,
        include: {
            car: {
                select: { id: true, licensePlate: true, make: true, model: true },
            },
            client: {
                select: { id: true, firstName: true, lastName: true, email: true },
            },
            reviewedBy: { select: { name: true } },
        },
    });

    return rows.map((r) => ({
        id: r.id,
        email: r.email,
        status: r.status,
        createdAt: r.createdAt,
        reviewedAt: r.reviewedAt,
        sentAt: r.sentAt,
        rejectReason: r.rejectReason,
        whatsappWaId: r.whatsappWaId,
        car: r.car,
        client: r.client,
        reviewedByName: r.reviewedBy?.name ?? null,
    }));
}

export async function countPendingHistoryRequests(): Promise<number> {
    const session = await requireAdmin();
    if (!session) return 0;
    return prisma.carHistoryRequest.count({ where: { status: 'PENDIENTE' } });
}

export async function approveCarHistoryRequest(requestId: string): Promise<{
    success: boolean;
    message: string;
}> {
    const session = await requireAdmin();
    if (!session) {
        return { success: false, message: 'Solo un administrador puede autorizar.' };
    }

    const request = await prisma.carHistoryRequest.findUnique({
        where: { id: requestId },
        include: {
            car: { select: { licensePlate: true } },
            client: { select: { id: true, email: true } },
        },
    });

    if (!request) {
        return { success: false, message: 'Solicitud no encontrada.' };
    }
    if (request.status !== 'PENDIENTE') {
        return { success: false, message: `La solicitud ya está en estado ${request.status}.` };
    }
    if (!isMailConfigured()) {
        return {
            success: false,
            message:
                'Configurá SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM) para enviar el PDF por correo.',
        };
    }

    const pdfData = await buildHistoryPdfData(request.carId);
    if (!pdfData) {
        return { success: false, message: 'No se pudo armar el PDF del vehículo.' };
    }

    const rendered = await renderToBuffer(<CarHistorialPdf data={pdfData} />);
    const pdfBuffer = Buffer.isBuffer(rendered) ? rendered : Buffer.from(rendered);
    const plate = request.car.licensePlate.replace(/[^A-Z0-9]/gi, '');
    const filename = `Historial_${plate}_Nobile.pdf`;

    const mail = await sendMailWithPdfAttachment({
        to: request.email,
        subject: `Historial del vehículo ${request.car.licensePlate} — Nóbile`,
        text:
            `Hola,\n\n` +
            `Adjuntamos el historial de taller del vehículo ${request.car.licensePlate}, ` +
            `emitido por Nóbile (Tecnología y servicios del automotor).\n\n` +
            `Si no solicitaste este documento, ignorá este correo.\n\n` +
            `— Nóbile`,
        pdfBuffer,
        pdfFilename: filename,
    });

    if (!mail.ok) {
        return { success: false, message: mail.message };
    }

    // Registrar / actualizar email del cliente
    if (request.clientId) {
        const emailTaken = await prisma.client.findFirst({
            where: {
                email: request.email,
                NOT: { id: request.clientId },
            },
            select: { id: true },
        });
        if (!emailTaken) {
            await prisma.client.update({
                where: { id: request.clientId },
                data: { email: request.email },
            });
        }
    }

    await prisma.carHistoryRequest.update({
        where: { id: requestId },
        data: {
            status: 'ENVIADA',
            reviewedById: session.user.id,
            reviewedAt: new Date(),
            sentAt: new Date(),
        },
    });

    try {
        await sendTextMessage(
            request.whatsappWaId,
            `Tu historial del dominio *${request.car.licensePlate}* fue autorizado y enviado a *${request.email}*.\n` +
                `Revisá tu casilla (y spam).\n\n` +
                `_Escribí *ayuda* si necesitás otra cosa._`
        );
    } catch (err) {
        console.error('[history] WhatsApp notify failed', err);
    }

    revalidatePath('/dashboard/historial-solicitudes');
    if (request.clientId) {
        revalidatePath(`/dashboard/clients/${request.clientId}`);
    }
    revalidatePath(`/dashboard/cars/${request.carId}`);

    return {
        success: true,
        message: `Historial enviado a ${request.email}.`,
    };
}

export async function rejectCarHistoryRequest(
    requestId: string,
    reason?: string
): Promise<{ success: boolean; message: string }> {
    const session = await requireAdmin();
    if (!session) {
        return { success: false, message: 'Solo un administrador puede rechazar.' };
    }

    const request = await prisma.carHistoryRequest.findUnique({
        where: { id: requestId },
        include: { car: { select: { licensePlate: true } } },
    });

    if (!request) {
        return { success: false, message: 'Solicitud no encontrada.' };
    }
    if (request.status !== 'PENDIENTE') {
        return { success: false, message: `La solicitud ya está en estado ${request.status}.` };
    }

    const rejectReason = reason?.trim() || null;

    await prisma.carHistoryRequest.update({
        where: { id: requestId },
        data: {
            status: 'RECHAZADA',
            reviewedById: session.user.id,
            reviewedAt: new Date(),
            rejectReason,
        },
    });

    try {
        await sendTextMessage(
            request.whatsappWaId,
            `Tu solicitud de historial del dominio *${request.car.licensePlate}* no pudo ser autorizada` +
                (rejectReason ? ` (${rejectReason})` : '') +
                `.\n\nSi necesitás ayuda, escribinos o pedí *turno*.\n\n_Escribí *ayuda*._`
        );
    } catch (err) {
        console.error('[history] WhatsApp reject notify failed', err);
    }

    revalidatePath('/dashboard/historial-solicitudes');
    return { success: true, message: 'Solicitud rechazada.' };
}
