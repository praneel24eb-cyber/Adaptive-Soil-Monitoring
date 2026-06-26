// ─── Dashboard Screen ─────────────────────────────────────────────────
// Main home screen showing live sensor readings, NPK gauges, CUSUM,
// Soil Health Score, and a Today's Summary card.

import React, { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, Text, StyleSheet, RefreshControl } from 'react-native';
import { useMqtt } from '../services/mqtt';
import StatusCard from '../components/StatusCard';
import NPKGauge from '../components/NPKGauge';
import SensorCard from '../components/SensorCard';
import CusumMini from '../components/CusumMini';
import SoilHealthScore from '../components/SoilHealthScore';
import { COLORS, SIZES } from '../theme';

// ── SessionSummary ────────────────────────────────────────────────────────
const stat = (arr) => {
  const nums = arr.filter(v => v !== null && v !== undefined && !isNaN(Number(v))).map(Number);
  if (nums.length === 0) return { min: '—', max: '—', avg: '—' };
  return {
    min: Math.min(...nums).toFixed(1),
    max: Math.max(...nums).toFixed(1),
    avg: (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1),
  };
};

const SUMMARY_SENSORS = [
  { key: 'N',        label: 'N',    unit: 'mg/kg', color: COLORS.nitrogen    },
  { key: 'P',        label: 'P',    unit: 'mg/kg', color: COLORS.phosphorus  },
  { key: 'K',        label: 'K',    unit: 'mg/kg', color: COLORS.potassium   },
  { key: 'moisture', label: '💧',   unit: '%',     color: COLORS.moisture    },
  { key: 'temp',     label: '🌡',   unit: '°C',    color: COLORS.temperature },
];

const SessionSummary = ({ history }) => {
  const stats = useMemo(() =>
    SUMMARY_SENSORS.reduce((acc, s) => {
      acc[s.key] = stat(history.map(r => r[s.key]));
      return acc;
    }, {}),
    [history],
  );

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.sectionTitle}>📅 Today's Summary</Text>
      <Text style={styles.summaryCount}>{history.length} readings this session</Text>
      <View style={styles.summaryHeader}>
        <Text style={[styles.summaryCol, styles.summaryColLabel]} />
        <Text style={styles.summaryCol}>Min</Text>
        <Text style={styles.summaryCol}>Avg</Text>
        <Text style={styles.summaryCol}>Max</Text>
      </View>
      {SUMMARY_SENSORS.map(s => (
        <View key={s.key} style={styles.summaryRow}>
          <View style={styles.summaryColLabel}>
            <Text style={[styles.summaryLabel, { color: s.color }]}>{s.label}</Text>
            <Text style={styles.summaryUnit}>{s.unit}</Text>
          </View>
          <Text style={styles.summaryCol}>{stats[s.key].min}</Text>
          <Text style={[styles.summaryCol, { color: COLORS.textPrimary, fontWeight: '700' }]}>
            {stats[s.key].avg}
          </Text>
          <Text style={styles.summaryCol}>{stats[s.key].max}</Text>
        </View>
      ))}
    </View>
  );
};

// ── Dashboard Screen ──────────────────────────────────────────────────────
const DashboardScreen = () => {
  const { status, latestReading, history, connect } = useMqtt();
  const [now, setNow] = useState(Date.now());

  // Tick every second to update "X seconds ago"
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const r = latestReading;
  const isConnected = status === 'connected';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={connect}
          tintColor={COLORS.accent}
        />
      }
    >
      {/* Header */}
      <Text style={styles.header}>🌱 Soil Monitor</Text>

      {/* Status Card */}
      <StatusCard
        className={r?.class}
        connected={isConnected}
        lastUpdated={r?.receivedAt}
      />

      {/* Soil Health Score */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Soil Health</Text>
      </View>
      <SoilHealthScore reading={r} />

      {/* NPK Gauges */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>NPK Levels</Text>
      </View>
      <View style={styles.gaugeRow}>
        <NPKGauge
          label="Nitrogen"
          value={r?.N}
          maxValue={1000}
          color={COLORS.nitrogen}
        />
        <NPKGauge
          label="Phosphorus"
          value={r?.P}
          maxValue={1000}
          color={COLORS.phosphorus}
        />
        <NPKGauge
          label="Potassium"
          value={r?.K}
          maxValue={1000}
          color={COLORS.potassium}
        />
      </View>

      {/* Moisture & Temperature */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Environment</Text>
      </View>
      <View style={styles.sensorRow}>
        <SensorCard
          label="Moisture"
          value={r?.moisture}
          unit="%"
          icon="💧"
          color={COLORS.moisture}
        />
        <SensorCard
          label="Temperature"
          value={r?.temp}
          unit="°C"
          icon="🌡️"
          color={COLORS.temperature}
        />
      </View>

      {/* CUSUM */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Drift Detection</Text>
      </View>
      <CusumMini
        history={history}
        currentDrift={r?.drift === true || r?.drift === 1}
      />

      {/* Today's Summary */}
      {history.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Session Summary</Text>
          </View>
          <SessionSummary history={history} />
        </>
      )}

      {/* Footer spacer */}
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
    marginBottom: 20,
  },
  sectionHeader: {
    marginTop: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: SIZES.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  gaugeRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SIZES.cardPadding,
    marginBottom: 12,
  },
  sensorRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  // ── Summary card ─────────────────────────────────────────────────────
  summaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SIZES.cardPadding,
    marginBottom: 12,
  },
  summaryCount: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    marginBottom: 12,
    marginTop: 2,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
  },
  summaryColLabel: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flex: 1.5,
    gap: 4,
  },
  summaryLabel: {
    fontSize: SIZES.sm,
    fontWeight: '700',
  },
  summaryUnit: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs - 1,
  },
  summaryCol: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: SIZES.sm,
    textAlign: 'right',
    fontWeight: '500',
  },
});

export default DashboardScreen;
