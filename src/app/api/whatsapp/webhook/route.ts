import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppConfig } from '@/lib/whatsapp/config';
import { verifyMetaSignature } from '@/lib/whatsapp/meta-client';
import { handleIncomingWhatsAppMessage } from '@/lib/whatsapp/bot-flow';

export const runtime = 'nodejs';

/** Verificación del webhook (Meta envía hub.mode / hub.verify_token / hub.challenge). */
export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');
    const { verifyToken } = getWhatsAppConfig();

    if (mode === 'subscribe' && token && challenge && token === verifyToken) {
        return new NextResponse(challenge, { status: 200 });
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

type WaChangeValue = {
    messages?: Array<{
        from: string;
        type?: string;
        text?: { body?: string };
        button?: { payload?: string; text?: string };
        interactive?: {
            type?: string;
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string };
        };
    }>;
};

export async function POST(request: NextRequest) {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256');

    if (!verifyMetaSignature(rawBody, signature)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let payload: {
        object?: string;
        entry?: Array<{
            changes?: Array<{ value?: WaChangeValue }>;
        }>;
    };

    try {
        payload = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Responder 200 rápido; procesar mensajes a continuación
    const tasks: Promise<void>[] = [];

    if (payload.object === 'whatsapp_business_account') {
        for (const entry of payload.entry || []) {
            for (const change of entry.changes || []) {
                const messages = change.value?.messages || [];
                for (const message of messages) {
                    const from = message.from;
                    if (!from) continue;

                    let text = '';
                    let buttonId: string | undefined;

                    if (message.type === 'text') {
                        text = message.text?.body || '';
                    } else if (message.type === 'button') {
                        text = message.button?.text || message.button?.payload || '';
                        buttonId = message.button?.payload;
                    } else if (message.type === 'interactive') {
                        text =
                            message.interactive?.button_reply?.title ||
                            message.interactive?.list_reply?.title ||
                            '';
                        buttonId =
                            message.interactive?.button_reply?.id ||
                            message.interactive?.list_reply?.id;
                    } else {
                        continue;
                    }

                    tasks.push(
                        handleIncomingWhatsAppMessage({ from, text, buttonId }).catch((err) => {
                            console.error('Error handling WA message:', err);
                        })
                    );
                }
            }
        }
    }

    await Promise.all(tasks);
    return NextResponse.json({ success: true });
}
