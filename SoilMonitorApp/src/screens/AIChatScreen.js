// ─── AI Chat Screen ───────────────────────────────────────────────────────
// Voice-enabled AI assistant tab for soil monitoring.
//
// Voice commands detected:
//   "Start monitoring"  → captures 5 fresh Firebase readings
//   "End monitoring"    → cancels active monitoring session
//   "Analyze data"      → generates a downloadable PDF soil report
//   anything else       → sent to Groq llama-3.3-70b with soil context
//
// Voice input: hold mic button → Groq Whisper transcription → command executed
// Text input:  type in bar → send button

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator, Dimensions, Alert, Animated,
} from 'react-native';
import { Audio }        from 'expo-av';
import * as Print      from 'expo-print';
import * as Sharing    from 'expo-sharing';
import AsyncStorage    from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useMqtt }     from '../services/mqtt';
import { askGroq, transcribeAudio } from '../services/groq';
import { COLORS, SIZES, getClassColor } from '../theme';
import { STORAGE_KEY_GROQ } from '../constants';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Command detection ─────────────────────────────────────────────────────
const detectCommand = (text) => {
  const t = text.toLowerCase();
  if (/\b(start|begin)\s*(monitor|monitoring)/i.test(t))  return 'START_MONITORING';
  if (/\b(end|stop|finish|halt)\s*(monitor|monitoring)/i.test(t)) return 'END_MONITORING';
  if (/\b(analyze|analyse|show|generate|create|make)\s*(data|graph|chart|trend|report|pdf)/i.test(t)) return 'ANALYZE_DATA';
  return 'ASK_AI';
};

// ─── PDF HTML builder ──────────────────────────────────────────────────────
const buildPDFHtml = (history, latest, aiInsights) => {
  const data   = history.slice(-20);
  const now    = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '—';
  const Ns  = data.map(r => r.N).filter(v => v != null);
  const Ps  = data.map(r => r.P).filter(v => v != null);
  const Ks  = data.map(r => r.K).filter(v => v != null);
  const Ms  = data.map(r => r.moisture).filter(v => v != null);
  const Ts  = data.map(r => r.temp).filter(v => v != null);

  // SVG chart builder
  const buildChart = (values, color) => {
    if (!values || values.length < 2) {
      return `<text x="250" y="40" text-anchor="middle" fill="#d1d5db" font-size="12">No data</text>`;
    }
    const w = 500, h = 70, pad = 10;
    const min   = Math.min(...values);
    const max   = Math.max(...values, min + 0.1);
    const range = max - min;
    const cw = w - 2 * pad, ch = h - 2 * pad;

    const pts = values.map((v, i) => {
      const x = pad + (i / (values.length - 1)) * cw;
      const y = pad + (1 - (v - min) / range) * ch;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const grids = [0, 0.5, 1].map(f => {
      const y = (pad + f * ch).toFixed(1);
      return `<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
    }).join('');

    const lv = values[values.length - 1];
    const lx = (pad + cw).toFixed(1);
    const ly = (pad + (1 - (lv - min) / range) * ch).toFixed(1);

    return `
      ${grids}
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5"
        stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${lx}" cy="${ly}" r="4" fill="${color}"/>
      <text x="6" y="16" font-size="9" fill="#9ca3af">${max.toFixed(0)}</text>
      <text x="6" y="${h - 3}" font-size="9" fill="#9ca3af">${min.toFixed(0)}</text>`;
  };

  const fcl    = latest?.class ?? 'Unknown';
  const fColor = { 'Nutrient-Rich': '#16a34a', Moderate: '#d97706', Depleted: '#dc2626' }[fcl] ?? '#6b7280';
  const fBg    = { 'Nutrient-Rich': '#f0fdf4', Moderate: '#fffbeb', Depleted: '#fef2f2' }[fcl] ?? '#f9fafb';

  const tableRows = data.slice(-10).reverse().map((r, i) => {
    const t = r.timestamp
      ? new Date(r.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '—';
    const bg  = i % 2 === 0 ? '#fff' : '#f9fafb';
    const cc  = { 'Nutrient-Rich': '#16a34a', Moderate: '#d97706', Depleted: '#dc2626' }[r.class] ?? '#6b7280';
    return `<tr style="background:${bg}">
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#374151">${t}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#2563eb;font-weight:700">${r.N ?? '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#7c3aed;font-weight:700">${r.P ?? '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#b45309;font-weight:700">${r.K ?? '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#0891b2">${r.moisture != null ? Number(r.moisture).toFixed(1) : '—'}%</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#dc2626">${r.temp != null ? Number(r.temp).toFixed(1) : '—'}°C</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;color:${cc};font-weight:700">${r.class ?? '—'}</td>
    </tr>`;
  }).join('');

  const latestTime = latest?.timestamp
    ? new Date(latest.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Soil Health Report</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; background:#fff; color:#111827; padding:40px 48px; font-size:13px; }
.hdr { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:28px; padding-bottom:18px; border-bottom:3px solid #16a34a; }
.hdr h1 { font-size:26px; font-weight:900; }
.hdr h1 span { color:#16a34a; }
.hdr p  { color:#6b7280; font-size:11px; margin-top:2px; }
.meta   { text-align:right; color:#6b7280; font-size:11px; line-height:1.9; }
.sec    { margin:22px 0 0; }
.sec-t  { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:2px; color:#9ca3af; margin-bottom:12px; padding-bottom:6px; border-bottom:1px solid #f1f5f9; }
.g3     { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
.g2     { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
.card   { background:#f9fafb; border:1px solid #f1f5f9; border-radius:10px; padding:14px; text-align:center; }
.card .l{ font-size:10px; text-transform:uppercase; letter-spacing:1px; color:#9ca3af; margin-bottom:3px; }
.card .v{ font-size:22px; font-weight:900; }
.card .u{ font-size:10px; color:#9ca3af; margin-top:1px; }
.fbanner{ border-radius:12px; padding:18px 24px; text-align:center; background:${fBg}; border:2px solid ${fColor}44; margin-bottom:4px; }
.fbanner .l{ font-size:11px; text-transform:uppercase; letter-spacing:2px; color:${fColor}; opacity:.75; }
.fbanner .c{ font-size:30px; font-weight:900; color:${fColor}; margin-top:4px; }
.ch-blk { margin-bottom:12px; }
.ch-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:3px; }
.ch-n   { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:#374151; }
.ch-v   { font-size:11px; color:#6b7280; }
svg.ch  { width:100%; height:70px; background:#f9fafb; border-radius:6px; display:block; }
table   { width:100%; border-collapse:collapse; font-size:11px; }
thead th{ background:#111827; color:#fff; padding:8px 10px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.5px; font-weight:700; }
.ins    { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:16px; font-size:12px; line-height:1.8; color:#166534; white-space:pre-wrap; word-break:break-word; }
.foot   { margin-top:30px; padding-top:15px; border-top:1px solid #f1f5f9; text-align:center; font-size:10px; color:#d1d5db; }
</style>
</head>
<body>

<div class="hdr">
  <div>
    <h1>🌱 Soil Health <span>Report</span></h1>
    <p>RVCE IoT Adaptive Soil Monitoring System</p>
  </div>
  <div class="meta">
    <div><strong>Date:</strong> ${dateStr}</div>
    <div><strong>Time:</strong> ${timeStr}</div>
    <div><strong>Samples:</strong> ${data.length} readings</div>
    <div><strong>Sensor:</strong> ESP32 + NPK + DS18B20</div>
  </div>
</div>

<div class="sec">
  <div class="sec-t">Soil Fertility Status</div>
  <div class="fbanner">
    <div class="l">Current ML Classification</div>
    <div class="c">${fcl}</div>
  </div>
</div>

<div class="sec">
  <div class="sec-t">Latest Reading · ${latestTime}</div>
  <div class="g3">
    <div class="card"><div class="l">Nitrogen</div><div class="v" style="color:#2563eb">${latest?.N ?? '—'}</div><div class="u">mg/kg</div></div>
    <div class="card"><div class="l">Phosphorus</div><div class="v" style="color:#7c3aed">${latest?.P ?? '—'}</div><div class="u">mg/kg</div></div>
    <div class="card"><div class="l">Potassium</div><div class="v" style="color:#b45309">${latest?.K ?? '—'}</div><div class="u">mg/kg</div></div>
    <div class="card"><div class="l">Moisture</div><div class="v" style="color:#0891b2">${latest?.moisture != null ? Number(latest.moisture).toFixed(1) : '—'}</div><div class="u">%</div></div>
    <div class="card"><div class="l">Temperature</div><div class="v" style="color:#dc2626">${latest?.temp != null ? Number(latest.temp).toFixed(2) : '—'}</div><div class="u">°C</div></div>
    <div class="card"><div class="l">CUSUM Score</div><div class="v" style="color:#6b7280">${latest?.cusum != null ? Number(latest.cusum).toFixed(2) : '0.00'}</div><div class="u">drift index</div></div>
  </div>
</div>

<div class="sec">
  <div class="sec-t">Trend Analysis · Last ${data.length} Readings</div>
  <div class="ch-blk">
    <div class="ch-row"><span class="ch-n">Nitrogen</span><span class="ch-v">avg ${avg(Ns)} mg/kg</span></div>
    <svg class="ch" viewBox="0 0 500 70" preserveAspectRatio="none">${buildChart(Ns,'#2563eb')}</svg>
  </div>
  <div class="ch-blk">
    <div class="ch-row"><span class="ch-n">Phosphorus</span><span class="ch-v">avg ${avg(Ps)} mg/kg</span></div>
    <svg class="ch" viewBox="0 0 500 70" preserveAspectRatio="none">${buildChart(Ps,'#7c3aed')}</svg>
  </div>
  <div class="ch-blk">
    <div class="ch-row"><span class="ch-n">Potassium</span><span class="ch-v">avg ${avg(Ks)} mg/kg</span></div>
    <svg class="ch" viewBox="0 0 500 70" preserveAspectRatio="none">${buildChart(Ks,'#b45309')}</svg>
  </div>
  <div class="g2">
    <div class="ch-blk">
      <div class="ch-row"><span class="ch-n">Moisture</span><span class="ch-v">avg ${avg(Ms)}%</span></div>
      <svg class="ch" viewBox="0 0 500 70" preserveAspectRatio="none">${buildChart(Ms,'#0891b2')}</svg>
    </div>
    <div class="ch-blk">
      <div class="ch-row"><span class="ch-n">Temperature</span><span class="ch-v">avg ${avg(Ts)}°C</span></div>
      <svg class="ch" viewBox="0 0 500 70" preserveAspectRatio="none">${buildChart(Ts,'#dc2626')}</svg>
    </div>
  </div>
</div>

${aiInsights ? `
<div class="sec">
  <div class="sec-t">AI Analysis &amp; Recommendations (Groq AI)</div>
  <div class="ins">${aiInsights.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
</div>` : ''}

<div class="sec">
  <div class="sec-t">Historical Data · Last 10 Readings</div>
  <table>
    <thead>
      <tr>
        <th>Time</th><th>N (mg/kg)</th><th>P (mg/kg)</th><th>K (mg/kg)</th>
        <th>Moisture</th><th>Temp</th><th>Class</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</div>

<div class="foot">Generated by Soil Monitor App · RVCE IoT Project · ESP32 Adaptive Soil Monitoring System</div>
</body>
</html>`;
};

// ─── Readings Card (inside chat bubble) ───────────────────────────────────
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
              ? new Date(r.receivedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' })
              : r.timestamp
                ? new Date(r.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' })
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

// ─── Message Bubble ────────────────────────────────────────────────────────
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
          isUser  ? bubSt.userBubble     : bubSt.aiBubble,
          message.type === 'error'    && bubSt.errorBubble,
          message.type === 'progress' && bubSt.progressBubble,
        ]}
      >
        {message.type === 'readings' ? (
          <>
            <Text style={[bubSt.text, bubSt.aiText]}>{message.text}</Text>
            <ReadingsCard readings={message.readings} />
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
        <Text style={[bubSt.ts, isUser && bubSt.tsUser]}>
          {message.timestamp?.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
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

// ─── AI Chat Screen ────────────────────────────────────────────────────────
export default function AIChatScreen() {
  const { latestReading, history, status } = useMqtt();

  const [messages, setMessages] = useState([
    {
      id:   'welcome',
      role: 'ai',
      type: 'text',
      text:
        '👋 Hi! I\'m your AI soil assistant.\n\n' +
        '🎙️ Hold the mic button and speak, or type:\n\n' +
        '  • "Start monitoring" — capture 5 live readings\n' +
        '  • "End monitoring"   — stop capturing\n' +
        '  • "Analyze data"     — generate PDF report 📄\n\n' +
        '  • "What crops can I grow?"\n' +
        '  • "Is my soil healthy?"\n' +
        '  • "Should I add fertilizer?"\n\n' +
        '⚠️  Set your Groq API key in ⚙️ Settings first!',
      timestamp: new Date(),
    },
  ]);

  const [inputText, setInputText]       = useState('');
  const [isRecording, setIsRecording]   = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [groqApiKey, setGroqApiKey]     = useState('');

  const recordingRef      = useRef(null);
  const flatListRef       = useRef(null);
  const isMonitoringRef   = useRef(false);
  const capturedRef       = useRef([]);
  const lastReadingKeyRef = useRef(null);
  const pulseAnim         = useRef(new Animated.Value(1)).current;
  const loopAnimRef       = useRef(null);

  // ── Load API key on focus ───────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(STORAGE_KEY_GROQ).then(key => {
        if (key) setGroqApiKey(key);
      });
    }, [])
  );

  // ── Mic pulse animation ─────────────────────────────────────────────────
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
      loopAnimRef.current?.stop();
      loopAnimRef.current = null;
      Animated.timing(pulseAnim, { toValue: 1.0, duration: 150, useNativeDriver: true }).start();
    }
  }, [isRecording]);

  // ── Watch for Firebase readings during monitoring ───────────────────────
  useEffect(() => {
    if (!isMonitoringRef.current || !latestReading) return;

    const key =
      latestReading.timestamp?.toString() ??
      latestReading.receivedAt?.toString() ??
      `${latestReading.N}_${latestReading.P}_${latestReading.K}_${Date.now()}`;

    if (key === lastReadingKeyRef.current) return;
    lastReadingKeyRef.current = key;

    capturedRef.current = [...capturedRef.current, latestReading];
    const count = capturedRef.current.length;

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
          id:        `readings-${Date.now()}`,
          role:      'ai',
          type:      'readings',
          text:      '✅ Monitoring complete! Here are your 5 fresh readings:',
          readings,
          timestamp: new Date(),
        },
      ]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [latestReading]);

  // ── Helper: append message ─────────────────────────────────────────────
  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, msg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  // ── PDF generation helper ──────────────────────────────────────────────
  const generateAndSharePDF = useCallback(async () => {
    if (history.length < 2) {
      addMessage({
        id: `ai-${Date.now()}`, role: 'ai', type: 'error',
        text: '📊 Not enough data yet. Collect at least 2 readings first.',
        timestamp: new Date(),
      });
      return;
    }

    const progressId = `pdf-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: progressId, role: 'ai', type: 'progress',
      text: '📄 Generating soil health report…',
      timestamp: new Date(),
    }]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
    setIsLoading(true);

    try {
      // Get Groq AI insights if key available
      let aiInsights = '';
      if (groqApiKey) {
        try {
          aiInsights = await askGroq(
            'Provide a structured soil health analysis report with these sections:\n' +
            '1) HEALTH ASSESSMENT — overall soil health based on N/P/K levels\n' +
            '2) KEY FINDINGS — 2-3 specific observations from the data\n' +
            '3) RECOMMENDED CROPS — 3-4 crops suited to these conditions\n' +
            '4) FERTILIZER RECOMMENDATIONS — specific fertilizers and quantities\n' +
            '5) ACTION PLAN — immediate steps to improve soil fertility\n' +
            'Be specific, practical, and concise.',
            latestReading, history, groqApiKey
          );
        } catch (e) {
          console.warn('[PDF] Could not fetch AI insights:', e.message);
        }
      }

      // Build and print PDF
      const html = buildPDFHtml(history, latestReading, aiInsights);
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      setMessages(prev => prev.filter(m => m.id !== progressId));
      setIsLoading(false);

      addMessage({
        id: `ai-${Date.now()}`, role: 'ai', type: 'text',
        text: '✅ Soil health report ready! Opening share dialog…',
        timestamp: new Date(),
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType:    'application/pdf',
          dialogTitle: 'Save Soil Health Report',
          UTI:         'com.adobe.pdf',
        });
      } else {
        addMessage({
          id: `ai-${Date.now()}`, role: 'ai', type: 'text',
          text: `📄 Report saved to:\n${uri}`,
          timestamp: new Date(),
        });
      }
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== progressId));
      setIsLoading(false);
      addMessage({
        id: `ai-${Date.now()}`, role: 'ai', type: 'error',
        text: `❌ Could not generate report: ${err.message}`,
        timestamp: new Date(),
      });
    }
  }, [history, latestReading, groqApiKey, addMessage]);

  // ── Command executor ──────────────────────────────────────────────────
  const executeCommand = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      addMessage({
        id: `user-${Date.now()}`, role: 'user', type: 'text',
        text: trimmed, timestamp: new Date(),
      });

      const command = detectCommand(trimmed);

      switch (command) {

        // ── START MONITORING ───────────────────────────────────────────
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
              text: '⚠️ Firebase is not connected. Check your internet connection.',
              timestamp: new Date(),
            });
            break;
          }

          isMonitoringRef.current  = true;
          setIsMonitoring(true);
          capturedRef.current      = [];
          lastReadingKeyRef.current = null;

          setMessages(prev => [...prev, {
            id: 'monitoring-progress', role: 'ai', type: 'progress',
            text: '📡 Monitoring... (0/5 readings captured)',
            timestamp: new Date(),
          }]);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
          break;
        }

        // ── END MONITORING ─────────────────────────────────────────────
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
            const result = partial.length > 0
              ? { id:`ai-${Date.now()}`, role:'ai', type:'readings',
                  text:`🛑 Monitoring stopped. ${partial.length} reading(s) captured:`,
                  readings: partial, timestamp: new Date() }
              : { id:`ai-${Date.now()}`, role:'ai', type:'text',
                  text:'🛑 Monitoring stopped. No readings were captured yet.',
                  timestamp: new Date() };
            return [...filtered, result];
          });
          break;
        }

        // ── ANALYZE DATA → PDF ─────────────────────────────────────────
        case 'ANALYZE_DATA': {
          await generateAndSharePDF();
          break;
        }

        // ── ASK GROQ AI ────────────────────────────────────────────────
        case 'ASK_AI': {
          if (!groqApiKey) {
            addMessage({
              id: `ai-${Date.now()}`, role: 'ai', type: 'error',
              text: '🔑 No Groq API key found.\n\nGo to ⚙️ Settings → Groq AI → paste your key and tap Save.',
              timestamp: new Date(),
            });
            break;
          }

          setIsLoading(true);
          try {
            const answer = await askGroq(trimmed, latestReading, history, groqApiKey);
            addMessage({
              id: `ai-${Date.now()}`, role: 'ai', type: 'text',
              text: answer, timestamp: new Date(),
            });
          } catch (err) {
            addMessage({
              id: `ai-${Date.now()}`, role: 'ai', type: 'error',
              text: `❌ ${err.message}`, timestamp: new Date(),
            });
          } finally {
            setIsLoading(false);
          }
          break;
        }
      }
    },
    [groqApiKey, history, latestReading, status, addMessage, generateAndSharePDF]
  );

  // ── Voice: start recording ─────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (isLoading) return;
    if (!groqApiKey) {
      Alert.alert('API Key Required',
        'Please enter your Groq API key in ⚙️ Settings before using voice input.');
      return;
    }

    try {
      // ← FIX: always clean up any stale recording object first
      if (recordingRef.current) {
        try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {}
        recordingRef.current = null;
      }

      const { status: permStatus } = await Audio.requestPermissionsAsync();
      if (permStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone access is required for voice input.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS:   true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (err) {
      console.error('[Voice] startRecording:', err);
      // Silently handle — don't show alert for minor errors
    }
  }, [groqApiKey, isLoading]);

  // ── Voice: stop recording ──────────────────────────────────────────────
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

      const spinId = `transcribing-${Date.now()}`;
      setMessages(prev => [...prev, {
        id: spinId, role: 'ai', type: 'progress',
        text: '🎙️ Transcribing…', timestamp: new Date(),
      }]);
      setIsLoading(true);

      const transcript = await transcribeAudio(uri, groqApiKey);

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
      setIsRecording(false);
      setMessages(prev => prev.filter(m => !m.id.startsWith('transcribing-')));
      recordingRef.current = null;
      console.error('[Voice] stopRecording:', err.message);
      // Silently fail for minor errors — voice still worked (user saw response)
    }
  }, [groqApiKey, executeCommand, addMessage]);

  // ── Text submit ────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');
    executeCommand(text);
  }, [inputText, isLoading, executeCommand]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 92 : 0}
    >
      {/* Header */}
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

      {/* Chat list */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Recording indicator */}
      {isRecording && (
        <View style={styles.recordingBar}>
          <Animated.View style={[styles.recDot, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.recordingText}>Recording… Release to send</Text>
        </View>
      )}

      {/* Input bar */}
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
          <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={isLoading}>
            <Text style={styles.sendBtnText}>➤</Text>
          </TouchableOpacity>
        ) : (
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

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:           { flex:1, backgroundColor: COLORS.bg },
  header:           { flexDirection:'row', justifyContent:'space-between', alignItems:'center',
                      paddingTop:52, paddingBottom:12, paddingHorizontal:16,
                      backgroundColor: COLORS.card, borderBottomWidth:1, borderBottomColor: COLORS.cardBorder },
  headerTitle:      { color: COLORS.textPrimary, fontSize: SIZES.lg, fontWeight:'800' },
  headerRight:      { flexDirection:'row', alignItems:'center' },
  monBadge:         { backgroundColor: COLORS.nutrientRich + '22', borderColor: COLORS.nutrientRich,
                      borderWidth:1, borderRadius:20, paddingHorizontal:10, paddingVertical:3 },
  monBadgeText:     { color: COLORS.nutrientRich, fontSize:10, fontWeight:'700', letterSpacing:0.5 },
  chatContent:      { padding:12, paddingBottom:8 },
  recordingBar:     { flexDirection:'row', alignItems:'center', justifyContent:'center',
                      backgroundColor: COLORS.depleted + '18', borderTopWidth:1,
                      borderTopColor: COLORS.depleted + '44', paddingVertical:8 },
  recDot:           { width:10, height:10, borderRadius:5, backgroundColor: COLORS.depleted, marginRight:8 },
  recordingText:    { color: COLORS.depleted, fontSize: SIZES.sm, fontWeight:'600' },
  inputBar:         { flexDirection:'row', alignItems:'flex-end', paddingHorizontal:12,
                      paddingVertical:10, backgroundColor: COLORS.card,
                      borderTopWidth:1, borderTopColor: COLORS.cardBorder, columnGap:8 },
  input:            { flex:1, backgroundColor: COLORS.surface, borderRadius:22, borderWidth:1,
                      borderColor: COLORS.cardBorder, paddingHorizontal:16, paddingVertical:10,
                      color: COLORS.textPrimary, fontSize: SIZES.md, maxHeight:120 },
  sendBtn:          { width:44, height:44, borderRadius:22, backgroundColor: COLORS.accent,
                      alignItems:'center', justifyContent:'center' },
  sendBtnText:      { color:'#fff', fontSize:18, fontWeight:'700' },
  micBtn:           { width:44, height:44, borderRadius:22, backgroundColor: COLORS.surface,
                      borderWidth:1, borderColor: COLORS.cardBorder, alignItems:'center', justifyContent:'center' },
  micBtnActive:     { backgroundColor: COLORS.depleted + '33', borderColor: COLORS.depleted },
  micBtnIcon:       { fontSize:20 },
});

const bubSt = StyleSheet.create({
  wrapper:          { flexDirection:'row', marginVertical:5, alignItems:'flex-end', paddingHorizontal:4 },
  aiWrapper:        { justifyContent:'flex-start' },
  userWrapper:      { justifyContent:'flex-end' },
  avatar:           { width:30, height:30, borderRadius:15, backgroundColor: COLORS.surface,
                      alignItems:'center', justifyContent:'center', marginHorizontal:6, flexShrink:0 },
  avatarUser:       { backgroundColor: COLORS.accent + '33' },
  avatarText:       { fontSize:16 },
  bubble:           { maxWidth: SCREEN_W * 0.78, borderRadius:18, paddingHorizontal:14,
                      paddingVertical:10, flexShrink:1 },
  aiBubble:         { backgroundColor: COLORS.card, borderWidth:1, borderColor: COLORS.cardBorder,
                      borderBottomLeftRadius:4 },
  userBubble:       { backgroundColor: COLORS.accent, borderBottomRightRadius:4 },
  errorBubble:      { backgroundColor: COLORS.depleted + '18', borderColor: COLORS.depleted + '55', borderWidth:1 },
  progressBubble:   { backgroundColor: COLORS.surface, borderColor: COLORS.cardBorder + '88', borderWidth:1 },
  text:             { fontSize: SIZES.md, lineHeight:22 },
  aiText:           { color: COLORS.textPrimary },
  userText:         { color:'#fff' },
  errorText:        { color: COLORS.depleted },
  progressText:     { color: COLORS.textSecondary, fontStyle:'italic', fontSize: SIZES.sm },
  ts:               { fontSize:9, color: COLORS.textMuted, marginTop:4, alignSelf:'flex-start' },
  tsUser:           { alignSelf:'flex-end', color:'rgba(255,255,255,0.55)' },
});

const readSt = StyleSheet.create({
  container:  { marginTop:10, borderRadius:10, overflow:'hidden', borderWidth:1, borderColor: COLORS.cardBorder },
  row:        { flexDirection:'row', alignItems:'flex-start', backgroundColor: COLORS.surface, padding:10 },
  rowBorder:  { borderTopWidth:1, borderTopColor: COLORS.cardBorder },
  numBadge:   { width:28, height:28, borderRadius:14, backgroundColor: COLORS.accent + '22',
                borderWidth:1, borderColor: COLORS.accent, alignItems:'center', justifyContent:'center',
                marginRight:10, marginTop:2, flexShrink:0 },
  numText:    { color: COLORS.accent, fontSize:10, fontWeight:'700' },
  dataCol:    { flex:1 },
  time:       { color: COLORS.textMuted, fontSize:10, marginBottom:4 },
  npkRow:     { flexDirection:'row', marginBottom:3 },
  npk:        { fontSize: SIZES.sm, fontWeight:'700' },
  env:        { color: COLORS.textSecondary, fontSize: SIZES.sm, marginBottom:3 },
  cls:        { fontSize: SIZES.sm, fontWeight:'600' },
});
