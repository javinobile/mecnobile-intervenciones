'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
    ChevronLeft,
    ChevronRight,
    Check,
    Trash2,
    Plus,
    Loader2,
    CalendarDays,
    CalendarClock,
    RefreshCw,
    Wrench,
} from 'lucide-react';
import {
    AppointmentListItem,
    listAppointmentsInRange,
    createAppointment,
    confirmAppointment,
    deleteAppointment,
    proposeAppointmentAlternatives,
} from '@/actions/appointment.actions';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Refresco automático de estados (el cliente puede confirmar por WhatsApp en cualquier momento). */
const AUTO_REFRESH_MS = 25_000;

function startOfMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d: Date) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Monday=0 … Sunday=6 */
function mondayIndex(d: Date) {
    const day = d.getDay();
    return day === 0 ? 6 : day - 1;
}

function sameDay(a: Date, b: Date) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function toLocalInputValue(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function monthLabel(d: Date) {
    return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

/** Link al alta de OT con el turno precargado (patente, avería y vínculo al turno). */
function newOtHref(ap: AppointmentListItem) {
    const params = new URLSearchParams({ appointmentId: ap.id });
    if (ap.licensePlate) params.set('plate', ap.licensePlate);
    if (ap.notes) params.set('desc', ap.notes);
    return `/dashboard/interventions/new?${params.toString()}`;
}

function statusLabel(status: AppointmentListItem['status']) {
    switch (status) {
        case 'CONFIRMADO':
            return 'Confirmada — se puede recibir';
        case 'PROPUESTA_ENVIADA':
            return 'Propuesta enviada — esperando cliente';
        default:
            return 'Pendiente — aún no asegurada';
    }
}

function statusClass(status: AppointmentListItem['status']) {
    switch (status) {
        case 'CONFIRMADO':
            return 'border-emerald-200 bg-emerald-50/60';
        case 'PROPUESTA_ENVIADA':
            return 'border-sky-200 bg-sky-50/60';
        default:
            return 'border-amber-200 bg-amber-50/60';
    }
}

function statusTextClass(status: AppointmentListItem['status']) {
    switch (status) {
        case 'CONFIRMADO':
            return 'text-emerald-700';
        case 'PROPUESTA_ENVIADA':
            return 'text-sky-800';
        default:
            return 'text-amber-800';
    }
}

export default function TurnosCalendar() {
    const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
    const [selected, setSelected] = useState(() => new Date());
    const [appointments, setAppointments] = useState<AppointmentListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastSync, setLastSync] = useState<Date | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [pendingId, setPendingId] = useState<string | null>(null);

    const [showForm, setShowForm] = useState(false);
    const [clientName, setClientName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [startsAt, setStartsAt] = useState('');
    const [saving, setSaving] = useState(false);

    const [proposeForId, setProposeForId] = useState<string | null>(null);
    const [altSlots, setAltSlots] = useState<[string, string, string]>(['', '', '']);

    const range = useMemo(() => {
        const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 0, 0, 0, 0);
        const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
        return { from: from.toISOString(), to: to.toISOString() };
    }, [cursor]);

    const reload = useCallback(
        async ({ silent = false }: { silent?: boolean } = {}) => {
            if (silent) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }
            try {
                const rows = await listAppointmentsInRange(range.from, range.to);
                setAppointments(rows);
                setLastSync(new Date());
            } finally {
                if (silent) {
                    setRefreshing(false);
                } else {
                    setLoading(false);
                }
            }
        },
        [range.from, range.to]
    );

    useEffect(() => {
        reload();
    }, [reload]);

    // Mientras el mecánico edita o guarda no refrescamos, para no pisar la pantalla.
    const busy = saving || pendingId !== null || showForm || proposeForId !== null;
    const busyRef = useRef(busy);
    busyRef.current = busy;

    useEffect(() => {
        const refreshIfIdle = () => {
            if (document.visibilityState !== 'visible' || busyRef.current) return;
            reload({ silent: true });
        };

        const interval = setInterval(refreshIfIdle, AUTO_REFRESH_MS);
        document.addEventListener('visibilitychange', refreshIfIdle);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', refreshIfIdle);
        };
    }, [reload]);

    const cells = useMemo(() => {
        const total = daysInMonth(cursor);
        const offset = mondayIndex(startOfMonth(cursor));
        const items: (Date | null)[] = [];
        for (let i = 0; i < offset; i++) items.push(null);
        for (let day = 1; day <= total; day++) {
            items.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
        }
        while (items.length % 7 !== 0) items.push(null);
        return items;
    }, [cursor]);

    const byDay = useMemo(() => {
        const map = new Map<string, AppointmentListItem[]>();
        for (const ap of appointments) {
            const d = new Date(ap.startsAt);
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const list = map.get(key) || [];
            list.push(ap);
            map.set(key, list);
        }
        return map;
    }, [appointments]);

    const selectedKey = `${selected.getFullYear()}-${selected.getMonth()}-${selected.getDate()}`;
    const dayAppointments = byDay.get(selectedKey) || [];

    const openNewForSelected = () => {
        const base = new Date(selected);
        base.setHours(9, 0, 0, 0);
        setStartsAt(toLocalInputValue(base));
        setClientName('');
        setClientPhone('');
        setNotes('');
        setShowForm(true);
        setProposeForId(null);
        setMessage(null);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);
        const start = new Date(startsAt);

        const result = await createAppointment({
            startsAt: start.toISOString(),
            clientName,
            clientPhone,
            notes,
        });

        if (result.success) {
            setMessage({ type: 'success', text: result.message });
            setShowForm(false);
            await reload();
        } else {
            setMessage({ type: 'error', text: result.message });
        }
        setSaving(false);
    };

    const handleConfirm = async (id: string) => {
        setPendingId(id);
        const result = await confirmAppointment(id);
        setMessage({ type: result.success ? 'success' : 'error', text: result.message });
        setProposeForId(null);
        await reload();
        setPendingId(null);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar esta cita?')) return;
        setPendingId(id);
        const result = await deleteAppointment(id);
        setMessage({ type: result.success ? 'success' : 'error', text: result.message });
        setProposeForId(null);
        await reload();
        setPendingId(null);
    };

    const openPropose = (ap: AppointmentListItem) => {
        const base = new Date(ap.startsAt);
        const s1 = new Date(base);
        s1.setDate(s1.getDate() + 1);
        s1.setHours(9, 0, 0, 0);
        const s2 = new Date(base);
        s2.setDate(s2.getDate() + 1);
        s2.setHours(11, 0, 0, 0);
        setAltSlots([toLocalInputValue(s1), toLocalInputValue(s2), '']);
        setProposeForId(ap.id);
        setShowForm(false);
        setMessage(null);
    };

    const handlePropose = async (id: string) => {
        const filled = altSlots.filter(Boolean);
        if (filled.length < 2) {
            setMessage({ type: 'error', text: 'Indicá al menos 2 horarios alternativos.' });
            return;
        }
        setPendingId(id);
        const result = await proposeAppointmentAlternatives(
            id,
            filled.map((v) => new Date(v).toISOString())
        );
        setMessage({ type: result.success ? 'success' : 'error', text: result.message });
        if (result.success) setProposeForId(null);
        await reload();
        setPendingId(null);
    };

    const today = new Date();

    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                Los pedidos por WhatsApp preguntan avería, dominio y día/hora, y quedan{' '}
                <strong>pendientes</strong> hasta que los confirmes. Al confirmar se notifica al cliente con
                la plantilla de utilidad. Si no podés ese horario, proponé alternativas.
            </p>

            {message && (
                <div
                    className={`p-3 rounded-md text-sm ${
                        message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
                    }`}
                >
                    {message.text}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-4">
                        <button
                            type="button"
                            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"
                            aria-label="Mes anterior"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <h2 className="text-lg font-semibold text-gray-900 capitalize flex items-center gap-2">
                            <CalendarDays className="w-5 h-5 text-blue-600" />
                            {monthLabel(cursor)}
                        </h2>
                        <button
                            type="button"
                            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"
                            aria-label="Mes siguiente"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-1">
                        {WEEKDAYS.map((d) => (
                            <div key={d} className="text-center text-xs font-semibold text-gray-500 py-1">
                                {d}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {cells.map((day, idx) => {
                            if (!day) {
                                return <div key={`e-${idx}`} className="min-h-16 sm:min-h-20 rounded-lg bg-gray-50/50" />;
                            }
                            const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
                            const dayAps = byDay.get(key) || [];
                            const isSelected = sameDay(day, selected);
                            const isToday = sameDay(day, today);
                            const pending = dayAps.filter((a) => a.status === 'PENDIENTE').length;
                            const proposed = dayAps.filter((a) => a.status === 'PROPUESTA_ENVIADA').length;
                            const confirmed = dayAps.filter((a) => a.status === 'CONFIRMADO').length;

                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setSelected(day)}
                                    className={`min-h-16 sm:min-h-20 rounded-lg border p-1.5 text-left transition ${
                                        isSelected
                                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                                            : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50'
                                    }`}
                                >
                                    <span
                                        className={`inline-flex items-center justify-center w-7 h-7 text-sm font-semibold rounded-full ${
                                            isToday ? 'bg-blue-600 text-white' : 'text-gray-800'
                                        }`}
                                    >
                                        {day.getDate()}
                                    </span>
                                    <div className="mt-1 flex flex-wrap gap-0.5">
                                        {confirmed > 0 && (
                                            <span className="text-[10px] px-1 rounded bg-emerald-100 text-emerald-800">
                                                {confirmed} conf.
                                            </span>
                                        )}
                                        {pending > 0 && (
                                            <span className="text-[10px] px-1 rounded bg-amber-100 text-amber-800">
                                                {pending} pend.
                                            </span>
                                        )}
                                        {proposed > 0 && (
                                            <span className="text-[10px] px-1 rounded bg-sky-100 text-sky-800">
                                                {proposed} prop.
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-3 min-h-5 text-xs">
                        {loading ? (
                            <p className="text-blue-600 flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" /> Cargando citas…
                            </p>
                        ) : (
                            <p className="text-gray-500 flex items-center gap-1.5">
                                <RefreshCw
                                    className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`}
                                />
                                {lastSync
                                    ? `Actualizado ${lastSync.toLocaleTimeString('es-AR', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          second: '2-digit',
                                      })}`
                                    : 'Sin actualizar'}
                                <span className="text-gray-400">· se refresca solo</span>
                            </p>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <h3 className="font-semibold text-gray-900">
                                {selected.toLocaleDateString('es-AR', {
                                    weekday: 'long',
                                    day: 'numeric',
                                    month: 'long',
                                })}
                            </h3>
                            <p className="text-xs text-gray-500">{dayAppointments.length} cita(s)</p>
                        </div>
                        <button
                            type="button"
                            onClick={openNewForSelected}
                            className="inline-flex items-center min-h-11 px-3 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700"
                        >
                            <Plus className="w-4 h-4 mr-1" />
                            Nueva
                        </button>
                    </div>

                    {showForm && (
                        <form onSubmit={handleCreate} className="space-y-2 p-3 rounded-lg border border-green-200 bg-green-50/50">
                            <p className="text-sm font-medium text-green-900">Nueva cita</p>
                            <p className="text-xs text-green-800">
                                Indicá día y hora de llegada. Quedará pendiente hasta que la confirmes.
                            </p>
                            <input
                                required
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                placeholder="Nombre del cliente *"
                                className="w-full min-h-11 px-3 border border-gray-300 rounded-lg text-sm"
                            />
                            <input
                                value={clientPhone}
                                onChange={(e) => setClientPhone(e.target.value)}
                                placeholder="Teléfono (WhatsApp)"
                                className="w-full min-h-11 px-3 border border-gray-300 rounded-lg text-sm"
                            />
                            <div>
                                <label className="text-xs text-gray-600">Día y hora de llegada</label>
                                <input
                                    type="datetime-local"
                                    required
                                    value={startsAt}
                                    onChange={(e) => setStartsAt(e.target.value)}
                                    className="w-full min-h-11 px-3 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Notas (opcional)"
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowForm(false)}
                                    className="flex-1 min-h-11 rounded-lg border border-gray-300 text-sm font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 min-h-11 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
                                >
                                    {saving ? 'Guardando…' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    )}

                    <ul className="space-y-2 max-h-[28rem] overflow-y-auto">
                        {dayAppointments.map((ap) => {
                            const start = new Date(ap.startsAt);
                            const time = start.toLocaleTimeString('es-AR', {
                                hour: '2-digit',
                                minute: '2-digit',
                            });
                            const canAct = ap.status === 'PENDIENTE' || ap.status === 'PROPUESTA_ENVIADA';

                            return (
                                <li key={ap.id} className={`p-3 rounded-lg border ${statusClass(ap.status)}`}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                                <p className="font-semibold text-gray-900">{ap.clientName}</p>
                                                <span
                                                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                        ap.source === 'WHATSAPP'
                                                            ? 'bg-green-100 text-green-800'
                                                            : 'bg-gray-100 text-gray-600'
                                                    }`}
                                                >
                                                    {ap.source === 'WHATSAPP' ? 'WhatsApp' : 'Manual'}
                                                </span>
                                                {ap.licensePlate && (
                                                    <span
                                                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                            ap.carLinked
                                                                ? 'bg-blue-100 text-blue-800'
                                                                : 'bg-orange-100 text-orange-900'
                                                        }`}
                                                    >
                                                        {ap.licensePlate}
                                                        {ap.carLinked ? ' · en sistema' : ' · dominio nuevo'}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-600">
                                                Llegada {time}
                                                {' · '}
                                                <span className={statusTextClass(ap.status)}>
                                                    {statusLabel(ap.status)}
                                                </span>
                                            </p>
                                            {ap.clientPhone && (
                                                <p className="text-xs text-gray-500 mt-0.5">{ap.clientPhone}</p>
                                            )}
                                            {ap.notes && (
                                                <p className="text-xs text-gray-600 mt-1">
                                                    <span className="font-medium text-gray-700">Avería:</span>{' '}
                                                    {ap.notes}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            {ap.status === 'CONFIRMADO' && !ap.interventionId && (
                                                <Link
                                                    href={newOtHref(ap)}
                                                    title="Abrir OT con los datos de este turno"
                                                    className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                                                >
                                                    <Wrench className="w-4 h-4" />
                                                </Link>
                                            )}
                                            {ap.interventionId && (
                                                <Link
                                                    href={`/dashboard/interventions/${ap.interventionId}`}
                                                    title={`Ver OT #${ap.interventionOtNumber ?? ''}`}
                                                    className="min-h-10 inline-flex items-center justify-center gap-1 px-2 rounded-lg border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-50"
                                                >
                                                    <Wrench className="w-3.5 h-3.5" />
                                                    OT #{ap.interventionOtNumber ?? ''}
                                                </Link>
                                            )}
                                            {canAct && (
                                                <>
                                                    <button
                                                        type="button"
                                                        title="Confirmar: el taller puede recibir el auto"
                                                        disabled={pendingId === ap.id}
                                                        onClick={() => handleConfirm(ap.id)}
                                                        className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                    {ap.status === 'PENDIENTE' && (
                                                        <button
                                                            type="button"
                                                            title="Proponer otros horarios"
                                                            disabled={pendingId === ap.id}
                                                            onClick={() => openPropose(ap)}
                                                            className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                                                        >
                                                            <CalendarClock className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                            <button
                                                type="button"
                                                title="Eliminar"
                                                disabled={pendingId === ap.id}
                                                onClick={() => handleDelete(ap.id)}
                                                className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {proposeForId === ap.id && (
                                        <div className="mt-3 pt-3 border-t border-sky-200 space-y-2">
                                            <p className="text-xs text-sky-900 font-medium">
                                                Proponer 2 o 3 horarios alternativos. El cliente los recibe como
                                                botones: toca uno y el turno queda confirmado.
                                            </p>
                                            {[0, 1, 2].map((i) => (
                                                <input
                                                    key={i}
                                                    type="datetime-local"
                                                    value={altSlots[i]}
                                                    onChange={(e) => {
                                                        const next: [string, string, string] = [...altSlots];
                                                        next[i] = e.target.value;
                                                        setAltSlots(next);
                                                    }}
                                                    className="w-full min-h-11 px-3 border border-gray-300 rounded-lg text-sm"
                                                    placeholder={`Opción ${i + 1}`}
                                                />
                                            ))}
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setProposeForId(null)}
                                                    className="flex-1 min-h-10 rounded-lg border border-gray-300 text-sm font-medium"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={pendingId === ap.id}
                                                    onClick={() => handlePropose(ap.id)}
                                                    className="flex-1 min-h-10 rounded-lg bg-sky-600 text-white text-sm font-semibold disabled:opacity-50"
                                                >
                                                    Enviar por WhatsApp
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                        {!loading && dayAppointments.length === 0 && !showForm && (
                            <li className="text-sm text-gray-500 text-center py-6">
                                Sin citas este día. Podés crear una nueva.
                            </li>
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
}
