'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, CalendarDays, FileText } from 'lucide-react';
import { getStaffInbox, type StaffInbox } from '@/actions/inbox.actions';

const POLL_MS = 25_000;
const SEEN_TURNOS = 'inbox-seen-turnos';
const SEEN_HISTORIAL = 'inbox-seen-historial';

function readSeen(key: string): number {
    if (typeof window === 'undefined') return 0;
    const raw = window.localStorage.getItem(key);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
}

function writeSeen(key: string, value: number) {
    window.localStorage.setItem(key, String(value));
}

function badgeCount(current: number, seen: number) {
    return Math.max(0, current - seen);
}

function formatWhen(d: Date) {
    return new Date(d).toLocaleString('es-AR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function TaskBell({ isAdmin }: { isAdmin: boolean }) {
    const pathname = usePathname();
    const [inbox, setInbox] = useState<StaffInbox | null>(null);
    const [open, setOpen] = useState(false);
    const [seenTurnos, setSeenTurnos] = useState(0);
    const [seenHistorial, setSeenHistorial] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setSeenTurnos(readSeen(SEEN_TURNOS));
        setSeenHistorial(readSeen(SEEN_HISTORIAL));
    }, []);

    const refresh = useCallback(async () => {
        if (document.hidden) return;
        const data = await getStaffInbox();
        setInbox(data);
    }, []);

    useEffect(() => {
        void refresh();
        const id = window.setInterval(() => void refresh(), POLL_MS);
        const onVis = () => {
            if (!document.hidden) void refresh();
        };
        document.addEventListener('visibilitychange', onVis);
        return () => {
            window.clearInterval(id);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, [refresh]);

    useEffect(() => {
        if (!inbox) return;
        if (pathname === '/dashboard/turnos' || pathname.startsWith('/dashboard/turnos/')) {
            writeSeen(SEEN_TURNOS, inbox.pendingAppointments);
            setSeenTurnos(inbox.pendingAppointments);
        }
        if (
            isAdmin &&
            (pathname === '/dashboard/historial-solicitudes' ||
                pathname.startsWith('/dashboard/historial-solicitudes/'))
        ) {
            writeSeen(SEEN_HISTORIAL, inbox.pendingHistory);
            setSeenHistorial(inbox.pendingHistory);
        }
    }, [pathname, inbox, isAdmin]);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    const turnosBadge = badgeCount(inbox?.pendingAppointments ?? 0, seenTurnos);
    const historialBadge = isAdmin ? badgeCount(inbox?.pendingHistory ?? 0, seenHistorial) : 0;
    const totalBadge = turnosBadge + historialBadge;

    const acknowledge = () => {
        if (!inbox) return;
        writeSeen(SEEN_TURNOS, inbox.pendingAppointments);
        setSeenTurnos(inbox.pendingAppointments);
        if (isAdmin) {
            writeSeen(SEEN_HISTORIAL, inbox.pendingHistory);
            setSeenHistorial(inbox.pendingHistory);
        }
    };

    const toggle = () => {
        setOpen((prev) => {
            const next = !prev;
            if (next) acknowledge();
            return next;
        });
    };

    return (
        <div ref={wrapRef} className="relative">
            <button
                type="button"
                onClick={toggle}
                aria-label="Tareas pendientes"
                className="relative min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-700 shadow-sm hover:bg-gray-50"
            >
                <Bell className="w-5 h-5" />
                {totalBadge > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold leading-5 text-center">
                        {totalBadge > 9 ? '9+' : totalBadge}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white shadow-lg z-50 overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-100">
                        <p className="text-sm font-semibold text-gray-900">Pendientes</p>
                        <p className="text-xs text-gray-500">Turnos por confirmar{isAdmin ? ' e historial' : ''}.</p>
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                        <section className="p-3 space-y-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                                <CalendarDays className="w-3.5 h-3.5" />
                                Turnos por confirmar
                            </p>
                            {(inbox?.appointments.length ?? 0) === 0 ? (
                                <p className="text-sm text-gray-500">No hay turnos pendientes.</p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {inbox!.appointments.map((ap) => (
                                        <li key={ap.id} className="text-sm text-gray-800">
                                            <span className="font-medium">{ap.clientName}</span>
                                            {ap.licensePlate ? ` · ${ap.licensePlate}` : ''}
                                            <span className="block text-xs text-gray-500">
                                                {formatWhen(ap.startsAt)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <Link
                                href="/dashboard/turnos"
                                onClick={() => setOpen(false)}
                                className="inline-flex text-sm font-semibold text-blue-700 hover:underline"
                            >
                                Ir a turnos
                            </Link>
                        </section>

                        {isAdmin && (
                            <section className="p-3 space-y-2 border-t border-gray-100">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                                    <FileText className="w-3.5 h-3.5" />
                                    Historial por autorizar
                                </p>
                                {(inbox?.historyRequests.length ?? 0) === 0 ? (
                                    <p className="text-sm text-gray-500">No hay solicitudes pendientes.</p>
                                ) : (
                                    <ul className="space-y-1.5">
                                        {inbox!.historyRequests.map((h) => (
                                            <li key={h.id} className="text-sm text-gray-800">
                                                <span className="font-medium">{h.plate}</span>
                                                <span className="block text-xs text-gray-500">{h.email}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <Link
                                    href="/dashboard/historial-solicitudes"
                                    onClick={() => setOpen(false)}
                                    className="inline-flex text-sm font-semibold text-blue-700 hover:underline"
                                >
                                    Ir a solicitudes
                                </Link>
                            </section>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export function NavBadge({ count }: { count: number }) {
    if (count <= 0) return null;
    return (
        <span className="ml-auto min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-5 text-center">
            {count > 9 ? '9+' : count}
        </span>
    );
}
