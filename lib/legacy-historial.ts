/**
 * Cliente del historial del sistema previo.
 * API: GET {URL}?vin=...  Authorization: Bearer {KEY}
 * Solo acepta VIN de 17 caracteres (patente → 400).
 */

const DEFAULT_TIMEOUT_MS = 8_000;

export type LegacyHistorialResult = {
    vin: string;
    historial: string;
};

export function normalizeVin(vin: string): string {
    if (!vin) return '';
    return vin.replace(/\s+/g, '').toUpperCase();
}

/** VIN de 17 chars (excluye I, O, Q como en ISO 3779). */
export function isValidVin17(vin: string): boolean {
    const normalized = normalizeVin(vin);
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(normalized);
}

function getConfig(): { url: string; apiKey: string } | null {
    const url = (process.env.LEGACY_HISTORIAL_API_URL || '').trim().replace(/\/$/, '');
    const apiKey = (process.env.LEGACY_HISTORIAL_API_KEY || '').trim();
    if (!url || !apiKey) return null;
    return { url, apiKey };
}

/**
 * Consulta el historial antiguo por VIN.
 * Devuelve null si no hay config, VIN inválido, 400/404/error, o si el VIN
 * de la respuesta no coincide con el solicitado.
 */
export async function fetchLegacyHistorialByVin(
    vin: string,
    opts: { timeoutMs?: number } = {}
): Promise<LegacyHistorialResult | null> {
    const normalized = normalizeVin(vin);
    if (!isValidVin17(normalized)) return null;

    const config = getConfig();
    if (!config) return null;

    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const endpoint = `${config.url}?vin=${encodeURIComponent(normalized)}`;
        const res = await fetch(endpoint, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                Accept: 'application/json',
            },
            signal: controller.signal,
            cache: 'no-store',
        });

        if (res.status === 404 || res.status === 400) {
            return null;
        }

        if (!res.ok) {
            console.warn(
                `[legacy-historial] HTTP ${res.status} para VIN ${normalized.slice(0, 4)}…`
            );
            return null;
        }

        const body = (await res.json()) as { vin?: unknown; historial?: unknown };
        const responseVin = typeof body.vin === 'string' ? normalizeVin(body.vin) : '';
        const historial = typeof body.historial === 'string' ? body.historial.trim() : '';

        if (!historial) return null;

        if (responseVin !== normalized) {
            console.warn(
                `[legacy-historial] VIN de respuesta no coincide con el solicitado (${normalized.slice(0, 4)}…).`
            );
            return null;
        }

        return { vin: responseVin, historial };
    } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
            console.warn(`[legacy-historial] timeout tras ${timeoutMs}ms`);
        } else {
            console.warn('[legacy-historial] error de red/parse:', error);
        }
        return null;
    } finally {
        clearTimeout(timer);
    }
}
