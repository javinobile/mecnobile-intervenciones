import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import prisma from '../../lib/prisma';

export type StaffSession = {
    user: { id: string; role: string; name?: string | null; email?: string | null };
};

export async function requireSession() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return null;
    return session as StaffSession & typeof session;
}

export async function requireStaff() {
    const session = await requireSession();
    if (!session) return null;
    if (session.user.role !== 'ADMIN' && session.user.role !== 'MECHANIC') return null;
    return session;
}

export async function requireAdmin() {
    const session = await requireSession();
    if (!session || session.user.role !== 'ADMIN') return null;
    return session;
}

/** MECHANIC may edit car/client only if linked to an open OT; ADMIN always. */
export async function canEditMasterRecord(
    role: string,
    opts: { carId?: string; clientId?: string }
): Promise<boolean> {
    if (role === 'ADMIN') return true;
    if (role !== 'MECHANIC') return false;

    const openOt = await prisma.intervention.findFirst({
        where: {
            status: 'ABIERTA',
            cancelRequestedAt: null,
            ...(opts.carId ? { carId: opts.carId } : {}),
            ...(opts.clientId ? { clientId: opts.clientId } : {}),
        },
        select: { id: true },
    });

    return !!openOt;
}
