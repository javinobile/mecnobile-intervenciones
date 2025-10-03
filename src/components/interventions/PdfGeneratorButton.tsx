// app/components/interventions/PdfGeneratorButton.tsx
'use client';

import { useState } from 'react';
// Asegúrate de que esta ruta es correcta para tu Server Action
import { generateOtPdfBase64 } from '@/actions/intervention.actions'; 
import { FileText, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface PdfGeneratorButtonProps {
    interventionId: string;
}

/**
 * Componente de cliente que genera la Orden de Trabajo como PDF y la abre
 * en una nueva pestaña.
 */
export default function PdfGeneratorButton({ interventionId }: PdfGeneratorButtonProps) {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleGeneratePdf = async () => {
        setLoading(true);
        setMessage(null);

        try {
            // 1. Llamar a la Server Action para generar el PDF y obtener el Base64
            const result = await generateOtPdfBase64(interventionId);
            
            if (result.success && result.base64Data) {
                
                // 2. Convertir la cadena Base64 a un Array de Bytes
                const binaryString = window.atob(result.base64Data);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                // 3. Crear un Blob (archivo binario) con tipo PDF
                const blob = new Blob([bytes], { type: 'application/pdf' });
                
                // 4. Crear una URL local y abrir en una nueva pestaña
                const url = window.URL.createObjectURL(blob);
                
                // Opcional: Establecer un nombre de archivo para la descarga
                // const filename = `OT_${result.otNumber}_Comprobante.pdf`; 
                
                // Abrir en una nueva pestaña para previsualizar e imprimir
                window.open(url, '_blank');
                
                setMessage({ type: 'success', text: `PDF de la OT #${result.otNumber} generado con éxito y abierto en una nueva pestaña.` });
                
            } else {
                setMessage({ type: 'error', text: result.message || 'Error desconocido al generar el PDF.' });
            }

        } catch (error) {
            console.error("Error al generar PDF:", error);
            setMessage({ type: 'error', text: 'Error de red o procesamiento al generar el archivo.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-3">
            <button
                onClick={handleGeneratePdf}
                disabled={loading}
                className="flex items-center justify-center px-4 py-3 bg-red-600 text-white font-medium rounded-lg shadow-md hover:bg-red-700 disabled:opacity-50 transition duration-150 w-full"
            >
                {loading ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                    <FileText className="w-5 h-5 mr-2" />
                )}
                {loading ? 'Generando Comprobante...' : 'Generar Comprobante PDF'}
            </button>
            
            {/* Mostrar mensajes de estado */}
            {message && (
                <div className={`p-2 text-sm font-medium rounded-md flex items-center ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {message.type === 'success' ? <CheckCircle className="w-4 h-4 mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                    {message.text}
                </div>
            )}
        </div>
    );
}