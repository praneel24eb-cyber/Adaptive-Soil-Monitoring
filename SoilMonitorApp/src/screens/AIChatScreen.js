// ─── AI Chat Screen ───────────────────────────────────────────────────────
// Voice-enabled AI assistant tab for soil monitoring.
//
// Voice commands detected:
//   "Start monitoring"  → captures 5 fresh MQTT readings
//   "End monitoring"    → cancels active monitoring session
//   "Analyze data"      → renders inline SVG charts in the chat
//   anything else       → sent to Groq llama-3.3-70b with soil context
//
// Voice input: hold mic button → Groq Whisper transcription → command executed
// Text input:  type in bar → send button

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
  Alert,
  Animated,
} from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Polyline, Line, Circle as SvgCircle, Text as SvgText } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { useMqtt } from '../services/mqtt';
import { askGroq, transcribeAudio } from '../services/groq';
import { COLORS, SIZES, getClassColor } from '../theme';

import { STORAGE_KEY_GROQ } from '../constants';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - 88;
const CHART_H = 75;

// ─── Command detection ────────────────────────────────────────────────────

const detectCommand = (text) => {
  const t = text.toLowerCase();
  if (/\b(start|begin)\s*(monitor|monitoring)/i.test(t)) return 'START_MONITORING';
  if (/\b(end|stop|finish|halt)\s*(monitor|monitoring)/i.test(t)) return 'END_MONITORING';
  if (/\b(analyze|analyse|show)\s*(data|graph|chart|trend)/i.test(t)) return 'ANALYZE_DATA';
  return 'ASK_AI';
};

// ─── Inline SVG Mini Chart ────────────────────────────────────────────────

const MiniChart = ({ data, color, label, unit }) => {
  if (!data || data.length < 2) return null;

  const vals   = data.map(v => (typeof v === 'number' && !isNaN(v) ? v : 0));
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals, minVal + 1);
  const range  = maxVal - minVal || 1;
  const step   = CHART_W / (vals.length - 1);

  const points = vals
    .map((v, i) => {
      const x = i * step;
      const y = CHART_H - ((v - minVal) / range) * (CHART_H - 14) - 7;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const lastX = (vals.length - 1) * step;
  const lastY = CHART_H - ((vals[vals.length - 1] - minVal) / range) * (CHART_H - 14) - 7;
  const latest = vals[vals.length - 1];

  return (
    <View style={chartSt.wrapper}>
      <View style={chartSt.row}>
        <Text style={chartSt.label}>{label}</Text>
        <Text style={[chartSt.value, { color }]}>
          {latest % 1 === 0 ? latest : latest.toFixed(1)} {unit}
        </Text>
      </View>
      <Svg width={CHART_W} height={CHART_H}>
        {/* Grid lines */}
        {[0, 0.5, 1].map((frac, i) => (
          <Line
            key={i}
            x1={0}
            y1={7 + frac * (CHART_H - 14)}
            x2={CHART_W}
            y2={7 + frac * (CHART_H - 14)}
            stroke={COLORS.surface}
            strokeWidth={1}
          />
        ))}
        {/* Min/Max labels */}
        <SvgText x={2} y={12} fontSize={8} fill={COLORS.textMuted}>
          {maxVal.toFixed(0)}
        </SvgText>
        <SvgText x={2} y={CHART_H - 1} fontSize={8} fill={COLORS.textMuted}>
          {minVal.toFixed(0)}
        </SvgText>
        {/* Data line */}
        <Polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Latest value dot */}
        <SvgCircle cx={lastX} cy={lastY} r={4} fill={color} />
      </Svg>
    </View>
  );
};

// ─── Readings Card (inside chat bubble) ─────────────────────────────────

const ReadingsCard = ({ readings }) => (
  <View style={readSt.container}>
    {readings.map((r, i) => (
      <View key={i} style={[readSt.row, i > 0 && readSt.rowBorder]}>
        <View style={readSt.numBadge}>
          <Text style={readSt.numText}>#{i + 1}</Text>
        </View>
        <View style={readSt.dataCol}>
          <Text style={readSt.time}>
            {r.receivedAt
              ? new Date(r.receivedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : '—'}
          </Text>
          <View style={readSt.npkRow}>
            <Text style={[readSt.npk, { color: COLORS.nitrogen }]}>N:{r.N ?? '—'}</Text>
            <Text style={[readSt.npk, { color: COLORS.phosphorus }]}>  P:{r.P ?? '—'}</Text>
            <Text style={[readSt.npk, { color: COLORS.potassium }]}>  K:{r.K ?? '—'}</Text>
          </View>
          <Text style={readSt.env}>
            💧 {r.moisture != null ? Number(r.moisture).toFixed(1) : '—'}%{'   '}
            🌡️ {r.temp != null ? Number(r.temp).toFixed(1) : '—'}°C
          </Text>
          <Text style={[readSt.cls, { color: getClassColor(r.class) }]}>
            ● {r.class ?? 'Unknown'}
          </Text>
        </View>
      </View>
    ))}
  </View>
);

// ─── Charts Card (inside chat bubble) ────────────────────────────────────

const ChartsCard = ({ history }) => {
  const data = history.slice(-20);

  if (data.length < 2) {
    return (
      <View style={chartSt.emptyBox}>
        <Text style={chartSt.emptyText}>
          📊 Not enough data yet. Connect to MQTT and collect some readings.
        </Text>
      </View>
    );
  }

  return (
    <View style={chartSt.card}>
      <Text style={chartSt.cardTitle}>📊 Soil Analytics — last {data.length} readings</Text>
      <MiniChart data={data.map(r => r.N)}        color={COLORS.nitrogen}    label="Nitrogen"    unit="mg/kg" />
      <MiniChart data={data.map(r => r.P)}        color={COLORS.phosphorus}  label="Phosphorus"  unit="mg/kg" />
      <MiniChart data={data.map(r => r.K)}        color={COLORS.potassium}   label="Potassium"   unit="mg/kg" />
      <MiniChart data={data.map(r => r.moisture)} color={COLORS.moisture}    label="Moisture"    unit="%" />
      <MiniChart data={data.map(r => r.temp)}     color={COLORS.temperature} label="Temperature" unit="°C" />
    </View>
  );
};

// ─── Message Bubble ───────────────────────────────────────────────────────

const MessageBubble = React.memo(({ message }) => {
  const isUser = message.role === 'user';

  return (
    <View style={[bubSt.wrapper, isUser ? bubSt.userWrapper : bubSt.aiWrapper]}>
      {!isUser && (
        <View style={bubSt.avatar}>
          <Text style={bubSt.avatarText}>🤖</Text>
        </View>
      )}
      <View
        style={[
          bubSt.bubble,
          isUser ? bubSt.userBubble : bubSt.aiBubble,
          message.type === 'error'    && bubSt.errorBubble,
          message.type === 'progress' && bubSt.progressBubble,
        ]}
      >
        {/* Body */}
        {message.type === 'readings' ? (
          <>
            <Text style={[bubSt.text, bubSt.aiText]}>{message.text}</Text>
            <ReadingsCard readings={message.readings} />
          </>
        ) : message.type === 'charts' ? (
          <>
            <Text style={[bubSt.text, bubSt.aiText]}>{message.text}</Text>
            <ChartsCard history={message.history} />
          </>
        ) : (
          <Text
            style={[
              bubSt.text,
              isUser ? bubSt.userText : bubSt.aiText,
              message.type === 'error'    && bubSt.errorText,
              message.type === 'progress' && bubSt.progressText,
            ]}
          >
            {message.text}
          </Text>
        )}

        {/* Timestamp */}
        <Text style={[bubSt.ts, isUser && bubSt.tsUser]}>
          {message.timestamp?.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
      {isUser && (
        <View style={[bubSt.avatar, bubSt.avatarUser]}>
          <Text style={bubSt.avatarText}>👤</Text>
        </View>
      )}
    </View>
  );
});

// ─── AI Chat Screen ───────────────────────────────────────────────────────

export default function AIChatScreen() {
  const { latestReading, history, status } = useMqtt();

  // ── State ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'ai',
      type: 'text',
      text:
        '👋 Hi! I\'m your AI soil assistant.\n\n' +
        '🎙️ Hold the mic button and speak, or type:\n\n' +
        '  • "Start monitoring" — capture 5 live readings\n' +
        '  • "End monitoring"   — stop capturing\n' +
        '  • "Analyze data"     — show inline charts\n\n' +
        '  • "What crops can I grow?"\n' +
        '  • "Is my soil healthy?"\n' +
        '  • "Should I add fertilizer?"\n\n' +
        '⚠️  Set your Groq API key in ⚙️ Settings first!',
      timestamp: new Date(),
    },
  ]);

  const [inputText, setInputText]     = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [groqApiKey, setGroqApiKey]   = useState('');

  // ── Refs ───────────────────────────────────────────────────────────────
  const recordingRef       = useRef(null);
  const flatListRef        = useRef(null);
  const isMonitoringRef    = useRef(false);    // sync ref for useEffect
  const capturedRef        = useRef([]);
  const lastReadingKeyRef  = useRef(null);
  const pulseAnim          = useRef(new Animated.Value(1)).current;
  const loopAnimRef        = useRef(null);   // stores the Animated.loop so we can stop it

  // ── Load API key whenever screen is focused ────────────────────────────
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(STORAGE_KEY_GROQ).then(key => {
        if (key) setGroqApiKey(key);
      });
    }, [])
  );

  // ── Mic pulse animation ────────────────────────────────────────────────
  useEffect(() => {
    if (isRecording) {
      loopAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 550, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 550, useNativeDriver: true }),
        ])
      );
      loopAnimRef.current.start();
    } else {
      if (loopAnimRef.current) {
        loopAnimRef.current.stop();
        loopAnimRef.current = null;
      }
      Animated.timing(pulseAnim, { toValue: 1.0, duration: 150, useNativeDriver: true }).start();
    }
  }, [isRecording]);

  // ── Watch for fresh MQTT readings when monitoring ─────────────────────
  useEffect(() => {
    if (!isMonitoringRef.current || !latestReading) return;

    const key =
      latestReading.receivedAt?.toString() ??
      `${latestReading.N}_${latestReading.P}_${latestReading.K}_${Date.now()}`;

    if (key === lastReadingKeyRef.current) return;
    lastReadingKeyRef.current = key;

    capturedRef.current = [...capturedRef.current, latestReading];
    const count = capturedRef.current.length;

    // Update progress message in place
    setMessages(prev =>
      prev.map(m =>
        m.id === 'monitoring-progress'
          ? { ...m, text: `📡 Monitoring... (${count}/5 readings captured)` }
          : m
      )
    );

    if (count >= 5) {
      isMonitoringRef.current = false;
      setIsMonitoring(false);
      const readings = [...capturedRef.current.slice(0, 5)];
      capturedRef.current = [];

      setMessages(prev => [
        ...prev.filter(m => m.id !== 'monitoring-progress'),
        {
          id: `readings-${Date.now()}`,
          role: 'ai',
          type: 'readings',
          text: '✅ Monitoring complete! Here are your 5 fresh readings:',
          readings,
          timestamp: new Date(),
        },
      ]);

      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [latestReading]);

  // ─── Helper: append message ─────────────────────────────────────────────
  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, msg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  // ─── Command executor ────────────────────────────────────────────────────
  const executeCommand = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Append user message
      addMessage({
        id:        `user-${Date.now()}`,
        role:      'user',
        type:      'text',
        text:      trimmed,
        timestamp: new Date(),
      });

      const command = detectCommand(trimmed);

      switch (command) {
        // ── START MONITORING ─────────────────────────────────────────────
        case 'START_MONITORING': {
          if (isMonitoringRef.current) {
            addMessage({
              id: `ai-${Date.now()}`, role: 'ai', type: 'progress',
              text: '⏳ Already monitoring — waiting for readings.',
              timestamp: new Date(),
            });
            break;
          }
          if (status !== 'connected') {
            addMessage({
              id: `ai-${Date.now()}`, role: 'ai', type: 'error',
              text: '⚠️ MQTT broker is not connected. Go to ⚙️ Settings and tap "Test Connection" first.',
              timestamp: new Date(),
            });
            break;
          }

          isMonitoringRef.current = true;
          setIsMonitoring(true);
          capturedRef.current   = [];
          lastReadingKeyRef.current = null;

          setMessages(prev => [
            ...prev,
            {
              id:        'monitoring-progress',
              role:      'ai',
              type:      'progress',
              text:      '📡 Monitoring... (0/5 readings captured)',
              timestamp: new Date(),
            },
          ]);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
          break;
        }

        // ── END MONITORING ───────────────────────────────────────────────
        case 'END_MONITORING': {
          if (!isMonitoringRef.current) {
            addMessage({
              id: `ai-${Date.now()}`, role: 'ai', type: 'text',
              text: '💤 No active monitoring session to stop.',
              timestamp: new Date(),
            });
            break;
          }

          isMonitoringRef.current = false;
          setIsMonitoring(false);
          const partial = [...capturedRef.current];
          capturedRef.current = [];

          setMessages(prev => {
            const filtered = prev.filter(m => m.id !== 'monitoring-progress');
            const result =
              partial.length > 0
                ? {
                    id:       `ai-${Date.now()}`,
                    role:     'ai',
                    type:     'readings',
                    text:     `🛑 Monitoring stopped early. ${partial.length} reading(s) captured:`,
                    readings: partial,
                    timestamp: new Date(),
                  }
                : {
                    id:        `ai-${Date.now()}`,
                    role:      'ai',
                    type:      'text',
                    text:      '🛑 Monitoring stopped. No readings were captured yet.',
                    timestamp: new Date(),
                  };
            return [...filtered, result];
          });
          break;
        }

        // ── ANALYZE DATA ─────────────────────────────────────────────────
        case 'ANALYZE_DATA': {
          addMessage({
            id:        `ai-${Date.now()}`,
            role:      'ai',
            type:      'charts',
            text:      '📊 Here\'s your soil data analysis:',
            history:   [...history],
            timestamp: new Date(),
          });
          break;
        }

        // ── ASK GROQ AI ──────────────────────────────────────────────────
        case 'ASK_AI': {
          if (!groqApiKey) {
            addMessage({
              id:        `ai-${Date.now()}`,
              role:      'ai',
              type:      'error',
              text:      '🔑 No Groq API key found.\n\nGo to ⚙️ Settings → scroll down to "Groq AI" → paste your key and tap Save.',
              timestamp: new Date(),
            });
            break;
          }

          setIsLoading(true);
          try {
            const answer = await askGroq(trimmed, latestReading, history, groqApiKey);
            addMessage({
              id:        `ai-${Date.now()}`,
              role:      'ai',
              type:      'text',
              text:      answer,
              timestamp: new Date(),
            });
          } catch (err) {
            addMessage({
              id:        `ai-${Date.now()}`,
              role:      'ai',
              type:      'error',
              text:      `❌ ${err.message}`,
              timestamp: new Date(),
            });
          } finally {
            setIsLoading(false);
          }
          break;
        }
      }
    },
    [groqApiKey, history, latestReading, status, addMessage]
  );

  // ─── Voice recording ─────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (isLoading) return;
    if (!groqApiKey) {
      Alert.alert(
        'API Key Required',
        'Please enter your Groq API key in ⚙️ Settings before using voice input.'
      );
      return;
    }

    try {
      const { status: permStatus } = await Audio.requestPermissionsAsync();
      if (permStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone access is required for voice input.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS:  true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setIsRecording(true);
    } catch (err) {
      console.error('[Voice] startRecording:', err);
      Alert.alert('Recording Error', err.message);
    }
  }, [groqApiKey, isLoading]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    try {
      setIsRecording(false);
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        addMessage({
          id: `ai-${Date.now()}`, role: 'ai', type: 'error',
          text: '🎙️ No audio captured. Try holding the mic longer.',
          timestamp: new Date(),
        });
        return;
      }

      // Show transcribing spinner in chat
      const spinId = `transcribing-${Date.now()}`;
      setMessages(prev => [
        ...prev,
        { id: spinId, role: 'ai', type: 'progress', text: '🎙️ Transcribing...', timestamp: new Date() },
      ]);
      setIsLoading(true);

      const transcript = await transcribeAudio(uri, groqApiKey);

      // Remove spinner
      setMessages(prev => prev.filter(m => m.id !== spinId));
      setIsLoading(false);

      if (!transcript) {
        addMessage({
          id: `ai-${Date.now()}`, role: 'ai', type: 'error',
          text: '🎙️ Could not understand audio. Please try again.',
          timestamp: new Date(),
        });
        return;
      }

      await executeCommand(transcript);
    } catch (err) {
      setIsLoading(false);
      setMessages(prev => prev.filter(m => !m.id.startsWith('transcribing-')));
      recordingRef.current = null;
      console.error('[Voice] stopRecording:', err);
      addMessage({
        id: `ai-${Date.now()}`, role: 'ai', type: 'error',
        text: `❌ Voice error: ${err.message}`,
        timestamp: new Date(),
      });
    }
  }, [groqApiKey, executeCommand, addMessage]);

  // ─── Text submit ─────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');
    executeCommand(text);
  }, [inputText, isLoading, executeCommand]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 92 : 0}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎙️ AI Assistant</Text>
        <View style={styles.headerRight}>
          {isMonitoring && (
            <View style={styles.monBadge}>
              <Text style={styles.monBadgeText}>⬤ MONITORING</Text>
            </View>
          )}
          {isLoading && !isRecording && (
            <ActivityIndicator size="small" color={COLORS.accent} style={{ marginLeft: 8 }} />
          )}
        </View>
      </View>

      {/* ── Chat list ──────────────────────────────────────────────────── */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: false })
        }
      />

      {/* ── Recording indicator ────────────────────────────────────────── */}
      {isRecording && (
        <View style={styles.recordingBar}>
          <Animated.View
            style={[styles.recDot, { transform: [{ scale: pulseAnim }] }]}
          />
          <Text style={styles.recordingText}>Recording… Release to send</Text>
        </View>
      )}

      {/* ── Input bar ─────────────────────────────────────────────────── */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type or hold 🎙️ to speak..."
          placeholderTextColor={COLORS.textMuted}
          multiline
          maxLength={500}
          returnKeyType="send"
          blurOnSubmit
          onSubmitEditing={handleSend}
          editable={!isRecording}
        />

        {inputText.trim() ? (
          /* Send button */
          <TouchableOpacity
            style={styles.sendBtn}
            onPress={handleSend}
            disabled={isLoading}
          >
            <Text style={styles.sendBtnText}>➤</Text>
          </TouchableOpacity>
        ) : (
          /* Mic button: hold to record */
          <Pressable
            onPressIn={startRecording}
            onPressOut={stopRecording}
            disabled={isLoading && !isRecording}
          >
            <Animated.View
              style={[
                styles.micBtn,
                isRecording && styles.micBtnActive,
                { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <Text style={styles.micBtnIcon}>{isRecording ? '🔴' : '🎙️'}</Text>
            </Animated.View>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    paddingTop:      52,
    paddingBottom:   12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  headerTitle: {
    color:      COLORS.textPrimary,
    fontSize:   SIZES.lg,
    fontWeight: '800',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  monBadge: {
    backgroundColor: COLORS.nutrientRich + '22',
    borderColor:     COLORS.nutrientRich,
    borderWidth:     1,
    borderRadius:    20,
    paddingHorizontal: 10,
    paddingVertical:   3,
  },
  monBadgeText: {
    color:      COLORS.nutrientRich,
    fontSize:   10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  chatContent: {
    padding:       12,
    paddingBottom: 8,
  },
  recordingBar: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: COLORS.depleted + '18',
    borderTopWidth:  1,
    borderTopColor:  COLORS.depleted + '44',
    paddingVertical: 8,
  },
  recDot: {
    width:           10,
    height:          10,
    borderRadius:    5,
    backgroundColor: COLORS.depleted,
    marginRight:     8,
  },
  recordingText: {
    color:    COLORS.depleted,
    fontSize: SIZES.sm,
    fontWeight: '600',
  },
  inputBar: {
    flexDirection:     'row',
    alignItems:        'flex-end',
    paddingHorizontal: 12,
    paddingVertical:   10,
    backgroundColor:   COLORS.card,
    borderTopWidth:    1,
    borderTopColor:    COLORS.cardBorder,
    columnGap:         8,
  },
  input: {
    flex:              1,
    backgroundColor:   COLORS.surface,
    borderRadius:      22,
    borderWidth:       1,
    borderColor:       COLORS.cardBorder,
    paddingHorizontal: 16,
    paddingVertical:   10,
    color:             COLORS.textPrimary,
    fontSize:          SIZES.md,
    maxHeight:         120,
  },
  sendBtn: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: COLORS.accent,
    alignItems:      'center',
    justifyContent:  'center',
  },
  sendBtnText: {
    color:    '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  micBtn: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: COLORS.surface,
    borderWidth:     1,
    borderColor:     COLORS.cardBorder,
    alignItems:      'center',
    justifyContent:  'center',
  },
  micBtnActive: {
    backgroundColor: COLORS.depleted + '33',
    borderColor:     COLORS.depleted,
  },
  micBtnIcon: {
    fontSize: 20,
  },
});

// ─── Bubble styles ────────────────────────────────────────────────────────

const bubSt = StyleSheet.create({
  wrapper: {
    flexDirection:  'row',
    marginVertical: 5,
    alignItems:     'flex-end',
    paddingHorizontal: 4,
  },
  aiWrapper: {
    justifyContent: 'flex-start',
  },
  userWrapper: {
    justifyContent: 'flex-end',
  },
  avatar: {
    width:          30,
    height:         30,
    borderRadius:   15,
    backgroundColor: COLORS.surface,
    alignItems:     'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    flexShrink: 0,
  },
  avatarUser: {
    backgroundColor: COLORS.accent + '33',
  },
  avatarText: {
    fontSize: 16,
  },
  bubble: {
    maxWidth:      SCREEN_W * 0.78,
    borderRadius:  18,
    paddingHorizontal: 14,
    paddingVertical:   10,
    flexShrink: 1,
  },
  aiBubble: {
    backgroundColor: COLORS.card,
    borderWidth:     1,
    borderColor:     COLORS.cardBorder,
    borderBottomLeftRadius: 4,
  },
  userBubble: {
    backgroundColor: COLORS.accent,
    borderBottomRightRadius: 4,
  },
  errorBubble: {
    backgroundColor: COLORS.depleted + '18',
    borderColor:     COLORS.depleted + '55',
    borderWidth:     1,
  },
  progressBubble: {
    backgroundColor: COLORS.surface,
    borderColor:     COLORS.cardBorder + '88',
    borderWidth:     1,
  },
  text: {
    fontSize:   SIZES.md,
    lineHeight: 22,
  },
  aiText: {
    color: COLORS.textPrimary,
  },
  userText: {
    color: '#fff',
  },
  errorText: {
    color: COLORS.depleted,
  },
  progressText: {
    color:      COLORS.textSecondary,
    fontStyle:  'italic',
    fontSize:   SIZES.sm,
  },
  ts: {
    fontSize:   9,
    color:      COLORS.textMuted,
    marginTop:  4,
    alignSelf:  'flex-start',
  },
  tsUser: {
    alignSelf: 'flex-end',
    color:     'rgba(255,255,255,0.55)',
  },
});

// ─── Readings card styles ─────────────────────────────────────────────────

const readSt = StyleSheet.create({
  container: {
    marginTop:    10,
    borderRadius: 10,
    overflow:     'hidden',
    borderWidth:  1,
    borderColor:  COLORS.cardBorder,
  },
  row: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    backgroundColor: COLORS.surface,
    padding:         10,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
  },
  numBadge: {
    width:           28,
    height:          28,
    borderRadius:    14,
    backgroundColor: COLORS.accent + '22',
    borderWidth:     1,
    borderColor:     COLORS.accent,
    alignItems:      'center',
    justifyContent:  'center',
    marginRight:     10,
    marginTop:       2,
    flexShrink:      0,
  },
  numText: {
    color:      COLORS.accent,
    fontSize:   10,
    fontWeight: '700',
  },
  dataCol: {
    flex: 1,
  },
  time: {
    color:    COLORS.textMuted,
    fontSize: 10,
    marginBottom: 4,
  },
  npkRow: {
    flexDirection: 'row',
    marginBottom:  3,
  },
  npk: {
    fontSize:   SIZES.sm,
    fontWeight: '700',
  },
  env: {
    color:    COLORS.textSecondary,
    fontSize: SIZES.sm,
    marginBottom: 3,
  },
  cls: {
    fontSize:   SIZES.sm,
    fontWeight: '600',
  },
});

// ─── Chart styles ─────────────────────────────────────────────────────────

const chartSt = StyleSheet.create({
  card: {
    marginTop:    10,
    padding:      10,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth:  1,
    borderColor:  COLORS.cardBorder,
  },
  cardTitle: {
    color:        COLORS.textSecondary,
    fontSize:     SIZES.sm,
    fontWeight:   '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  wrapper: {
    marginBottom: 10,
  },
  row: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   4,
  },
  label: {
    color:    COLORS.textSecondary,
    fontSize: SIZES.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize:   SIZES.sm,
    fontWeight: '700',
  },
  emptyBox: {
    marginTop:    10,
    padding:      14,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth:  1,
    borderColor:  COLORS.cardBorder,
  },
  emptyText: {
    color:    COLORS.textSecondary,
    fontSize: SIZES.sm,
    lineHeight: 20,
  },
});
