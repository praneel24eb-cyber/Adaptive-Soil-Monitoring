// ─── Firebase Data Service ────────────────────────────────────────────────
// Replaces MQTT as the data layer. Reads live soil data from Firebase
// Realtime Database using real-time onValue() listeners.
//
// Context shape is identical to mqtt.js so all existing screens work unchanged.
// Both useMqtt() and useData() are exported as aliases of the same hook.
//
// Data written by: Node-RED → Firebase REST API bridge

import React, {
  createContext, useContext, useEffect, useRef, useState, useCallback,
} from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getDatabase, ref, onValue, query, limitToLast, set, get,
} from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEY_THRESHOLDS, DEFAULT_THRESHOLDS } from '../constants';

// ─── Firebase config ─────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyBjpJlHwxssSZ_hleurE_o_e8nIsGBL2fU',
  authDomain:        'soil-monitoring-8b69c.firebaseapp.com',
  databaseURL:       'https://soil-monitoring-8b69c-default-rtdb.firebaseio.com',
  projectId:         'soil-monitoring-8b69c',
  storageBucket:     'soil-monitoring-8b69c.firebasestorage.app',
  messagingSenderId: '911112987129',
  appId:             '1:911112987129:web:8e0e7f1bf60c0b8f509d28',
};

// Initialize Firebase only once (hot-reload safe)
const firebaseApp = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];
const db = getDatabase(firebaseApp);

// ─── Context ──────────────────────────────────────────────────────────────
const DataContext = createContext(null);

/** Primary hook for all screens */
export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside FirebaseProvider');
  return ctx;
};

/** Backward-compatible alias — existing screens can keep `useMqtt()` */
export const useMqtt = useData;

// ─── Threshold checker ───────────────────────────────────────────────────
async function checkThresholds(reading, addAlert) {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY_THRESHOLDS);
    const th = stored ? { ...DEFAULT_THRESHOLDS, ...JSON.parse(stored) } : DEFAULT_THRESHOLDS;
    const breaches = [];

    if (reading.N  !== undefined && reading.N  < th.N_min)        breaches.push(`Nitrogen low (${reading.N} < ${th.N_min} mg/kg)`);
    if (reading.P  !== undefined && reading.P  < th.P_min)        breaches.push(`Phosphorus low (${reading.P} < ${th.P_min} mg/kg)`);
    if (reading.K  !== undefined && reading.K  < th.K_min)        breaches.push(`Potassium low (${reading.K} < ${th.K_min} mg/kg)`);
    if (reading.moisture !== undefined) {
      if (reading.moisture < th.moisture_min) breaches.push(`Moisture low (${reading.moisture}% < ${th.moisture_min}%)`);
      if (reading.moisture > th.moisture_max) breaches.push(`Moisture high (${reading.moisture}% > ${th.moisture_max}%)`);
    }
    if (reading.temp !== undefined && reading.temp > th.temp_max) breaches.push(`Temperature high (${reading.temp}°C > ${th.temp_max}°C)`);

    breaches.forEach(msg => {
      addAlert({
        ...reading,
        type:    'threshold',
        message: msg,
        _local:  true,
      });
    });
  } catch (e) {
    console.warn('[Thresholds] check error:', e.message);
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────
export const FirebaseProvider = ({ children }) => {
  const [status,        setStatus]  = useState('connecting');
  const [latestReading, setLatest]  = useState(null);
  const [history,       setHistory] = useState([]);
  const [alerts,        setAlerts]  = useState([]);
  const [deviceConfig,  setDeviceConfig] = useState(null); // Live config from Firebase

  // Keep unsubscribe functions so we can tear them down on re-connect / unmount
  const unsubsRef = useRef([]);

  const addAlert = useCallback((alert) => {
    setAlerts(prev => [alert, ...prev].slice(0, 100));
  }, []);

  const connect = useCallback(() => {
    // Detach any existing listeners
    unsubsRef.current.forEach(fn => fn());
    unsubsRef.current = [];
    setStatus('connecting');

    try {
      // ── 1. Latest reading (single object, overwritten on every publish) ──
      const latestRef = ref(db, 'soil/readings/latest');
      const unsubLatest = onValue(
        latestRef,
        snapshot => {
          const data = snapshot.val();
          if (!data) return;
          const reading = {
            ...data,
            receivedAt: new Date(data.timestamp ?? Date.now()),
          };
          setLatest(reading);
          setStatus('connected');

          // Drift readings also bubble up as alerts
          if (data.drift === true || data.drift === 1) {
            addAlert({
              ...reading,
              type:    'drift',
              message: 'Drift detected — consider fertilizing',
            });
          }
          // Check user-configured thresholds
          checkThresholds(reading, addAlert);
        },
        error => {
          console.warn('[Firebase] /latest error:', error.message);
          setStatus('error');
        },
      );

      // ── 2. History (last 200 readings, appended via POST push) ───────────
      const historyQ = query(ref(db, 'soil/readings/history'), limitToLast(200));
      const unsubHistory = onValue(
        historyQ,
        snapshot => {
          const data = snapshot.val();
          if (!data) return;
          const arr = Object.values(data).map(r => ({
            ...r,
            receivedAt: new Date(r.timestamp ?? Date.now()),
          }));
          // Oldest → newest order for chart rendering
          arr.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
          setHistory(arr);
          setStatus('connected');
        },
        error => console.warn('[Firebase] /history error:', error.message),
      );

      // ── 3. Alerts (last 50, newest first) ────────────────────────────────
      const alertsQ = query(ref(db, 'soil/alerts'), limitToLast(50));
      const unsubAlerts = onValue(
        alertsQ,
        snapshot => {
          const data = snapshot.val();
          if (!data) return;
          const arr = Object.values(data).map(a => ({
            ...a,
            receivedAt: new Date(a.timestamp ?? Date.now()),
          }));
          arr.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
          setAlerts(prev => {
            // Merge Firebase alerts with any locally-generated drift alerts
            const fbKeys = new Set(arr.map(a => a.timestamp));
            const localOnly = prev.filter(
              a => a._local === true && !fbKeys.has(a.timestamp),
            );
            return [...arr, ...localOnly].slice(0, 100);
          });
        },
        error => console.warn('[Firebase] /alerts error:', error.message),
      );

      // ── 4. Device Config (real-time mirror of what the ESP has applied) ──
      const configRef = ref(db, 'soil/control/config');
      const unsubConfig = onValue(
        configRef,
        snapshot => {
          const data = snapshot.val();
          setDeviceConfig(data ?? null);
        },
        error => console.warn('[Firebase] /config error:', error.message),
      );

      unsubsRef.current = [unsubLatest, unsubHistory, unsubAlerts, unsubConfig];
    } catch (err) {
      console.error('[Firebase] init error:', err);
      setStatus('error');
    }
  }, []);

  // Connect on mount; clean up on unmount
  useEffect(() => {
    connect();
    return () => unsubsRef.current.forEach(fn => fn());
  }, [connect]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setAlerts([]);
  }, []);

  /**
   * Write config to Firebase → ESP32 picks it up within 15 seconds.
   * If resetCUSUM is true, it is automatically cleared after 2 seconds
   * so the ESP only resets once and doesn't keep looping.
   */
  const writeConfig = useCallback(async (config) => {
    try {
      const configRef = ref(db, 'soil/control/config');
      await set(configRef, { ...config, updatedAt: Date.now() });
      // Auto-clear the one-shot resetCUSUM flag
      if (config.resetCUSUM) {
        setTimeout(async () => {
          try {
            const snap = await get(configRef);
            if (snap.exists()) {
              await set(configRef, { ...snap.val(), resetCUSUM: false });
            }
          } catch (e) { console.warn('[Firebase] resetCUSUM clear error:', e); }
        }, 2000);
      }
      return { success: true };
    } catch (err) {
      console.error('[Firebase] writeConfig error:', err);
      return { success: false, error: err.message };
    }
  }, []);

  const value = {
    // ── Core data (same shape as mqtt.js) ─────────────────────────────────
    status,
    latestReading,
    history,
    alerts,
    connect,
    clearHistory,
    // ── Device control ────────────────────────────────────────────────────
    deviceConfig,
    writeConfig,
    // ── Stubs so SettingsScreen destructure doesn't throw ─────────────────
    brokerIp:             'Firebase Realtime DB',
    brokerPort:           'firebaseio.com',
    updateBrokerSettings: () => {},
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};

// Alias so App.js import stays minimal
export const MqttProvider = FirebaseProvider;
