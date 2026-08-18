'use server';

import prisma from '../../lib/prisma';
import { requireStaff } from '@/lib/auth-guards';

export type InboxAppointmentItem = {
    id: string;
    clientName: string;
    licensePlate: string | null;
    startsAt: Date;
};

export type InboxHistoryItem = {
    id: string;
    plate: string;
    email: string;
    createdAt: Date;
};

export type StaffInbox = {
    pendingAppointments: number;
    pendingHistory: number;
    appointments: InboxAppointmentItem[];
    historyRequests: InboxHistoryItem[];
};

/** Tareas pendientes: turnos por confirmar (staff) y historial por autorizar (solo admin). */
export async function getStaffInbox(): Promise<StaffInbox> {
    const empty: StaffInbox = {
        pendingAppointments: 0,
        pendingHistory: 0,
        appointments: [],
        historyRequests: [],
    };

    const session = await requireStaff();
    if (!session) return empty;

    const isAdmin = session.user.role === 'ADMIN';

    const [pendingAppointments, appointments, pendingHistory, historyRequests] = await Promise.all([
        prisma.appointment.count({ where: { status: 'PENDIENTE' } }),
        prisma.appointment.findMany({
            where: { status: 'PENDIENTE' },
            orderBy: { startsAt: 'asc' },
            take: 8,
            select: {
                id: true,
                clientName: true,
                licensePlate: true,
                startsAt: true,
            },
        }),
        isAdmin
            ? prisma.carHistoryRequest.count({ where: { status: 'PENDIENTE' } })
            : Promise.resolve(0),
        isAdmin
            ? prisma.carHistoryRequest.findMany({
                  where: { status: 'PENDIENTE' },
                  orderBy: { createdAt: 'asc' },
                  take: 8,
                  select: {
                      id: true,
                      email: true,
                      createdAt: true,
                      car: { select: { licensePlate: true } },
                  },
              })
            : Promise.resolve([]),
    ]);

    return {
        pendingAppointments,
        pendingHistory,
        appointments,
        historyRequests: historyRequests.map((r) => ({
            id: r.id,
            plate: r.car.licensePlate,
            email: r.email,
            createdAt: r.createdAt,
        })),
    };
}
