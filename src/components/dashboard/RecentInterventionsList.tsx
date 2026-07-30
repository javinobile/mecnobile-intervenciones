'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';

export interface RecentInterventionItem {
    id?: string;
    otNumber: number;
    description: string;
    dateOfIntervention: Date | string;
    cost: number;
    car: { licensePlate: string };
    performedBy: { name: string | null };
}

function formatCost(cost: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(cost);
}

function formatDate(date: Date | string) {
    return new Date(date).toLocaleDateString('es-AR');
}

export default function RecentInterventionsList({ interventions }: { interventions: RecentInterventionItem[] }) {
    const [showAmounts, setShowAmounts] = useState(false);

    if (interventions.length === 0) {
        return (
            <p className="text-gray-500 py-4 text-center text-sm">
                No hay Órdenes de Trabajo en curso.
            </p>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                <h2 className="text-base font-semibold text-gray-800">Trabajos en curso</h2>
                <button
                    type="button"
                    onClick={() => setShowAmounts((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-2 py-2 min-h-11 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition duration-150"
                    aria-pressed={showAmounts}
                    aria-label={showAmounts ? 'Ocultar importes' : 'Mostrar importes'}
                    title={showAmounts ? 'Ocultar importes' : 'Mostrar importes'}
                >
                    {showAmounts ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    <span className="hidden sm:inline">{showAmounts ? 'Ocultar importes' : 'Mostrar importes'}</span>
                </button>
            </div>

            <div className="space-y-2">
                {interventions.map((ot, index) => {
                    const content = (
                        <>
                            <div className="flex items-center space-x-3 min-w-0">
                                <span className="text-sm font-bold text-blue-600 min-w-[48px]">OT-{ot.otNumber}</span>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-800 truncate">{ot.description}</p>
                                    <p className="text-xs text-gray-500">
                                        Vehículo: <span className="font-medium">{ot.car.licensePlate}</span> | Mecánico: {ot.performedBy.name || 'N/A'}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right shrink-0 pl-3">
                                <p className={`text-sm font-semibold ${showAmounts ? 'text-green-700' : 'text-gray-400 tracking-wider'}`}>
                                    {showAmounts ? formatCost(ot.cost) : '••••••'}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {formatDate(ot.dateOfIntervention)}
                                </p>
                            </div>
                        </>
                    );

                    if (ot.id) {
                        return (
                            <Link
                                key={ot.id}
                                href={`/dashboard/interventions/${ot.id}`}
                                className="flex justify-between items-center px-3 py-3 min-h-11 border border-gray-100 rounded-md hover:bg-blue-50 hover:border-blue-200 transition duration-150"
                            >
                                {content}
                            </Link>
                        );
                    }

                    return (
                        <div
                            key={`${ot.otNumber}-${index}`}
                            className="flex justify-between items-center px-3 py-2.5 border border-gray-100 rounded-md"
                        >
                            {content}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
