// app/components/interventions/OtComprobantePdf.tsx
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';

// --- Definición de Estilos (Modificamos 'costTotal' y agregamos 'metadata') ---
const styles = StyleSheet.create({
    page: {
        padding: 30,
        fontFamily: 'Helvetica',
    },
    header: {
        fontSize: 24,
        marginBottom: 10,
        textAlign: 'center',
        color: '#1E40AF',
        fontWeight: 'bold',
    },
    logo: {
        width: 120, // Ajusta el ancho según tu imagen
        height: 60, // Ajusta la altura según tu imagen
        marginBottom: 10,
        alignSelf: 'center', // Centra el logo horizontalmente
    },
    subheader: {
        fontSize: 16,
        marginTop: 15,
        marginBottom: 5,
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
        paddingBottom: 2,
        color: '#4B5563',
    },
    dataRow: {
        fontSize: 10,
        flexDirection: 'row',
        marginBottom: 3,
    },
    label: {
        width: '30%',
        fontWeight: 'bold',
    },
    value: {
        width: '70%',
    },
    description: {
        marginTop: 10,
        fontSize: 10,
        border: '1pt solid #ccc',
        padding: 10,
        minHeight: 80,
        whiteSpace: 'pre-wrap',
    },
    // <-- CAMBIO CLAVE: Reducción del tamaño de fuente a 20 (antes 28)
    costTotal: {
        fontSize: 20,
        marginTop: 20,
        textAlign: 'right',
        color: '#059669',
        fontWeight: 'bold',
    },
    // <-- NUEVO ESTILO: Para la trazabilidad/metadata
    metadata: {
        fontSize: 9,
        marginTop: 15,
        paddingTop: 5,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        color: '#6B7280',
        textAlign: 'right',
    },
    footer: {
        fontSize: 8,
        textAlign: 'center',
        marginTop: 30,
        color: '#6B7280',
        paddingTop: 5,
        borderTopWidth: 1,
        borderTopColor: '#ccc',
    }
});

export interface PdfData {
    otNumber: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    notes: string | null;
    logoSrc: string | null;
    mileageKm: number;
    description: string;
    cost: number;
    car: { licensePlate: string, make: string | null, model: string | null, year: number | null, vin: string };
    owner: { name: string, dni: string | null } | null;
    performedBy: { name: string | null } | null;
}

// --- Componente principal del PDF ---
export const OtComprobantePdf = ({ data }: { data: PdfData }) => (
    <Document>
        <Page size="A4" style={styles.page}>

            {/* LOGOTIPO DEL TALLER (USAMOS logoSrc como Data URL) */}
            {data.logoSrc && (
                <Image src={data.logoSrc} style={styles.logo} />
            )}

            <Text style={styles.header}>COMPROBANTE DE OT #{data.otNumber}</Text>

            {/* ... (Secciones de Cliente y Vehículo sin cambios) ... */}

            {/* Sección Cliente */}
            <Text style={styles.subheader}>DATOS DEL CLIENTE</Text>
            <View style={styles.dataRow}>
                <Text style={styles.label}>Nombre:</Text>
                <Text style={styles.value}>{data.owner?.name || 'N/A'}</Text>
            </View>
            <View style={styles.dataRow}>
                <Text style={styles.label}>DNI/CUIT:</Text>
                <Text style={styles.value}>{data.owner?.dni || 'N/A'}</Text>
            </View>

            {/* Sección Vehículo */}
            <Text style={styles.subheader}>DATOS DEL VEHÍCULO</Text>
            <View style={styles.dataRow}>
                <Text style={styles.label}>Matrícula:</Text>
                <Text style={styles.value}>{data.car.licensePlate}</Text>
            </View>
            <View style={styles.dataRow}>
                <Text style={styles.label}>Marca/Modelo:</Text>
                <Text style={styles.value}>{data.car.make} {data.car.model} ({data.car.year})</Text>
            </View>
            <View style={styles.dataRow}>
                <Text style={styles.label}>Km al Ingreso:</Text>
                <Text style={styles.value}>{data.mileageKm.toLocaleString('es-AR')} KM</Text>
            </View>

            {/* Sección Trabajo */}
            <Text style={styles.subheader}>DIAGNOSTICO INICIAL</Text>
            <View style={styles.description}>
                <Text>{data.description}</Text>
            </View>

            {/* SECCIÓN DE SEGUIMIENTO/NOTAS DE TALLER (NUEVA) */}
            {data.notes && (
                <>
                    <Text style={styles.subheader}>TRABAJOS REALIZADOS</Text>
                    <View style={styles.description}>
                        <Text>{data.notes}</Text>
                    </View>
                </>
            )}

            {/* Sección Costo y Metadata */}
            <View style={{ marginTop: 20 }}>

                {/* Fila del Estado */}
                <View style={styles.dataRow}>
                    <Text style={styles.label}>Estado:</Text>
                    <Text style={styles.value}>{data.status.replace('_', ' ')}</Text>
                </View>

                {/* Fila del Costo Total */}
                <Text style={styles.costTotal}>
                    COSTO TOTAL: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(data.cost)}
                </Text>

                {/* TRAZABILIDAD / SEGUIMIENTO (NUEVA SECCIÓN) */}
                <Text style={styles.metadata}>
                    OT Registrada: {data.createdAt.toLocaleDateString('es-AR')} |
                    Última Modificación: {data.updatedAt.toLocaleDateString('es-AR')}
                </Text>
            </View>

            <Text style={styles.footer} fixed>
                Este documento no es una factura. Emitido para el cliente con fines informativos.
            </Text>
        </Page>
    </Document>
);