'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, X, Loader2, Mail } from 'lucide-react';
import {
    approveCarHistoryRequest,
    rejectCarHistoryRequest,
    type HistoryRequestListItem,
} from '@/actions/car-history.actions';

function statusBadge(status: HistoryRequestListItem['status']) {
    const map: Record<string, string> = {
        PENDIENTE: 'bg-amber-100 text-amber-900',
        ENVIADA: 'bg-green-100 text-green-800',
        APROBADA: 'bg-green-100 text-green-800',
        RECHAZADA: 'bg-red-100 text-red-800',
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || 'bg-gray-100'}`}>
            {status}
        </span>
    );
}

export default function HistoryRequestsTable({
    initialRequests,
}: {
    initialRequests: HistoryRequestListItem[];
}) {
    const [requests, setRequests] = useState(initialRequests);
    const [pending, startTransition] = useTransition();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const refreshFromServer = async () => {
        const res = await fetch('/dashboard/historial-solicitudes', { cache: 'no-store' });
        // page is server-rendered; simplest is location.reload after action
        void res;
        window.location.reload();
    };

    const onApprove = (id: string) => {
        setBusyId(id);
        setMessage(null);
        startTransition(async () => {
            const result = await approveCarHistoryRequest(id);
            setMessage(result.message);
            setBusyId(null);
            if (result.success) {
                setRequests((prev) =>
                    prev.map((r) => (r.id === id ? { ...r, status: 'ENVIADA' as const } : r))
                );
                await refreshFromServer();
            }
        });
    };

    const onReject = (id: string) => {
        const reason = window.prompt('Motivo del rechazo (opcional):') ?? undefined;
        setBusyId(id);
        setMessage(null);
        startTransition(async () => {
            const result = await rejectCarHistoryRequest(id, reason || undefined);
            setMessage(result.message);
            setBusyId(null);
            if (result.success) {
                await refreshFromServer();
            }
        });
    };

    if (requests.length === 0) {
        return (
            <p className="text-gray-500 text-sm">
                No hay solicitudes de historial por WhatsApp todavía.
            </p>
        );
    }

    return (
        <div className="space-y-4">
            {message ? (
                <p className="text-sm rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                    {message}
                </p>
            ) : null}

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600">
                        <tr>
                            <th className="px-4 py-3 font-semibold">Fecha</th>
                            <th className="px-4 py-3 font-semibold">Vehículo</th>
                            <th className="px-4 py-3 font-semibold">Email</th>
                            <th className="px-4 py-3 font-semibold">Estado</th>
                            <th className="px-4 py-3 font-semibold">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {requests.map((r) => {
                            const isBusy = pending && busyId === r.id;
                            return (
                                <tr key={r.id} className="border-t border-gray-100">
                                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                        {new Date(r.createdAt).toLocaleString('es-AR')}
                                    </td>
                                    <td className="px-4 py-3">
                                        <Link
                                            href={`/dashboard/cars/${r.car.id}`}
                                            className="font-semibold text-blue-700 hover:underline"
                                        >
                                            {r.car.licensePlate}
                                        </Link>
                                        <div className="text-xs text-gray-500">
                                            {[r.car.make, r.car.model].filter(Boolean).join(' ')}
                                        </div>
                                        {r.client ? (
                                            <div className="text-xs text-gray-500">
                                                {r.client.firstName} {r.client.lastName}
                                            </div>
                                        ) : null}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center gap-1 text-gray-800">
                                            <Mail className="w-3.5 h-3.5 text-gray-400" />
                                            {r.email}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                                    <td className="px-4 py-3">
                                        {r.status === 'PENDIENTE' ? (
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    disabled={isBusy}
                                                    onClick={() => onApprove(r.id)}
                                                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                                >
                                                    {isBusy ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Check className="w-3.5 h-3.5" />
                                                    )}
                                                    Autorizar y enviar
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={isBusy}
                                                    onClick={() => onReject(r.id)}
                                                    className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                    Rechazar
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-400">—</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
