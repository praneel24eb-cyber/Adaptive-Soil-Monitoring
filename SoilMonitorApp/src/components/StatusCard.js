// ─── StatusCard ───────────────────────────────────────────────────────
// Large card showing the current soil fertility classification.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SIZES, getClassColor } from '../theme';

const StatusCard = ({ className, connected, lastUpdated }) => {
  const classColor = getClassColor(className);
  const displayClass = className || '—';
  const timeSince = lastUpdated
    ? `${Math.round((Date.now() - lastUpdated.getTime()) / 1000)}s ago`
    : 'Waiting for data…';

  return (
    <View style={[styles.card, { borderColor: classColor + '40' }]}>
      {/* Connection indicator */}
      <View style={styles.statusRow}>
        <View style={[styles.dot, {
          backgroundColor: connected ? COLORS.connected : COLORS.disconnected
        }]} />
        <Text style={styles.statusText}>
          {connected ? 'Live' : 'Disconnected'}
        </Text>
        <Text style={styles.timeText}>{timeSince}</Text>
      </View>

      {/* Class label */}
      <Text style={styles.label}>Soil Fertility</Text>
      <Text style={[styles.className, { color: classColor }]}>{displayClass}</Text>

      {/* Subtle glow bar */}
      <View style={[styles.glowBar, { backgroundColor: classColor }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    padding: SIZES.cardPadding,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: COLORS.textSecondary,
    fontSize: SIZES.sm,
    flex: 1,
  },
  timeText: {
    color: COLORS.textMuted,
    fontSize: SIZES.sm,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: SIZES.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  className: {
    fontSize: SIZES.title,
    fontWeight: '800',
  },
  glowBar: {
    height: 3,
    borderRadius: 2,
    marginTop: 14,
    opacity: 0.6,
  },
});

export default StatusCard;
