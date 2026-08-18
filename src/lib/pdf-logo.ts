import * as fs from 'fs';
import * as path from 'path';

export const WORKSHOP_LETTERHEAD_ADDRESS = 'Calle 24 Nro. 638 - Avellaneda';
export const WORKSHOP_LETTERHEAD_PHONE = 'Whatsapp 3482-584267';
export const WORKSHOP_LETTERHEAD_CONTACT = `${WORKSHOP_LETTERHEAD_ADDRESS} - ${WORKSHOP_LETTERHEAD_PHONE}`;

/**
 * Membrete Nóbile en escala de grises para PDFs (OT e historial).
 * Archivo: public/images/membrete-nobile-gris.png
 */
export function getLogoBase64(): string | null {
    const candidates = [
        path.join(process.cwd(), 'public', 'images', 'membrete-nobile-gris.png'),
        path.join(process.cwd(), 'public', 'images', 'logo-taller.png'),
    ];

    for (const logoPath of candidates) {
        try {
            if (!fs.existsSync(logoPath)) continue;
            const fileBuffer = fs.readFileSync(logoPath);
            const ext = path.extname(logoPath).toLowerCase();
            const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
            return `data:${mime};base64,${fileBuffer.toString('base64')}`;
        } catch (error) {
            console.error('Error al cargar el membrete PDF:', logoPath, error);
        }
    }

    return null;
}
