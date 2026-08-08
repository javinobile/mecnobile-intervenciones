/** Configuración Meta WhatsApp Cloud API desde env. */

export function isWhatsAppConfigured(): boolean {
    return Boolean(
        process.env.WHATSAPP_ACCESS_TOKEN &&
            process.env.WHATSAPP_PHONE_NUMBER_ID &&
            !process.env.WHATSAPP_ACCESS_TOKEN.includes('your_') &&
            !process.env.WHATSAPP_PHONE_NUMBER_ID.includes('your_')
    );
}

export function getWhatsAppConfig() {
    return {
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
        apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
        appSecret: process.env.META_APP_SECRET || '',
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
        businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
        appId: process.env.META_APP_ID || '',
        templateConfirmado: process.env.WHATSAPP_TEMPLATE_TURNO_CONFIRMADO || 'turno_confirmado',
        templateAlternativas: process.env.WHATSAPP_TEMPLATE_TURNO_ALTERNATIVAS || 'turno_alternativas',
        templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'es_AR',
    };
}

export const WHATSAPP_BOT_EMAIL = 'whatsapp-bot@mecnobile.local';
