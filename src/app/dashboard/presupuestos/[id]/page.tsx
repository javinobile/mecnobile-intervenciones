import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Calculator, Lock, Wrench } from 'lucide-react';
import { authOptions } from '@/auth';
import { getQuoteDetail } from '@/actions/quote.actions';
import QuoteStatusBadge from '@/components/quotes/QuoteStatusBadge';
import QuoteDataPanel from '@/components/quotes/QuoteDataPanel';
import QuoteItemsEditor from '@/components/quotes/QuoteItemsEditor';
import QuoteDeleteButton from '@/components/quotes/QuoteDeleteButton';
import QuotePdfButton from '@/components/quotes/QuotePdfButton';
import QuoteSendActions from '@/components/quotes/QuoteSendActions';
import QuoteDecisionActions from '@/components/quotes/QuoteDecisionActions';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-AR');

export default async function PresupuestoDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role;
    if (!session || (role !== 'ADMIN' && role !== 'MECHANIC')) {
        redirect('/dashboard');
    }

    const { id } = await params;
    const quote = await getQuoteDetail(id);
    if (!quote) notFound();

    return (
        <div className="space-y-4 max-w-4xl">
            <Link
                href="/dashboard/presupuestos"
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
            >
                <ArrowLeft className="w-4 h-4" /> Volver a presupuestos
            </Link>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Calculator className="w-6 h-6 text-blue-600" />
                    Presupuesto Nº {quote.quoteNumber}
                    <QuoteStatusBadge status={quote.displayStatus} />
                </h1>
                {quote.editable && (
                    <QuoteDeleteButton quoteId={quote.id} quoteNumber={quote.quoteNumber} variant="button" />
                )}
            </div>

            <p className="text-sm text-gray-500">
                Creado el {formatDate(quote.createdAt)}
                {quote.createdBy.name ? ` por ${quote.createdBy.name}` : ''} · Válido hasta{' '}
                <span className={quote.displayStatus === 'VENCIDO' ? 'font-semibold text-yellow-700' : ''}>
                    {formatDate(quote.validUntil)}
                </span>
                {quote.sentAt && ` · Enviado el ${formatDate(quote.sentAt)}`}
                {quote.acceptedAt && ` · Aceptado el ${formatDate(quote.acceptedAt)}`}
                {quote.rejectedAt && ` · Rechazado el ${formatDate(quote.rejectedAt)}`}
            </p>

            {!quote.editable && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-green-200 bg-green-50 text-sm text-green-900">
                    <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Presupuesto aceptado: es un documento cerrado y no se puede modificar ni borrar.</span>
                </div>
            )}

            {quote.intervention && (
                <Link
                    href={`/dashboard/interventions/${quote.intervention.id}`}
                    className="flex items-center gap-2 p-3 rounded-lg border border-blue-200 bg-blue-50 text-sm font-medium text-blue-800 hover:bg-blue-100"
                >
                    <Wrench className="w-4 h-4" /> Convertido en la OT Nº {quote.intervention.otNumber}
                </Link>
            )}

            {/* Acciones del documento (disponibles en cualquier estado) */}
            <div className="flex flex-col sm:flex-row flex-wrap items-start gap-2">
                <QuoteSendActions quote={quote} />
                <QuotePdfButton quoteId={quote.id} />
                <QuoteDecisionActions quoteId={quote.id} status={quote.status} />
                {quote.status === 'ACEPTADO' && !quote.intervention && (
                    <Link
                        href={`/dashboard/interventions/new?presupuesto=${quote.id}`}
                        className="flex items-center justify-center gap-1.5 min-h-11 px-4 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 w-full sm:w-auto"
                    >
                        <Wrench className="w-4 h-4" /> Convertir en OT
                    </Link>
                )}
            </div>

            <QuoteDataPanel quote={quote} />

            <div className="bg-white p-4 sm:p-6 rounded-xl border border-gray-200 shadow-sm">
                <QuoteItemsEditor
                    quoteId={quote.id}
                    items={quote.items}
                    total={quote.total}
                    totalsByType={quote.totalsByType}
                    canEdit={quote.editable}
                />
            </div>
        </div>
    );
}
