/**
 * Normaliza una patente para comparación/búsqueda:
 * quita guiones y espacios, pasa a mayúsculas.
 * Sirve para encontrar FAM-250 y FAM250 por igual.
 */
export function normalizeLicensePlate(plate: string): string {
    if (!plate) return '';
    return plate.replace(/[-\s]/g, '').toUpperCase();
}

/** Detecta guiones o espacios (no permitidos en altas nuevas). */
export function licensePlateHasSeparators(plate: string): boolean {
    return /[-\s]/.test(plate.trim());
}

/**
 * Valida y normaliza una patente para alta/edición de vehículo nuevo.
 * No permite guiones ni espacios: debe cargarse como AA123BB o ABC123.
 */
export function validateNewLicensePlate(raw: string): {
    ok: boolean;
    plate?: string;
    message?: string;
} {
    const trimmed = raw.trim();
    if (!trimmed) {
        return { ok: false, message: 'La patente es obligatoria.' };
    }

    if (licensePlateHasSeparators(trimmed)) {
        return {
            ok: false,
            message: 'La patente no debe incluir guiones ni espacios. Ejemplos válidos: AA123BB o ABC123.',
        };
    }

    const plate = normalizeLicensePlate(trimmed);
    // Formato viejo: 6 alfanuméricos (ABC123) o nuevo mercosur: 7 (AA123BB)
    if (!/^[A-Z0-9]{6,7}$/.test(plate)) {
        return {
            ok: false,
            message: 'Patente inválida. Use el formato AA123BB (Mercosur) o ABC123 (formato anterior), sin guiones.',
        };
    }

    return { ok: true, plate };
}
