export function normalizeLicensePlate(plate: string): string {
    if (!plate) return '';
    return plate.replace(/[-\s]/g, '').toUpperCase();
}