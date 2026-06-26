// ─── Trends Screen ────────────────────────────────────────────────────
// Historical line charts for NPK, Moisture, and Temperature.
// Uses simple SVG polylines — no heavy chart library needed.

import React, { useState } from 'react';
import { View, ScrollView, Text, TouchableOpacity, StyleSheet, Dimensions, Alert } from 'react-native';
import Svg, { Polyline, Line, Text as SvgText } from 'react-native-svg';
import { useMqtt } from '../services/mqtt';
import { exportPDFReport } from '../utils/exportReport';
import { COLORS, SIZES } from '../theme';

const SCREEN_W = Dimensions.get('window').width - 64;
const CHART_H  = 120;

// ─── MiniChart component ─────────────────────────────────────────────
const MiniChart = ({ data, color, label, unit, maxOverride }) => {
  if (data.length < 2) {
    return (
      <View style={styles.chartCard}>
        <Text style={styles.chartLabel}>{label}</Text>
        <View style={[styles.chartArea, styles.placeholder]}>
          <Text style={styles.placeholderText}>Need more data…</Text>
        </View>
      </View>
    );
  }

  const values = data.map(v => (typeof v === 'number' ? v : 0));
  const minVal = Math.min(...values);
  const maxVal = maxOverride || Math.max(...values, 1);
  const range  = maxVal - minVal || 1;

  const step = SCREEN_W / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = CHART_H - ((v - minVal) / range) * (CHART_H - 10) - 5;
    return `${x},${y}`;
  }).join(' ');

  const latestVal = values[values.length - 1];

  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartLabel}>{label}</Text>
        <Text style={[styles.chartValue, { color }]}>
          {latestVal.toFixed(1)} {unit}
        </Text>
      </View>
      <Svg width={SCREEN_W} height={CHART_H}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
          const y = 5 + frac * (CHART_H - 10);
          return (
            <Line key={i}
              x1={0} y1={y} x2={SCREEN_W} y2={y}
              stroke={COLORS.surface} strokeWidth={1}
            />
          );
        })}
        {/* Data line */}
        <Polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {/* Y-axis labels */}
        <SvgText x={2} y={12} fontSize={9} fill={COLORS.textMuted}>
          {maxVal.toFixed(0)}
        </SvgText>
        <SvgText x={2} y={CHART_H - 2} fontSize={9} fill={COLORS.textMuted}>
          {minVal.toFixed(0)}
        </SvgText>
      </Svg>
    </View>
  );
};

// ─── Trends Screen ────────────────────────────────────────────────────
const TrendsScreen = () => {
  const { history, alerts, latestReading } = useMqtt();
  const [range, setRange] = useState(50); // last N readings
  const [exporting, setExporting] = useState(false);

  const sliced = history.slice(-range);

  const handleExport = async () => {
    if (history.length === 0) {
      Alert.alert('No data', 'No readings available to export yet.');
      return;
    }
    setExporting(true);
    const result = await exportPDFReport({ history, alerts, latestReading });
    setExporting(false);
    if (!result.success) {
      Alert.alert('Export failed', result.error ?? 'Unknown error');
    }
  };

  const ranges = [
    { label: 'Last 30', value: 30 },
    { label: 'Last 50', value: 50 },
    { label: 'Last 100', value: 100 },
    { label: 'All', value: 999 },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>📈 Trends</Text>
        <TouchableOpacity
          style={[styles.exportBtn, exporting && { opacity: 0.5 }]}
          onPress={handleExport}
          disabled={exporting}
        >
          <Text style={styles.exportBtnText}>{exporting ? '⏳ Exporting…' : '📤 Export PDF'}</Text>
        </TouchableOpacity>
      </View>

      {/* Range selector */}
      <View style={styles.rangeRow}>
        {ranges.map(r => (
          <TouchableOpacity
            key={r.value}
            style={[styles.rangeBtn, range === r.value && styles.rangeBtnActive]}
            onPress={() => setRange(r.value)}
          >
            <Text style={[styles.rangeBtnText, range === r.value && styles.rangeBtnTextActive]}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.dataCount}>{sliced.length} readings</Text>

      <MiniChart data={sliced.map(r => r.N)} color={COLORS.nitrogen}   label="Nitrogen (N)"   unit="mg/kg" />
      <MiniChart data={sliced.map(r => r.P)} color={COLORS.phosphorus} label="Phosphorus (P)" unit="mg/kg" />
      <MiniChart data={sliced.map(r => r.K)} color={COLORS.potassium}  label="Potassium (K)"  unit="mg/kg" />
      <MiniChart data={sliced.map(r => r.moisture)} color={COLORS.moisture}    label="Moisture" unit="%" />
      <MiniChart data={sliced.map(r => r.temp)}     color={COLORS.temperature} label="Temperature" unit="°C" />

      <View style={{ height: 30 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    padding: 16,
    paddingTop: 50,
  },
  header: {
    color: COLORS.textPrimary,
    fontSize: SIZES.xxl,
    fontWeight: '800',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  exportBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: COLORS.accent + '18',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  exportBtnText: {
    color: COLORS.accent,
    fontSize: SIZES.sm,
    fontWeight: '600',
  },
  rangeRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  rangeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  rangeBtnActive: {
    backgroundColor: COLORS.accent + '22',
    borderColor: COLORS.accent,
  },
  rangeBtnText: {
    color: COLORS.textSecondary,
    fontSize: SIZES.sm,
    fontWeight: '500',
  },
  rangeBtnTextActive: {
    color: COLORS.accent,
  },
  dataCount: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    marginBottom: 16,
  },
  chartCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SIZES.cardPadding,
    marginBottom: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  chartLabel: {
    color: COLORS.textSecondary,
    fontSize: SIZES.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  chartValue: {
    fontSize: SIZES.lg,
    fontWeight: '700',
  },
  chartArea: {
    height: CHART_H,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: COLORS.textMuted,
    fontSize: SIZES.sm,
  },
});

export default TrendsScreen;
