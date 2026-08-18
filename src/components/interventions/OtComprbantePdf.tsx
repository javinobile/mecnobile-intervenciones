// app/components/interventions/OtComprobantePdf.tsx
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { WORKSHOP_LETTERHEAD_CONTACT } from '@/lib/pdf-logo';

const BRAND = '#1F1F1F';
const BRAND_SOFT = '#F3F3F3';
const BORDER = '#D1D5DB';
const MUTED = '#6B7280';
const TEXT = '#374151';

const styles = StyleSheet.create({
    page: {
        paddingHorizontal: 28,
        paddingTop: 12,
        paddingBottom: 32,
        fontFamily: 'Helvetica',
        color: TEXT,
        fontSize: 9,
    },
    header: {
        paddingBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
        marginBottom: 8,
    },
    letterheadRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    letterhead: {
        width: 210,
        height: 55,
        objectFit: 'contain',
        marginRight: 10,
    },
    workshopContact: {
        flex: 1,
        justifyContent: 'center',
    },
    workshopAddress: {
        fontSize: 7.5,
        color: TEXT,
        textAlign: 'left',
        lineHeight: 1.3,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
    },
    headerLeft: {
        flex: 1,
        paddingRight: 8,
    },
    title: {
        fontSize: 15,
        color: BRAND,
        fontFamily: 'Helvetica-Bold',
    },
    headerMeta: {
        fontSize: 8,
        color: MUTED,
        marginTop: 2,
    },
    statusBadge: {
        fontSize: 8,
        color: BRAND,
        backgroundColor: BRAND_SOFT,
        borderRadius: 3,
        paddingVertical: 3,
        paddingHorizontal: 7,
        fontFamily: 'Helvetica-Bold',
    },
    columnsRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 10,
    },
    card: {
        flex: 1,
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 4,
        padding: 8,
    },
    cardTitle: {
        fontSize: 9,
        color: BRAND,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 5,
        textTransform: 'uppercase',
    },
    dataRow: {
        flexDirection: 'row',
        marginBottom: 2.5,
    },
    label: {
        width: '40%',
        fontSize: 8.5,
        color: MUTED,
        fontFamily: 'Helvetica-Bold',
    },
    value: {
        width: '60%',
        fontSize: 8.5,
        color: TEXT,
    },
    sectionTitle: {
        fontSize: 9,
        color: BRAND,
        fontFamily: 'Helvetica-Bold',
        marginBottom: 3,
        textTransform: 'uppercase',
    },
    textBox: {
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 4,
        padding: 7,
        minHeight: 30,
        marginBottom: 10,
    },
    textBoxContent: {
        fontSize: 9,
        lineHeight: 1.4,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: BRAND_SOFT,
        borderWidth: 1,
        borderColor: BORDER,
        paddingVertical: 4,
        paddingHorizontal: 6,
    },
    tableRow: {
        flexDirection: 'row',
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: BORDER,
        paddingVertical: 4,
        paddingHorizontal: 6,
    },
    colType: { width: '18%', fontSize: 8 },
    colDesc: { width: '62%', fontSize: 8 },
    colAmount: { width: '20%', fontSize: 8, textAlign: 'right' },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 6,
        marginBottom: 10,
    },
    totalLabel: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        marginRight: 8,
    },
    totalValue: {
        fontSize: 11,
        fontFamily: 'Helvetica-Bold',
        color: BRAND,
    },
    metadata: {
        fontSize: 7.5,
        marginTop: 6,
        color: MUTED,
        textAlign: 'right',
    },
    footer: {
        position: 'absolute',
        bottom: 16,
        left: 28,
        right: 28,
        fontSize: 7,
        textAlign: 'center',
        color: MUTED,
        paddingTop: 5,
        borderTopWidth: 1,
        borderTopColor: BORDER,
    },
});

const typeLabels: Record<string, string> = {
    REPUESTO: 'Repuesto',
    MANO_DE_OBRA: 'M. Obra',
    TRABAJO_TERCERO: 'Terc.',
};

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
    items?: {
        type: string;
        description: string;
        amount: number;
    }[];
    car: { licensePlate: string, make: string | null, model: string | null, year: number | null, vin: string };
    owner: { name: string, dni: string | null } | null;
    performedBy: { name: string | null } | null;
}

const formatMoney = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

export const OtComprobantePdf = ({ data }: { data: PdfData }) => (
    <Document>
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <View style={styles.letterheadRow}>
                    {data.logoSrc ? (
                        <Image src={data.logoSrc} style={styles.letterhead} />
                    ) : (
                        <View style={styles.letterhead} />
                    )}
                    <View style={styles.workshopContact}>
                        <Text style={styles.workshopAddress}>{WORKSHOP_LETTERHEAD_CONTACT}</Text>
                    </View>
                </View>
                <View style={styles.headerRow}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.title}>COMPROBANTE DE OT #{data.otNumber}</Text>
                        <Text style={styles.headerMeta}>
                            Emitido: {data.createdAt.toLocaleDateString('es-AR')}
                        </Text>
                    </View>
                    <Text style={styles.statusBadge}>{data.status.replace('_', ' ')}</Text>
                </View>
            </View>

            <View style={styles.columnsRow}>
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Datos del Cliente</Text>
                    <View style={styles.dataRow}>
                        <Text style={styles.label}>Nombre:</Text>
                        <Text style={styles.value}>{data.owner?.name || 'N/A'}</Text>
                    </View>
                    <View style={styles.dataRow}>
                        <Text style={styles.label}>DNI/CUIT:</Text>
                        <Text style={styles.value}>{data.owner?.dni || 'N/A'}</Text>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Datos del Vehículo</Text>
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
                </View>
            </View>

            <Text style={styles.sectionTitle}>Diagnóstico Inicial</Text>
            <View style={styles.textBox}>
                <Text style={styles.textBoxContent}>{data.description}</Text>
            </View>

            {data.notes && (
                <>
                    <Text style={styles.sectionTitle}>Notas / Trabajos</Text>
                    <View style={styles.textBox}>
                        <Text style={styles.textBoxContent}>{data.notes}</Text>
                    </View>
                </>
            )}

            {data.items && data.items.length > 0 && (
                <>
                    <Text style={styles.sectionTitle}>Detalle de ítems</Text>
                    <View style={styles.tableHeader}>
                        <Text style={[styles.colType, { fontFamily: 'Helvetica-Bold' }]}>Tipo</Text>
                        <Text style={[styles.colDesc, { fontFamily: 'Helvetica-Bold' }]}>Descripción</Text>
                        <Text style={[styles.colAmount, { fontFamily: 'Helvetica-Bold' }]}>Importe</Text>
                    </View>
                    {data.items.map((item, idx) => (
                        <View key={idx} style={styles.tableRow}>
                            <Text style={styles.colType}>{typeLabels[item.type] || item.type}</Text>
                            <Text style={styles.colDesc}>{item.description}</Text>
                            <Text style={styles.colAmount}>{formatMoney(item.amount)}</Text>
                        </View>
                    ))}
                </>
            )}

            <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total OT:</Text>
                <Text style={styles.totalValue}>{formatMoney(data.cost)}</Text>
            </View>

            <Text style={styles.metadata}>
                OT Registrada: {data.createdAt.toLocaleDateString('es-AR')} | Última Modificación: {data.updatedAt.toLocaleDateString('es-AR')}
                {data.performedBy?.name ? ` | Mecánico: ${data.performedBy.name}` : ''}
            </Text>

            <Text style={styles.footer} fixed>
                Este documento no es una factura. Emitido por Nóbile — Servicios del automotor.
            </Text>
        </Page>
    </Document>
);
