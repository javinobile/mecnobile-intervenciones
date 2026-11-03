import type { QuoteDisplayStatus } from '@/actions/quote.actions';

export const QUOTE_STATUS_LABELS: Record<QuoteDisplayStatus, string> = {
    BORRADOR: 'Borrador',
    ENVIADO: 'Enviado',
    ACEPTADO: 'Aceptado',
    RECHAZADO: 'Rechazado',
    VENCIDO: 'Vencido',
};

const STATUS_CLASSES: Record<QuoteDisplayStatus, string> = {
    BORRADOR: 'bg-gray-100 text-gray-800',
    ENVIADO: 'bg-blue-100 text-blue-800',
    ACEPTADO: 'bg-green-100 text-green-800',
    RECHAZADO: 'bg-red-100 text-red-800',
    VENCIDO: 'bg-yellow-100 text-yellow-800',
};

export default function QuoteStatusBadge({ status }: { status: QuoteDisplayStatus }) {
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[status]}`}
        >
            {QUOTE_STATUS_LABELS[status]}
        </span>
    );
}
