// ─── SensorCard ───────────────────────────────────────────────────────
// Compact card showing a single sensor value with an icon.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../theme';

const SensorCard = ({ label, value, unit, icon, color }) => {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={[styles.icon, { color }]}>{icon}</Text>
        <View style={styles.textCol}>
          <Text style={styles.label}>{label}</Text>
          <View style={styles.valueRow}>
            <Text style={[styles.value, { color }]}>
              {value != null ? (typeof value === 'number' ? value.toFixed(1) : value) : '—'}
            </Text>
            <Text style={styles.unit}>{unit}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 14,
    flex: 1,
    marginHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 26,
    marginRight: 10,
  },
  textCol: {
    flex: 1,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: SIZES.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 2,
  },
  value: {
    fontSize: SIZES.xl,
    fontWeight: '700',
  },
  unit: {
    color: COLORS.textMuted,
    fontSize: SIZES.sm,
    marginLeft: 4,
  },
});

export default SensorCard;
