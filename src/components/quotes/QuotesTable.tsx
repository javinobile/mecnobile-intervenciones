import Link from 'next/link';
import type { QuoteListItem } from '@/actions/quote.actions';
import QuoteStatusBadge from './QuoteStatusBadge';
import QuoteDeleteButton from './QuoteDeleteButton';

const formatMoney = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-AR');

const th = 'px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';
const td = 'px-3 py-2.5 whitespace-nowrap text-sm';

export default function QuotesTable({ quotes }: { quotes: QuoteListItem[] }) {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className={th}>Nº</th>
                        <th className={th}>Fecha</th>
                        <th className={th}>Cliente</th>
                        <th className={th}>Dominio</th>
                        <th className={`${th} text-right`}>Total</th>
                        <th className={th}>Estado</th>
                        <th className={`${th} text-right`}>Acciones</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {quotes.map((q) => (
                        <tr key={q.id} className="hover:bg-gray-50 transition duration-100">
                            <td className={`${td} font-semibold text-gray-900`}>{q.quoteNumber}</td>
                            <td className={`${td} text-gray-500`}>{formatDate(q.createdAt)}</td>
                            <td className={`${td} font-medium text-gray-900`}>
                                {q.customerName}
                                {q.vehicleDescription && (
                                    <span className="block text-xs font-normal text-gray-400">
                                        {q.vehicleDescription}
                                    </span>
                                )}
                            </td>
                            <td className={`${td} text-gray-700 font-mono`}>{q.vehiclePlate ?? '—'}</td>
                            <td className={`${td} text-right font-semibold text-gray-900`}>{formatMoney(q.total)}</td>
                            <td className={td}>
                                <QuoteStatusBadge status={q.displayStatus} />
                            </td>
                            <td className={`${td} text-right font-medium space-x-3`}>
                                <Link
                                    href={`/dashboard/presupuestos/${q.id}`}
                                    className="text-blue-600 hover:text-blue-900 transition duration-150"
                                >
                                    Ver detalle
                                </Link>
                                {q.status !== 'ACEPTADO' && (
                                    <QuoteDeleteButton quoteId={q.id} quoteNumber={q.quoteNumber} variant="row" />
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
