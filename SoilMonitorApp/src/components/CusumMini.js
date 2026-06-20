// ─── CusumMini ────────────────────────────────────────────────────────
// Small CUSUM trend sparkline with drift indicator.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Line } from 'react-native-svg';
import { COLORS, SIZES } from '../theme';

const CHART_W = 280;
const CHART_H = 50;
const THRESHOLD = 5;  // matches firmware H=5

const CusumMini = ({ history = [], currentDrift = false }) => {
  // Take last 30 CUSUM values
  const cusumValues = history.slice(-30).map(r => r.cusum || 0);

  // Build polyline points
  let points = '';
  if (cusumValues.length > 1) {
    const maxVal = Math.max(...cusumValues, THRESHOLD + 1);
    const step = CHART_W / (cusumValues.length - 1);
    points = cusumValues.map((v, i) => {
      const x = i * step;
      const y = CHART_H - (v / maxVal) * CHART_H;
      return `${x},${y}`;
    }).join(' ');
  }

  // Threshold Y position
  const maxVal = cusumValues.length > 0
    ? Math.max(...cusumValues, THRESHOLD + 1)
    : THRESHOLD + 1;
  const thresholdY = CHART_H - (THRESHOLD / maxVal) * CHART_H;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>CUSUM Score</Text>
        <View style={styles.driftBadge}>
          <View style={[styles.driftDot, {
            backgroundColor: currentDrift ? COLORS.cusumThreshold : COLORS.connected,
          }]} />
          <Text style={[styles.driftText, {
            color: currentDrift ? COLORS.cusumThreshold : COLORS.connected,
          }]}>
            {currentDrift ? 'DRIFT' : 'Normal'}
          </Text>
        </View>
      </View>

      {cusumValues.length > 1 ? (
        <Svg width={CHART_W} height={CHART_H} style={styles.chart}>
          {/* Threshold line */}
          <Line
            x1={0} y1={thresholdY}
            x2={CHART_W} y2={thresholdY}
            stroke={COLORS.cusumThreshold}
            strokeWidth={1}
            strokeDasharray="4,4"
            opacity={0.6}
          />
          {/* CUSUM line */}
          <Polyline
            points={points}
            fill="none"
            stroke={COLORS.cusumLine}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </Svg>
      ) : (
        <View style={[styles.chart, styles.placeholder]}>
          <Text style={styles.placeholderText}>Collecting data…</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SIZES.cardPadding,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: SIZES.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  driftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driftDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  driftText: {
    fontSize: SIZES.sm,
    fontWeight: '600',
  },
  chart: {
    alignSelf: 'center',
  },
  placeholder: {
    height: CHART_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: COLORS.textMuted,
    fontSize: SIZES.sm,
  },
});

export default CusumMini;
