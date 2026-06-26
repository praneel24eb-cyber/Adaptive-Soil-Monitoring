// ─── Alerts Screen ────────────────────────────────────────────────────
// Displays a scrollable log of drift alerts detected by CUSUM.

import React from 'react';
import { View, ScrollView, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useMqtt } from '../services/mqtt';
import { COLORS, SIZES, getClassColor } from '../theme';

const AlertItem = ({ alert }) => {
  const time = alert.receivedAt
    ? new Date(alert.receivedAt).toLocaleTimeString()
    : '—';
  const date = alert.receivedAt
    ? new Date(alert.receivedAt).toLocaleDateString()
    : '';

  const isThreshold = alert.type === 'threshold';
  const badgeColor  = isThreshold ? COLORS.depleted : COLORS.cusumThreshold;
  const badgeText   = isThreshold ? '🚨 THRESHOLD' : '⚠️ DRIFT';
  const cardBorder  = isThreshold ? COLORS.depleted  : COLORS.cusumThreshold;

  return (
    <View style={[styles.alertCard, { borderLeftColor: cardBorder, borderColor: cardBorder + '30' }]}>
      <View style={styles.alertHeader}>
        <View style={[styles.alertBadge, { backgroundColor: badgeColor + '20' }]}>
          <Text style={[styles.alertBadgeText, { color: badgeColor }]}>{badgeText}</Text>
        </View>
        <Text style={styles.alertTime}>{time}</Text>
      </View>
      <Text style={styles.alertDate}>{date}</Text>
      <Text style={styles.alertMessage}>{alert.message}</Text>
      <View style={styles.alertDetails}>
        {!isThreshold && (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>CUSUM</Text>
            <Text style={[styles.detailValue, { color: COLORS.cusumLine }]}>
              {alert.cusum?.toFixed(2) || '—'}
            </Text>
          </View>
        )}
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Class</Text>
          <Text style={[styles.detailValue, { color: getClassColor(alert.class) }]}>
            {alert.class || '—'}
          </Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>N / P / K</Text>
          <Text style={styles.detailValue}>
            {alert.N || '—'} / {alert.P || '—'} / {alert.K || '—'}
          </Text>
        </View>
      </View>
    </View>
  );
};

const AlertsScreen = () => {
  const { alerts, clearHistory } = useMqtt();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>🚨 Alerts</Text>
        {alerts.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={clearHistory}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {alerts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyTitle}>No Alerts</Text>
          <Text style={styles.emptySubtitle}>
            Drift alerts will appear here when the CUSUM score exceeds the threshold.
          </Text>
        </View>
      ) : (
        <>
          <Text style={styles.countText}>{alerts.length} alert{alerts.length !== 1 ? 's' : ''}</Text>
          {alerts.map((alert, index) => (
            <AlertItem key={index} alert={alert} />
          ))}
        </>
      )}

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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  header: {
    color: COLORS.textPrimary,
    fontSize: SIZES.xxl,
    fontWeight: '800',
  },
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  clearText: {
    color: COLORS.textSecondary,
    fontSize: SIZES.sm,
  },
  countText: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: SIZES.xl,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: COLORS.textSecondary,
    fontSize: SIZES.md,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 40,
  },
  alertCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.cusumThreshold + '30',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.cusumThreshold,
    padding: SIZES.cardPadding,
    marginBottom: 10,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertBadge: {
    backgroundColor: COLORS.cusumThreshold + '20',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  alertBadgeText: {
    color: COLORS.cusumThreshold,
    fontSize: SIZES.xs,
    fontWeight: '700',
  },
  alertTime: {
    color: COLORS.textSecondary,
    fontSize: SIZES.sm,
  },
  alertDate: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    marginTop: 4,
  },
  alertMessage: {
    color: COLORS.textPrimary,
    fontSize: SIZES.md,
    marginTop: 8,
    fontWeight: '500',
  },
  alertDetails: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 16,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    color: COLORS.textPrimary,
    fontSize: SIZES.md,
    fontWeight: '600',
    marginTop: 2,
  },
});

export default AlertsScreen;
