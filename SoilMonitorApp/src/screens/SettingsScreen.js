// ─── Settings Screen ──────────────────────────────────────────────────
// Configure MQTT broker IP/port, test connection, Groq API key, and view app info.

import React, { useState, useEffect } from 'react';
import { View, ScrollView, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMqtt } from '../services/mqtt';
import { COLORS, SIZES } from '../theme';
import { STORAGE_KEY_GROQ } from '../constants';

const SettingsScreen = () => {
  const { brokerIp, brokerPort, status, updateBrokerSettings, connect, history, alerts } = useMqtt();
  const [ip, setIp]           = useState(brokerIp);
  const [port, setPort]       = useState(brokerPort);
  const [groqKey, setGroqKey] = useState('');

  // Load stored Groq key on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_GROQ).then(k => {
      if (k) setGroqKey(k);
    });
  }, []);

  const handleSaveGroqKey = async () => {
    const trimmed = groqKey.trim();
    if (!trimmed) {
      Alert.alert('Error', 'API key cannot be empty.');
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEY_GROQ, trimmed);
    Alert.alert('Saved', 'Groq API key saved successfully. Switch to the 🎙️ AI tab to use it.');
  };

  const handleSave = async () => {
    if (!ip.trim()) {
      Alert.alert('Error', 'Broker IP cannot be empty');
      return;
    }
    await updateBrokerSettings(ip.trim(), port.trim() || '9001');
    // The connect effect will auto-trigger via the dependency change
    Alert.alert('Saved', `Broker set to ${ip.trim()}:${port.trim() || '9001'}\nReconnecting…`);
  };

  const handleTestConnection = () => {
    connect();
    Alert.alert('Reconnecting', 'Attempting to connect to broker…');
  };

  const getStatusColor = () => {
    if (status === 'connected')  return COLORS.connected;
    if (status === 'connecting') return COLORS.moderate;
    return COLORS.disconnected;
  };

  const getStatusLabel = () => {
    if (status === 'connected')  return '● Connected';
    if (status === 'connecting') return '◌ Connecting…';
    return '○ Disconnected';
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.header}>⚙️ Settings</Text>

      {/* Connection Status */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Connection Status</Text>
        <Text style={[styles.statusText, { color: getStatusColor() }]}>
          {getStatusLabel()}
        </Text>
      </View>

      {/* MQTT Broker Config */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>MQTT Broker</Text>
        <Text style={styles.inputLabel}>Broker IP Address</Text>
        <TextInput
          style={styles.input}
          value={ip}
          onChangeText={setIp}
          placeholder="e.g. 172.17.0.213"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="numeric"
          autoCorrect={false}
        />
        <Text style={styles.inputLabel}>WebSocket Port</Text>
        <TextInput
          style={styles.input}
          value={port}
          onChangeText={setPort}
          placeholder="9001"
          placeholderTextColor={COLORS.textMuted}
          keyboardType="numeric"
        />
        <Text style={styles.hint}>
          This is your laptop's IP on the RVCE Wi-Fi network.{'\n'}
          Run "ipconfig" on PowerShell to find it.
        </Text>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save & Reconnect</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.testBtn} onPress={handleTestConnection}>
          <Text style={styles.testBtnText}>Test Connection</Text>
        </TouchableOpacity>
      </View>

      {/* Data Stats */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Data Statistics</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Readings buffered</Text>
          <Text style={styles.statValue}>{history.length}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Alerts logged</Text>
          <Text style={styles.statValue}>{alerts.length}</Text>
        </View>
      </View>

      {/* Groq API Key */}
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

      {/* About */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>About</Text>
        <Text style={styles.aboutText}>
          IoT Soil Fertility Monitor{'\n'}
          RVCE • IoT Mini Project{'\n'}
          ESP32 + TinyML + MQTT
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
    marginTop: 8,
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
  },
  statValue: {
    color: COLORS.textPrimary,
    fontSize: SIZES.md,
    fontWeight: '600',
  },
  aboutText: {
    color: COLORS.textSecondary,
    fontSize: SIZES.md,
    lineHeight: 24,
  },
});

export default SettingsScreen;
