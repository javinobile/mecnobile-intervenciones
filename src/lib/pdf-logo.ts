import * as fs from 'fs';
import * as path from 'path';

/** Logo del taller en data-URL para PDFs (@react-pdf). */
export function getLogoBase64(): string | null {
    try {
        const logoPath = path.join(process.cwd(), 'public', 'images', 'logo-taller.png');
        const fileBuffer = fs.readFileSync(logoPath);
        return `data:image/png;base64,${fileBuffer.toString('base64')}`;
    } catch (error) {
        console.error('Error al cargar el logo en el servidor:', error);
        return null;
    }
}
