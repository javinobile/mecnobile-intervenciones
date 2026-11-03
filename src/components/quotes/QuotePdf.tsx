import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { WORKSHOP_LETTERHEAD_CONTACT } from '@/lib/pdf-logo';

// Misma paleta y membrete que el comprobante de OT (OtComprbantePdf.tsx).
const BRAND = '#1F1F1F';
const BRAND_SOFT = '#F3F3F3';
const BORDER = '#D1D5DB';
const MUTED = '#6B7280';
const TEXT = '#374151';

const styles = StyleSheet.create({
    page: { paddingHorizontal: 28, paddingTop: 12, paddingBottom: 40, fontFamily: 'Helvetica', color: TEXT, fontSize: 9 },
    header: { paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 8 },
    letterheadRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    letterhead: { width: 210, height: 55, objectFit: 'contain', marginRight: 10 },
    workshopContact: { flex: 1, justifyContent: 'center' },
    workshopAddress: { fontSize: 7.5, color: TEXT, lineHeight: 1.3 },
    headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    title: { fontSize: 15, color: BRAND, fontFamily: 'Helvetica-Bold' },
    headerMeta: { fontSize: 8, color: MUTED, marginTop: 2 },
    validity: {
        fontSize: 8,
        color: BRAND,
        backgroundColor: BRAND_SOFT,
        borderRadius: 3,
        paddingVertical: 3,
        paddingHorizontal: 7,
        fontFamily: 'Helvetica-Bold',
    },
    columnsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    card: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 8 },
    cardTitle: { fontSize: 9, color: BRAND, fontFamily: 'Helvetica-Bold', marginBottom: 5, textTransform: 'uppercase' },
    dataRow: { flexDirection: 'row', marginBottom: 2.5 },
    label: { width: '35%', fontSize: 8.5, color: MUTED, fontFamily: 'Helvetica-Bold' },
    value: { width: '65%', fontSize: 8.5, color: TEXT },
    sectionTitle: { fontSize: 9, color: BRAND, fontFamily: 'Helvetica-Bold', marginBottom: 3, textTransform: 'uppercase' },
    textBox: { borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 7, marginBottom: 10 },
    textBoxContent: { fontSize: 9, lineHeight: 1.4 },
    groupHeader: {
        flexDirection: 'row',
        backgroundColor: BRAND_SOFT,
        borderWidth: 1,
        borderColor: BORDER,
        paddingVertical: 4,
        paddingHorizontal: 6,
        marginTop: 6,
    },
    groupTitle: { flex: 1, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: BRAND, textTransform: 'uppercase' },
    row: {
        flexDirection: 'row',
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: BORDER,
        paddingVertical: 4,
        paddingHorizontal: 6,
    },
    colDesc: { width: '80%', fontSize: 8.5 },
    colAmount: { width: '20%', fontSize: 8.5, textAlign: 'right' },
    subtotalRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 3, paddingHorizontal: 6 },
    subtotalText: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
    summary: { marginTop: 10, marginLeft: 'auto', width: '45%', borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 8 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
    summaryLabel: { fontSize: 8.5, color: MUTED },
    summaryValue: { fontSize: 8.5 },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
        paddingTop: 5,
        borderTopWidth: 1,
        borderTopColor: BORDER,
    },
    totalLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
    totalValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: BRAND },
    empty: { fontSize: 8.5, color: MUTED, marginTop: 4 },
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

type ItemType = 'MANO_DE_OBRA' | 'REPUESTO' | 'TRABAJO_TERCERO';

const GROUPS: { type: ItemType; title: string; subtotal: string }[] = [
    { type: 'MANO_DE_OBRA', title: 'Mano de obra', subtotal: 'Subtotal mano de obra' },
    { type: 'REPUESTO', title: 'Repuestos', subtotal: 'Subtotal repuestos' },
    { type: 'TRABAJO_TERCERO', title: 'Trabajos de terceros', subtotal: 'Subtotal trabajos de terceros' },
];

export interface QuotePdfData {
    quoteNumber: number;
    createdAt: Date;
    validUntil: Date;
    logoSrc: string | null;
    customer: { name: string; phone: string | null; email: string | null };
    vehicle: { plate: string | null; description: string | null };
    description: string | null;
    notes: string | null;
    items: { type: ItemType; description: string; amount: number }[];
    totalsByType: Record<ItemType, number>;
    total: number;
}

const formatMoney = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);
const formatDate = (d: Date) => d.toLocaleDateString('es-AR');

function DataRow({ label, value }: { label: string; value: string | null }) {
    return (
        <View style={styles.dataRow}>
            <Text style={styles.label}>{label}:</Text>
            <Text style={styles.value}>{value || '—'}</Text>
        </View>
    );
}

export const QuotePdf = ({ data }: { data: QuotePdfData }) => (
    <Document title={`Presupuesto Nº ${data.quoteNumber}`}>
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <View style={styles.letterheadRow}>
                    {data.logoSrc ? <Image src={data.logoSrc} style={styles.letterhead} /> : <View style={styles.letterhead} />}
                    <View style={styles.workshopContact}>
                        <Text style={styles.workshopAddress}>{WORKSHOP_LETTERHEAD_CONTACT}</Text>
                    </View>
                </View>
                <View style={styles.headerRow}>
                    <View>
                        <Text style={styles.title}>PRESUPUESTO Nº {data.quoteNumber}</Text>
                        <Text style={styles.headerMeta}>Fecha: {formatDate(data.createdAt)}</Text>
                    </View>
                    <Text style={styles.validity}>Válido hasta {formatDate(data.validUntil)}</Text>
                </View>
            </View>

            <View style={styles.columnsRow}>
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Cliente</Text>
                    <DataRow label="Nombre" value={data.customer.name} />
                    <DataRow label="Teléfono" value={data.customer.phone} />
                    <DataRow label="Email" value={data.customer.email} />
                </View>
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Vehículo</Text>
                    <DataRow label="Dominio" value={data.vehicle.plate} />
                    <DataRow label="Marca/Modelo" value={data.vehicle.description} />
                </View>
            </View>

            {data.description && (
                <>
                    <Text style={styles.sectionTitle}>Trabajo consultado</Text>
                    <View style={styles.textBox}>
                        <Text style={styles.textBoxContent}>{data.description}</Text>
                    </View>
                </>
            )}

            <Text style={styles.sectionTitle}>Detalle</Text>
            {data.items.length === 0 && <Text style={styles.empty}>Sin ítems cargados.</Text>}
            {GROUPS.map((g) => {
                const groupItems = data.items.filter((i) => i.type === g.type);
                if (groupItems.length === 0) return null;
                return (
                    <View key={g.type} wrap={false}>
                        <View style={styles.groupHeader}>
                            <Text style={styles.groupTitle}>{g.title}</Text>
                        </View>
                        {groupItems.map((item, idx) => (
                            <View key={idx} style={styles.row}>
                                <Text style={styles.colDesc}>{item.description}</Text>
                                <Text style={styles.colAmount}>{formatMoney(item.amount)}</Text>
                            </View>
                        ))}
                        <View style={styles.subtotalRow}>
                            <Text style={styles.subtotalText}>
                                {g.subtotal}: {formatMoney(data.totalsByType[g.type])}
                            </Text>
                        </View>
                    </View>
                );
            })}

            <View style={styles.summary} wrap={false}>
                {GROUPS.map((g) => (
                    <View key={g.type} style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{g.title}</Text>
                        <Text style={styles.summaryValue}>{formatMoney(data.totalsByType[g.type])}</Text>
                    </View>
                ))}
                <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total</Text>
                    <Text style={styles.totalValue}>{formatMoney(data.total)}</Text>
                </View>
            </View>

            {data.notes && (
                <View style={{ marginTop: 12 }} wrap={false}>
                    <Text style={styles.sectionTitle}>Observaciones</Text>
                    <View style={styles.textBox}>
                        <Text style={styles.textBoxContent}>{data.notes}</Text>
                    </View>
                </View>
            )}

            <Text style={styles.footer} fixed>
                Presupuesto válido hasta el {formatDate(data.validUntil)}. Este documento no es una factura. Emitido por
                Nóbile — Servicios del automotor.
            </Text>
        </Page>
    </Document>
);
