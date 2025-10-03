// components/clients/PaginationLink.tsx

'use client';

import Link from 'next/link';
// 1. IMPORTA los iconos aquí (en el Client Component)
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationLinkProps {
    page: number;
    disabled: boolean;
    query: string;
    label: string;
    // 2. Acepta una cadena simple en lugar del objeto de componente
    iconType: 'left' | 'right';
}

export default function PaginationLink({ page, disabled, query, label, iconType }: PaginationLinkProps) {

    // 3. Selecciona el componente de icono basado en el prop simple
    const IconComponent = iconType === 'left' ? ChevronLeft : ChevronRight;

    // Crea la URL de destino
    const href = `/dashboard/clients?page=${page}&q=${query}`;

    // Estilos para el botón
    const baseClasses = "px-3 py-1 text-sm font-medium rounded-lg transition duration-150 flex items-center";
    const disabledClasses = disabled ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-white text-blue-600 border border-gray-300 hover:bg-gray-50";

    return (
        <Link
            href={href}
            passHref

            className={`${baseClasses} ${disabledClasses}`}
            aria-disabled={disabled}
            onClick={(e) => { if (disabled) e.preventDefault(); }}
        >
            {/* 4. Renderiza el icono dentro del Client Component */}
            {iconType === 'left' && <IconComponent className="w-4 h-4 mr-2" />}
            {label}
            {iconType === 'right' && <IconComponent className="w-4 h-4 ml-2" />}

        </Link>
    );
}