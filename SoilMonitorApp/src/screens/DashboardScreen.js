// ─── Dashboard Screen ─────────────────────────────────────────────────
// Main home screen showing live sensor readings, NPK gauges, and CUSUM.

import React, { useState, useEffect } from 'react';
import { View, ScrollView, Text, StyleSheet, RefreshControl } from 'react-native';
import { useMqtt } from '../services/mqtt';
import StatusCard from '../components/StatusCard';
import NPKGauge from '../components/NPKGauge';
import SensorCard from '../components/SensorCard';
import CusumMini from '../components/CusumMini';
import { COLORS, SIZES } from '../theme';

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
});

export default DashboardScreen;
