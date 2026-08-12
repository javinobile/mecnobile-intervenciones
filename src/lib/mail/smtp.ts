/** Envío de correo por SMTP (opcional). Sin config → isMailConfigured() = false. */

import nodemailer from 'nodemailer';

export function isMailConfigured(): boolean {
    return Boolean(
        process.env.SMTP_HOST?.trim() &&
            process.env.SMTP_USER?.trim() &&
            process.env.SMTP_PASS?.trim() &&
            process.env.SMTP_FROM?.trim()
    );
}

export async function sendMailWithPdfAttachment(opts: {
    to: string;
    subject: string;
    text: string;
    pdfBuffer: Buffer;
    pdfFilename: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!isMailConfigured()) {
        return {
            ok: false,
            message:
                'El correo no está configurado (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM).',
        };
    }

    try {
        const port = Number(process.env.SMTP_PORT || 587);
        const secure = process.env.SMTP_SECURE === 'true' || port === 465;
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST!.trim(),
            port,
            secure,
            auth: {
                user: process.env.SMTP_USER!.trim(),
                pass: process.env.SMTP_PASS!.trim(),
            },
        });

        await transporter.sendMail({
            from: process.env.SMTP_FROM!.trim(),
            to: opts.to,
            subject: opts.subject,
            text: opts.text,
            attachments: [
                {
                    filename: opts.pdfFilename,
                    content: opts.pdfBuffer,
                    contentType: 'application/pdf',
                },
            ],
        });

        return { ok: true };
    } catch (err) {
        console.error('[mail] send error', err);
        return {
            ok: false,
            message: err instanceof Error ? err.message : 'Error al enviar el correo.',
        };
    }
}
