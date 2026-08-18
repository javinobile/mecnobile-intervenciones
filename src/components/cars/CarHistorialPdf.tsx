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
        paddingBottom: 36,
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
    title: {
        fontSize: 14,
        color: BRAND,
        fontFamily: 'Helvetica-Bold',
    },
    headerMeta: {
        fontSize: 8,
        color: MUTED,
        marginTop: 2,
    },
    columnsRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 12,
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
        marginBottom: 3,
    },
    label: {
        width: 72,
        color: MUTED,
        fontSize: 8,
    },
    value: {
        flex: 1,
        fontSize: 8,
        fontFamily: 'Helvetica-Bold',
    },
    sectionTitle: {
        fontSize: 10,
        color: BRAND,
        fontFamily: 'Helvetica-Bold',
        marginTop: 8,
        marginBottom: 6,
        textTransform: 'uppercase',
    },
    otBlock: {
        borderWidth: 1,
        borderColor: BORDER,
        borderRadius: 4,
        padding: 8,
        marginBottom: 8,
    },
    otHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    otTitle: {
        fontFamily: 'Helvetica-Bold',
        fontSize: 10,
        color: BRAND,
    },
    otMeta: {
        fontSize: 8,
        color: MUTED,
    },
    badge: {
        fontSize: 7,
        color: BRAND,
        backgroundColor: BRAND_SOFT,
        borderRadius: 3,
        paddingVertical: 2,
        paddingHorizontal: 5,
        fontFamily: 'Helvetica-Bold',
    },
    itemLine: {
        fontSize: 8,
        marginTop: 2,
        color: TEXT,
    },
    footer: {
        position: 'absolute',
        bottom: 18,
        left: 28,
        right: 28,
        fontSize: 7,
        color: MUTED,
        borderTopWidth: 1,
        borderTopColor: BORDER,
        paddingTop: 6,
    },
    empty: {
        fontSize: 9,
        color: MUTED,
        fontStyle: 'italic',
    },
});

const typeLabels: Record<string, string> = {
    REPUESTO: 'Repuesto',
    MANO_DE_OBRA: 'Mano de obra',
    TRABAJO_TERCERO: 'Trabajo de tercero',
};

export type CarHistoryPdfOt = {
    otNumber: number;
    status: string;
    date: Date;
    mileageKm: number;
    description: string;
    notes: string | null;
    items: { type: string; description: string }[];
};

export type CarHistoryPdfData = {
    logoSrc: string | null;
    emittedAt: Date;
    car: {
        licensePlate: string;
        make: string | null;
        model: string | null;
        year: number | null;
        vin: string;
        color: string | null;
        engineNumber: string | null;
    };
    owner: { name: string; dni: string | null } | null;
    interventions: CarHistoryPdfOt[];
};

export const CarHistorialPdf = ({ data }: { data: CarHistoryPdfData }) => (
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
                <Text style={styles.title}>HISTORIAL DEL VEHÍCULO</Text>
                <Text style={styles.headerMeta}>
                    Emitido por Nóbile · {data.emittedAt.toLocaleDateString('es-AR')}{' '}
                    {data.emittedAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>

            <View style={styles.columnsRow}>
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Vehículo</Text>
                    <View style={styles.dataRow}>
                        <Text style={styles.label}>Dominio:</Text>
                        <Text style={styles.value}>{data.car.licensePlate}</Text>
                    </View>
                    <View style={styles.dataRow}>
                        <Text style={styles.label}>Marca/Modelo:</Text>
                        <Text style={styles.value}>
                            {[data.car.make, data.car.model].filter(Boolean).join(' ') || 'N/A'}
                            {data.car.year ? ` (${data.car.year})` : ''}
                        </Text>
                    </View>
                    <View style={styles.dataRow}>
                        <Text style={styles.label}>VIN:</Text>
                        <Text style={styles.value}>{data.car.vin}</Text>
                    </View>
                    {data.car.engineNumber ? (
                        <View style={styles.dataRow}>
                            <Text style={styles.label}>Motor:</Text>
                            <Text style={styles.value}>{data.car.engineNumber}</Text>
                        </View>
                    ) : null}
                    {data.car.color ? (
                        <View style={styles.dataRow}>
                            <Text style={styles.label}>Color:</Text>
                            <Text style={styles.value}>{data.car.color}</Text>
                        </View>
                    ) : null}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Propietario actual</Text>
                    <View style={styles.dataRow}>
                        <Text style={styles.label}>Nombre:</Text>
                        <Text style={styles.value}>{data.owner?.name || 'N/A'}</Text>
                    </View>
                    <View style={styles.dataRow}>
                        <Text style={styles.label}>DNI/CUIT:</Text>
                        <Text style={styles.value}>{data.owner?.dni || 'N/A'}</Text>
                    </View>
                </View>
            </View>

            <Text style={styles.sectionTitle}>
                Intervenciones en taller ({data.interventions.length})
            </Text>

            {data.interventions.length === 0 ? (
                <Text style={styles.empty}>Sin órdenes de trabajo registradas.</Text>
            ) : (
                data.interventions.map((ot) => (
                    <View key={ot.otNumber} style={styles.otBlock} wrap={false}>
                        <View style={styles.otHeader}>
                            <Text style={styles.otTitle}>OT #{ot.otNumber}</Text>
                            <Text style={styles.badge}>{ot.status}</Text>
                        </View>
                        <Text style={styles.otMeta}>
                            {ot.date.toLocaleDateString('es-AR')} · {ot.mileageKm.toLocaleString('es-AR')} km
                        </Text>
                        <Text style={styles.itemLine}>Motivo: {ot.description}</Text>
                        {ot.notes ? <Text style={styles.itemLine}>Notas: {ot.notes}</Text> : null}
                        {ot.items.map((item, idx) => (
                            <Text key={idx} style={styles.itemLine}>
                                • {typeLabels[item.type] || item.type}: {item.description}
                            </Text>
                        ))}
                    </View>
                ))
            )}

            <Text style={styles.footer}>
                Documento informativo emitido por Nóbile — Servicios del automotor.
                No incluye importes. {WORKSHOP_LETTERHEAD_CONTACT}
            </Text>
        </Page>
    </Document>
);
