// ─── Settings Screen ──────────────────────────────────────────────────────
// Shows Firebase connection status, session stats, Groq API key input,
// and app info. MQTT broker config removed — data now comes from Firebase.

import React, { useState, useEffect } from 'react';
import {
  View, ScrollView, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMqtt } from '../services/firebaseService';   // same hook, new source
import { COLORS, SIZES } from '../theme';
import { STORAGE_KEY_GROQ, STORAGE_KEY_THRESHOLDS, DEFAULT_THRESHOLDS } from '../constants';

const DB_URL = 'https://soil-monitoring-8b69c-default-rtdb.firebaseio.com';

const SettingsScreen = () => {
  const { status, history, alerts, latestReading, connect } = useMqtt();
  const [groqKey, setGroqKey] = useState('');
  const [thresholds, setThresholds] = useState({ ...DEFAULT_THRESHOLDS });

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_GROQ).then(k => {
      if (k) setGroqKey(k);
    });
    AsyncStorage.getItem(STORAGE_KEY_THRESHOLDS).then(t => {
      if (t) setThresholds({ ...DEFAULT_THRESHOLDS, ...JSON.parse(t) });
    });
  }, []);

  const handleSaveGroqKey = async () => {
    const trimmed = groqKey.trim();
    if (!trimmed) {
      Alert.alert('Error', 'API key cannot be empty.');
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEY_GROQ, trimmed);
    Alert.alert('Saved', 'Groq API key saved. Switch to the 🎙️ AI tab to use it.');
  };

  const handleSaveThresholds = async () => {
    await AsyncStorage.setItem(STORAGE_KEY_THRESHOLDS, JSON.stringify(thresholds));
    Alert.alert('Saved', 'Alert thresholds updated. New readings will be checked against these limits.');
  };

  const updateThreshold = (key, value) => {
    const num = parseFloat(value);
    setThresholds(prev => ({ ...prev, [key]: isNaN(num) ? prev[key] : num }));
  };

  const handleReconnect = () => {
    connect();
    Alert.alert('Reconnecting', 'Re-initializing Firebase listeners…');
  };

  // ── Status helpers ──────────────────────────────────────────────────────
  const statusColor = {
    connected:  COLORS.connected,
    connecting: COLORS.moderate,
    error:      COLORS.depleted,
  }[status] ?? COLORS.disconnected;

  const statusLabel = {
    connected:  '● Connected',
    connecting: '◌ Connecting…',
    error:      '✕ Error — tap Reconnect',
  }[status] ?? '○ Disconnected';

  const lastSeen = latestReading?.receivedAt
    ? new Date(latestReading.receivedAt).toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : '—';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.header}>⚙️ Settings</Text>

      {/* ── Firebase Status ───────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Firebase Realtime DB</Text>
        <Text style={[styles.statusText, { color: statusColor }]}>
          {statusLabel}
        </Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Database</Text>
          <Text style={styles.statValue} numberOfLines={1}>
            soil-monitoring-8b69c
          </Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Last reading</Text>
          <Text style={styles.statValue}>{lastSeen}</Text>
        </View>

        <TouchableOpacity
          style={styles.testBtn}
          onPress={handleReconnect}
        >
          <Text style={styles.testBtnText}>🔄  Reconnect Listeners</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.testBtn, { marginTop: 6 }]}
          onPress={() => Linking.openURL(
            `${DB_URL.replace('-default-rtdb.firebaseio.com', '')
              .replace('https://', 'https://console.firebase.google.com/project/')}` +
            `/database/soil-monitoring-8b69c-default-rtdb/data`
          )}
        >
          <Text style={styles.testBtnText}>🔗  Open Firebase Console</Text>
        </TouchableOpacity>
      </View>

      {/* ── Session Stats ─────────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Session Data</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Readings loaded</Text>
          <Text style={styles.statValue}>{history.length}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Alerts logged</Text>
          <Text style={styles.statValue}>{alerts.length}</Text>
        </View>
        {latestReading && (
          <>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Latest N / P / K</Text>
              <Text style={styles.statValue}>
                {latestReading.N} / {latestReading.P} / {latestReading.K} mg/kg
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Fertility</Text>
              <Text style={styles.statValue}>{latestReading.class ?? '—'}</Text>
            </View>
          </>
        )}
      </View>

      {/* ── Alert Thresholds ──────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>🔔 Alert Thresholds</Text>
        <Text style={[styles.hint, { marginBottom: 12 }]}>
          Alerts fire when sensor values breach these limits.
        </Text>

        {[
          { key: 'N_min',        label: 'Nitrogen min',     unit: 'mg/kg', color: COLORS.nitrogen    },
          { key: 'P_min',        label: 'Phosphorus min',   unit: 'mg/kg', color: COLORS.phosphorus  },
          { key: 'K_min',        label: 'Potassium min',    unit: 'mg/kg', color: COLORS.potassium   },
          { key: 'moisture_min', label: 'Moisture min',     unit: '%',     color: COLORS.moisture    },
          { key: 'moisture_max', label: 'Moisture max',     unit: '%',     color: COLORS.moisture    },
          { key: 'temp_max',     label: 'Temperature max',  unit: '°C',    color: COLORS.temperature },
        ].map(({ key, label, unit, color }) => (
          <View key={key} style={styles.threshRow}>
            <View style={styles.threshLabelWrap}>
              <View style={[styles.threshDot, { backgroundColor: color }]} />
              <Text style={styles.threshLabel}>{label}</Text>
              <Text style={styles.threshUnit}>{unit}</Text>
            </View>
            <TextInput
              style={styles.threshInput}
              value={String(thresholds[key] ?? '')}
              onChangeText={v => updateThreshold(key, v)}
              keyboardType="decimal-pad"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
        ))}

        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveThresholds}>
          <Text style={styles.saveBtnText}>Save Thresholds</Text>
        </TouchableOpacity>
      </View>

      {/* ── Groq AI ───────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Groq AI</Text>
        <Text style={styles.inputLabel}>Groq API Key</Text>
        <TextInput
          style={styles.input}
          value={groqKey}
          onChangeText={setGroqKey}
          placeholder="gsk_..."
          placeholderTextColor={COLORS.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          secureTextEntry={false}
        />
        <Text style={styles.hint}>
          Get your free key at console.groq.com → API Keys.{'\n'}
          Powers voice transcription and AI Q&A in the 🎙️ Chat tab.
        </Text>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveGroqKey}>
          <Text style={styles.saveBtnText}>Save API Key</Text>
        </TouchableOpacity>
      </View>

      {/* ── About ─────────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>About</Text>
        <Text style={styles.aboutText}>
          IoT Soil Fertility Monitor{'\n'}
          RVCE • IoT Mini Project{'\n'}
          ESP32 + Firebase + Groq AI
        </Text>
      </View>

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
    letterSpacing: 1.5,
    fontWeight: '600',
    marginBottom: 12,
  },
  statusText: {
    fontSize: SIZES.lg,
    fontWeight: '700',
    marginBottom: 10,
  },
  inputLabel: {
    color: COLORS.textSecondary,
    fontSize: SIZES.sm,
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 12,
    color: COLORS.textPrimary,
    fontSize: SIZES.md,
    marginBottom: 4,
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    marginTop: 8,
    lineHeight: 18,
  },
  saveBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: SIZES.md,
    fontWeight: '700',
  },
  testBtn: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.accent,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  testBtnText: {
    color: COLORS.accent,
    fontSize: SIZES.md,
    fontWeight: '600',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: SIZES.md,
    flex: 1,
  },
  statValue: {
    color: COLORS.textPrimary,
    fontSize: SIZES.md,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  aboutText: {
    color: COLORS.textSecondary,
    fontSize: SIZES.md,
    lineHeight: 24,
  },
  threshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
  },
  threshLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  threshDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  threshLabel: {
    color: COLORS.textSecondary,
    fontSize: SIZES.sm,
    flex: 1,
  },
  threshUnit: {
    color: COLORS.textMuted,
    fontSize: SIZES.xs,
    marginRight: 8,
  },
  threshInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: COLORS.textPrimary,
    fontSize: SIZES.md,
    width: 72,
    textAlign: 'right',
  },
});

export default SettingsScreen;
