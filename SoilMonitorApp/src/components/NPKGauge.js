// ─── NPKGauge ────────────────────────────────────────────────────────
// Circular progress gauge for a single NPK value.
// Uses react-native-svg for the arc.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { COLORS, SIZES } from '../theme';

const GAUGE_SIZE  = 90;
const STROKE      = 6;
const RADIUS      = (GAUGE_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const NPKGauge = ({ label, value, maxValue = 1000, color, unit = 'mg/kg' }) => {
  const clamped  = Math.min(Math.max(value || 0, 0), maxValue);
  const progress = clamped / maxValue;
  const offset   = CIRCUMFERENCE * (1 - progress);

  return (
    <View style={styles.container}>
      <View style={styles.gaugeWrap}>
        <Svg width={GAUGE_SIZE} height={GAUGE_SIZE}>
          {/* Background circle */}
          <Circle
            cx={GAUGE_SIZE / 2}
            cy={GAUGE_SIZE / 2}
            r={RADIUS}
            stroke={COLORS.surface}
            strokeWidth={STROKE}
            fill="none"
          />
          {/* Progress arc */}
          <Circle
            cx={GAUGE_SIZE / 2}
            cy={GAUGE_SIZE / 2}
            r={RADIUS}
            stroke={color}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${GAUGE_SIZE / 2}, ${GAUGE_SIZE / 2}`}
          />
        </Svg>
        {/* Center value */}
        <View style={styles.valueWrap}>
          <Text style={[styles.value, { color }]}>{Math.round(clamped)}</Text>
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.unit}>{unit}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
  },
  gaugeWrap: {
    width: GAUGE_SIZE,
    height: GAUGE_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  valueWrap: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  value: {
    fontSize: SIZES.lg,
    fontWeight: '700',
  },
  label: {
    color: COLORS.textPrimary,
    fontSize: SIZES.md,
    fontWeight: '600',
    marginTop: 6,
  },
  unit: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    marginTop: 2,
  },
});

export default NPKGauge;
