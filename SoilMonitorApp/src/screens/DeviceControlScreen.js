// ─── DeviceControlScreen ──────────────────────────────────────────────────
// Remote control panel for the ESP32.
// Writes config to Firebase → ESP32 polls it every 15 s and applies changes.
// Works from any network — no same-WiFi requirement.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, ScrollView, Text, TextInput, TouchableOpacity,
  StyleSheet, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { useMqtt } from '../services/firebaseService';
import { COLORS, SIZES } from '../theme';

// ── Default config (mirrors ESP32 firmware defaults) ──────────────────────
const DEFAULT_CONFIG = {
  enableNPK:      true,
  enableTemp:     true,
  enableMoisture: true,
  enableMQTT:     false,   // Default: Direct Firebase — no laptop/broker needed
  sampleInterval: 30000,
  cusumK:         5.0,
  cusumH:         30.0,
  mqttBroker:     '10.150.195.29',
  resetCUSUM:     false,
};

// ── Interval presets ──────────────────────────────────────────────────────
const INTERVALS = [
  { label: '5 s',   value: 5000   },
  { label: '15 s',  value: 15000  },
  { label: '30 s',  value: 30000  },
  { label: '1 min', value: 60000  },
  { label: '5 min', value: 300000 },
];

// ── Reusable toggle row ───────────────────────────────────────────────────
const ToggleRow = ({ icon, label, desc, value, onToggle, color }) => (
  <View style={styles.toggleRow}>
    <View style={styles.toggleLeft}>
      <View style={[styles.toggleIconWrap, { backgroundColor: (color || COLORS.accent) + '18' }]}>
        <Text style={styles.toggleIcon}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDesc}>{desc}</Text>
      </View>
    </View>
    <Switch
      value={value}
      onValueChange={onToggle}
      trackColor={{ false: COLORS.surface, true: (color || COLORS.accent) + '55' }}
      thumbColor={value ? (color || COLORS.accent) : COLORS.textMuted}
      ios_backgroundColor={COLORS.surface}
    />
  </View>
);

// ── Main screen ───────────────────────────────────────────────────────────
const DeviceControlScreen = () => {
  const { deviceConfig, writeConfig, latestReading } = useMqtt();
  const [config, setConfig]       = useState({ ...DEFAULT_CONFIG });
  const [saving, setSaving]       = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  // Sync local state when Firebase config updates
  useEffect(() => {
    if (deviceConfig) {
      setConfig(prev => ({
        ...prev,
        ...deviceConfig,
        resetCUSUM: false, // never inherit the one-shot flag
      }));
    }
  }, [deviceConfig]);

  const updateField = useCallback((key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleApply = async () => {
    setSaving(true);
    const result = await writeConfig(config);
    setSaving(false);
    if (result.success) {
      setLastSaved(new Date().toLocaleTimeString());
      Alert.alert(
        '✅ Config Sent',
        'ESP32 will apply this config within 15 seconds (next poll cycle).',
      );
    } else {
      Alert.alert('❌ Error', result.error ?? 'Could not write to Firebase.');
    }
  };

  const handleResetCUSUM = () => {
    Alert.alert(
      'Reset CUSUM?',
      'This will clear the drift detection score and restart baseline calibration on the ESP32.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset', style: 'destructive',
          onPress: async () => {
            setSaving(true);
            const result = await writeConfig({ ...config, resetCUSUM: true });
            setSaving(false);
            if (result.success) {
              Alert.alert('✅ CUSUM Reset', 'ESP32 will reset drift score on next poll.');
            } else {
              Alert.alert('❌ Error', result.error ?? 'Unknown error');
            }
          },
        },
      ],
    );
  };

  // Live ESP config echoed back in readings
  const liveConfig = latestReading?.cfg;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.header}>🎛️ Device Control</Text>
      <Text style={styles.subtitle}>
        Config is sent via Firebase → ESP32 polls every 15 s.{'\n'}
        Works from any network.
      </Text>

      {/* ── Live Status Card ──────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>📡 ESP32 Active Config</Text>
        <Text style={styles.liveHint}>
          {liveConfig
            ? 'Confirmed from last MQTT reading'
            : 'Waiting for next reading to confirm…'}
        </Text>
        {liveConfig ? (
          <View style={styles.liveGrid}>
            {[
              { k: 'enableNPK',      label: 'NPK'      },
              { k: 'enableTemp',     label: 'Temp'     },
              { k: 'enableMoisture', label: 'Moisture' },
              { k: 'enableMQTT',     label: 'MQTT'     },
            ].map(({ k, label }) => (
              <View key={k} style={styles.liveCell}>
                <Text style={styles.liveCellLabel}>{label}</Text>
                <Text style={[styles.liveCellValue,
                  { color: liveConfig[k] ? COLORS.connected : COLORS.disconnected }]}>
                  {liveConfig[k] ? '● ON' : '○ OFF'}
                </Text>
              </View>
            ))}
            <View style={styles.liveCell}>
              <Text style={styles.liveCellLabel}>Interval</Text>
              <Text style={styles.liveCellValue}>
                {((liveConfig.sampleInterval ?? 30000) / 1000).toFixed(0)} s
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.liveEmpty}>
            <Text style={styles.liveEmptyText}>No confirmation yet</Text>
          </View>
        )}
        {lastSaved && (
          <Text style={styles.lastSaved}>Last sent: {lastSaved}</Text>
        )}
      </View>

      {/* ── Pipeline Mode ─────────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>🔀 Data Pipeline</Text>
        <ToggleRow
          icon="📡"
          label="MQTT Pipeline"
          desc={config.enableMQTT
            ? 'ESP32 → Mosquitto → Node-RED → Firebase'
            : 'ESP32 → Firebase directly (no laptop needed)'}
          value={config.enableMQTT}
          onToggle={v => updateField('enableMQTT', v)}
          color={config.enableMQTT ? '#f59e0b' : COLORS.accent}
        />
        {/* Visual pipeline badge */}
        <View style={[
          styles.pipelineBadge,
          { backgroundColor: config.enableMQTT ? '#f59e0b18' : COLORS.accent + '18',
            borderColor:      config.enableMQTT ? '#f59e0b44' : COLORS.accent + '44' },
        ]}>
          <Text style={[styles.pipelineBadgeText,
            { color: config.enableMQTT ? '#f59e0b' : COLORS.accent }]}>
            {config.enableMQTT
              ? '⚡ MQTT mode — Mosquitto broker + Node-RED + same-WiFi required'
              : '🌐 Direct mode — only internet needed, no broker, no laptop'}
          </Text>
        </View>
      </View>

      {/* ── Sensor Toggles ────────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>🔬 Sensor Enables</Text>
        <ToggleRow
          icon="🌿"
          label="NPK Sensor"
          desc="Modbus RS485 — Nitrogen, Phosphorus, Potassium"
          value={config.enableNPK}
          onToggle={v => updateField('enableNPK', v)}
          color={COLORS.nitrogen}
        />
        <View style={styles.divider} />
        <ToggleRow
          icon="🌡️"
          label="Temperature Sensor"
          desc="DS18B20 one-wire temperature probe"
          value={config.enableTemp}
          onToggle={v => updateField('enableTemp', v)}
          color={COLORS.temperature}
        />
        <View style={styles.divider} />
        <ToggleRow
          icon="💧"
          label="Moisture Sensor"
          desc="Capacitive ADC moisture — pin 34"
          value={config.enableMoisture}
          onToggle={v => updateField('enableMoisture', v)}
          color={COLORS.moisture}
        />
      </View>

      {/* ── Sample Interval ───────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>⏱️ Sample Interval</Text>
        <View style={styles.presetRow}>
          {INTERVALS.map(({ label, value }) => (
            <TouchableOpacity
              key={value}
              style={[
                styles.presetBtn,
                config.sampleInterval === value && styles.presetBtnActive,
              ]}
              onPress={() => updateField('sampleInterval', value)}
            >
              <Text style={[
                styles.presetBtnText,
                config.sampleInterval === value && styles.presetBtnTextActive,
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>Custom (ms)</Text>
          <TextInput
            style={styles.numberInput}
            value={String(config.sampleInterval)}
            onChangeText={v => {
              const n = parseInt(v, 10);
              if (!isNaN(n) && n >= 3000) updateField('sampleInterval', n);
            }}
            keyboardType="number-pad"
            placeholderTextColor={COLORS.textMuted}
          />
        </View>
        <Text style={styles.hint}>Minimum 3000 ms (3 seconds)</Text>
      </View>

      {/* ── CUSUM Parameters ──────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>📉 CUSUM Drift Detection</Text>

        <View style={styles.inputRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>K — Slack parameter</Text>
            <Text style={styles.hint}>Allowable variation before accumulation</Text>
          </View>
          <TextInput
            style={styles.numberInput}
            value={String(config.cusumK)}
            onChangeText={v => {
              const n = parseFloat(v);
              if (!isNaN(n) && n > 0) updateField('cusumK', n);
            }}
            keyboardType="decimal-pad"
            placeholderTextColor={COLORS.textMuted}
          />
        </View>

        <View style={[styles.inputRow, { marginTop: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>H — Threshold parameter</Text>
            <Text style={styles.hint}>CUSUM score above this triggers drift alert</Text>
          </View>
          <TextInput
            style={styles.numberInput}
            value={String(config.cusumH)}
            onChangeText={v => {
              const n = parseFloat(v);
              if (!isNaN(n) && n > 0) updateField('cusumH', n);
            }}
            keyboardType="decimal-pad"
            placeholderTextColor={COLORS.textMuted}
          />
        </View>

        <TouchableOpacity style={styles.resetBtn} onPress={handleResetCUSUM}>
          <Text style={styles.resetBtnText}>🔄 Reset CUSUM Score to Zero</Text>
        </TouchableOpacity>
      </View>

      {/* ── MQTT Broker IP — only shown when MQTT pipeline is ON ────── */}
      {config.enableMQTT && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>🔌 MQTT Broker IP</Text>
          <Text style={styles.hint}>
            Laptop IP on the shared hotspot. Run{' '}
            <Text style={{ color: '#f59e0b' }}>ipconfig</Text> on the laptop to find it.
          </Text>
          <TextInput
            style={[styles.numberInput, { width: '100%', marginTop: 10, textAlign: 'left' }]}
            value={config.mqttBroker}
            onChangeText={v => updateField('mqttBroker', v)}
            placeholder="e.g. 192.168.1.42"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="decimal-pad"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      )}

      {/* ── Apply Button ──────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.applyBtn, saving && styles.applyBtnDisabled]}
        onPress={handleApply}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.applyBtnText}>✅ Apply Config to ESP32</Text>
        }
      </TouchableOpacity>

      <Text style={styles.footerNote}>
        Changes reach the ESP32 within 15 seconds via Firebase polling.{'\n'}
        ESP32 also saves config to flash — persists across reboots.
      </Text>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────
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
    marginBottom: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: SIZES.sm,
    lineHeight: 18,
    marginBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: SIZES.cardPadding,
    marginBottom: 12,
  },
  sectionLabel: {
    color: COLORS.textSecondary,
    fontSize: SIZES.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: '700',
    marginBottom: 12,
  },
  // ── Live status ─────────────────────────────────────────────────────
  liveHint: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    marginBottom: 10,
  },
  liveGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  liveCell: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  liveCellLabel: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    marginBottom: 3,
  },
  liveCellValue: {
    color: COLORS.textPrimary,
    fontSize: SIZES.sm,
    fontWeight: '700',
  },
  liveEmpty: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  liveEmptyText: {
    color: COLORS.textMuted,
    fontSize: SIZES.sm,
  },
  lastSaved: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    marginTop: 10,
    textAlign: 'right',
  },
  // ── Toggle rows ─────────────────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
    marginRight: 12,
  },
  toggleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleIcon: {
    fontSize: 18,
  },
  toggleLabel: {
    color: COLORS.textPrimary,
    fontSize: SIZES.md,
    fontWeight: '600',
  },
  toggleDesc: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.surface,
    marginVertical: 2,
  },
  // ── Interval presets ────────────────────────────────────────────────
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  presetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  presetBtnActive: {
    backgroundColor: COLORS.accent + '22',
    borderColor: COLORS.accent,
  },
  presetBtnText: {
    color: COLORS.textSecondary,
    fontSize: SIZES.sm,
    fontWeight: '500',
  },
  presetBtnTextActive: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  // ── Inputs ──────────────────────────────────────────────────────────
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inputLabel: {
    color: COLORS.textSecondary,
    fontSize: SIZES.sm,
    fontWeight: '600',
  },
  numberInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: COLORS.textPrimary,
    fontSize: SIZES.md,
    fontWeight: '600',
    width: 100,
    textAlign: 'right',
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    marginTop: 4,
    lineHeight: 16,
  },
  // ── Pipeline badge ───────────────────────────────────────────────────
  pipelineBadge: {
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  pipelineBadgeText: {
    fontSize: SIZES.xs,
    fontWeight: '600',
    lineHeight: 16,
  },
  // ── CUSUM reset ──────────────────────────────────────────────────────
  resetBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cusumThreshold,
    backgroundColor: COLORS.cusumThreshold + '12',
    alignItems: 'center',
  },
  resetBtnText: {
    color: COLORS.cusumThreshold,
    fontSize: SIZES.md,
    fontWeight: '600',
  },
  // ── Apply button ────────────────────────────────────────────────────
  applyBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: SIZES.radius,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  applyBtnDisabled: {
    opacity: 0.6,
  },
  applyBtnText: {
    color: '#ffffff',
    fontSize: SIZES.lg,
    fontWeight: '800',
  },
  footerNote: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default DeviceControlScreen;
