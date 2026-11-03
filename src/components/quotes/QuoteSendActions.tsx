'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Send } from 'lucide-react';
import { issueQuote, resendQuoteEmail, type QuoteDetail } from '@/actions/quote.actions';
import type { QuoteStatus } from '../../../generated/prisma';

type Feedback = {
    type: 'success' | 'error';
    text: string;
    /** Ofrecer la descarga del PDF (emitido sin email). */
    offerPdf?: boolean;
    /** Estados en los que el mensaje sigue vigente; si el presupuesto pasa a otro (p. ej. Aceptado), se oculta. */
    visibleIn: QuoteStatus[];
};
import QuotePdfButton from './QuotePdfButton';

/**
 * "Emitir presupuesto" (en BORRADOR) y "Reenviar email" (en ENVIADO/ACEPTADO con email).
 * Si se emite sin email, ofrece descargar el PDF para entregarlo a mano.
 */
export default function QuoteSendActions({ quote }: { quote: QuoteDetail }) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const message = feedback && feedback.visibleIn.includes(quote.status) ? feedback : null;

    const email = quote.customerEmail?.trim() || null;
    const canIssue = quote.status === 'BORRADOR';
    const canResend = (quote.status === 'ENVIADO' || quote.status === 'ACEPTADO') && !!email;

    const handleIssue = async () => {
        const prompt = email
            ? `¿Emitir el presupuesto Nº ${quote.quoteNumber} y enviarlo por email a ${email}?`
            : `El presupuesto no tiene email: se marcará como Enviado y podrás descargar el PDF para entregarlo. ¿Emitir?`;
        if (!confirm(prompt)) return;
        setLoading(true);
        setFeedback(null);
        try {
            const result = await issueQuote(quote.id);
            setFeedback({
                type: result.success ? 'success' : 'error',
                text: result.message,
                offerPdf: result.success && result.emailed === false,
                // Éxito: vale mientras está en Borrador (antes del refresh) o Enviado.
                visibleIn: result.success ? ['BORRADOR', 'ENVIADO'] : [quote.status],
            });
            if (result.success) router.refresh();
        } catch {
            setFeedback({ type: 'error', text: 'Error de red al emitir el presupuesto.', visibleIn: [quote.status] });
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (!confirm(`¿Reenviar el presupuesto Nº ${quote.quoteNumber} a ${email}?`)) return;
        setLoading(true);
        setFeedback(null);
        try {
            const result = await resendQuoteEmail(quote.id);
            setFeedback({ type: result.success ? 'success' : 'error', text: result.message, visibleIn: [quote.status] });
            if (result.success) router.refresh();
        } catch {
            setFeedback({ type: 'error', text: 'Error de red al reenviar el email.', visibleIn: [quote.status] });
        } finally {
            setLoading(false);
        }
    };

    if (!canIssue && !canResend && !message) return null;

    return (
        <div className="space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
                {canIssue && (
                    <button
                        type="button"
                        onClick={handleIssue}
                        disabled={loading}
                        className="flex items-center justify-center gap-1.5 min-h-11 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {loading ? 'Emitiendo…' : email ? 'Emitir y enviar por email' : 'Emitir presupuesto'}
                    </button>
                )}
                {canResend && (
                    <button
                        type="button"
                        onClick={handleResend}
                        disabled={loading}
                        className="flex items-center justify-center gap-1.5 min-h-11 px-4 border border-blue-300 text-blue-700 font-medium rounded-lg hover:bg-blue-50 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                        {loading ? 'Enviando…' : 'Reenviar email'}
                    </button>
                )}
            </div>
            {message && (
                <div
                    className={`p-3 text-sm rounded-md border ${
                        message.type === 'success'
                            ? 'bg-green-50 text-green-800 border-green-200'
                            : 'bg-red-50 text-red-800 border-red-200'
                    }`}
                >
                    {message.text}
                </div>
            )}
            {message?.offerPdf && <QuotePdfButton quoteId={quote.id} label="Descargar PDF para entregar" />}
        </div>
    );
}
