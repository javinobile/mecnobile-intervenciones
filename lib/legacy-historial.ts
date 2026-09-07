/**
 * Cliente + parseo del historial del sistema previo.
 * API: GET {URL}?vin=...  Authorization: Bearer {KEY}
 *
 * Formato de cada visita en el texto:
 *   DD/MM/AAAA — NNNNN km — Garantía: ...
 *   Trabajo: ...
 *   Diagnóstico: ...
 *   Resultado: ...
 *   (Repuestos / Mano de obra / Importe se ignoran)
 */

const DEFAULT_TIMEOUT_MS = 8_000;

export type LegacyHistorialResult = {
    vin: string;
    historial: string;
};

/** Campos relevantes del sistema viejo (sin importes). */
export type LegacyHistoryEntry = {
    dateLabel: string;
    mileageKm: number | null;
    trabajo: string;
    diagnostico: string;
    resultado: string;
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

const ENTRY_HEADER_RE =
    /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[—–\-]\s*([\d.\s]+)\s*km\b/i;

function parseKm(raw: string): number | null {
    const digits = raw.replace(/[^\d]/g, '');
    if (!digits) return null;
    const n = Number(digits);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function fieldValue(block: string, labels: string[]): string {
    for (const label of labels) {
        const re = new RegExp(`^${label}\\s*:\\s*(.*)$`, 'im');
        const m = block.match(re);
        if (m?.[1]?.trim()) return m[1].trim();
    }
    return '';
}

/**
 * Parseo determinístico del texto del sistema viejo.
 * Solo fecha, km, trabajo, diagnóstico y resultado.
 */
export function parseLegacyHistorialEntries(rawHistorial: string): LegacyHistoryEntry[] {
    if (!rawHistorial?.trim()) return [];

    let body = rawHistorial;
    const histIdx = rawHistorial.search(/\bhistorial\s*:?\s*\n/i);
    if (histIdx >= 0) {
        body = rawHistorial.slice(histIdx).replace(/^\s*historial\s*:?\s*/i, '');
    }

    const lines = body.split(/\r?\n/);
    const entries: LegacyHistoryEntry[] = [];
    let currentHeader: { dateLabel: string; mileageKm: number | null } | null = null;
    let currentLines: string[] = [];

    const flush = () => {
        if (!currentHeader) return;
        const block = currentLines.join('\n');
        const trabajo = fieldValue(block, ['Trabajo']);
        const diagnostico = fieldValue(block, ['Diagnóstico', 'Diagnostico']);
        const resultado = fieldValue(block, ['Resultado']);
        if (trabajo || diagnostico || resultado || currentHeader.mileageKm != null) {
            entries.push({
                dateLabel: currentHeader.dateLabel,
                mileageKm: currentHeader.mileageKm,
                trabajo: trabajo || '—',
                diagnostico: diagnostico || '—',
                resultado: resultado || '—',
            });
        }
        currentHeader = null;
        currentLines = [];
    };

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const header = trimmed.match(ENTRY_HEADER_RE);
        if (header) {
            flush();
            currentHeader = {
                dateLabel: header[1],
                mileageKm: parseKm(header[2]),
            };
            currentLines = [];
            continue;
        }
        if (currentHeader) {
            currentLines.push(trimmed);
        }
    }
    flush();

    return entries;
}

export async function fetchParsedLegacyHistorialByVin(
    vin: string
): Promise<LegacyHistoryEntry[]> {
    const legacy = await fetchLegacyHistorialByVin(vin);
    if (!legacy?.historial) return [];
    return parseLegacyHistorialEntries(legacy.historial);
}
