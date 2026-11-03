/**
 * Tipos compartidos del checklist de service (SPEC 02), usables desde server y client components.
 */

export type ServiceCheckStatusValue = 'REVISADO' | 'CAMBIADO';

/** Punto marcado en una OT (snapshot de nombre y orden al momento de marcarlo). */
export type ServiceCheckDto = {
    checklistItemId: string | null;
    name: string;
    sortOrder: number;
    status: ServiceCheckStatusValue;
};

/** Punto activo del catálogo, para armar las filas de la tabla. */
export type ServiceCatalogItemDto = {
    id: string;
    name: string;
    sortOrder: number;
};

/**
 * Resumen en una línea del service de una OT, para el historial del auto (PDF, email y visor).
 * Ej.: "Service — Cambiado: Aceite de motor, Filtro de aceite. Revisado: Filtro de aire".
 * Omite el grupo vacío; sin puntos marcados devuelve "Service (sin puntos registrados)".
 * Los checks deben venir ya ordenados (sortOrder, name).
 */
export function formatServiceSummary(checks: { name: string; status: ServiceCheckStatusValue }[]): string {
    const changed = checks.filter((c) => c.status === 'CAMBIADO').map((c) => c.name);
    const reviewed = checks.filter((c) => c.status === 'REVISADO').map((c) => c.name);
    const groups: string[] = [];
    if (changed.length > 0) groups.push(`Cambiado: ${changed.join(', ')}`);
    if (reviewed.length > 0) groups.push(`Revisado: ${reviewed.join(', ')}`);
    if (groups.length === 0) return 'Service (sin puntos registrados)';
    return `Service — ${groups.join('. ')}`;
}
