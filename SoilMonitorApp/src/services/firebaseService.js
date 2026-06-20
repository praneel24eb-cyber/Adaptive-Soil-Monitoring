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
  getDatabase, ref, onValue, query, limitToLast,
} from 'firebase/database';

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

// ─── Provider ─────────────────────────────────────────────────────────────
export const FirebaseProvider = ({ children }) => {
  const [status,        setStatus]  = useState('connecting');
  const [latestReading, setLatest]  = useState(null);
  const [history,       setHistory] = useState([]);
  const [alerts,        setAlerts]  = useState([]);

  // Keep unsubscribe functions so we can tear them down on re-connect / unmount
  const unsubsRef = useRef([]);

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
            setAlerts(prev => [{
              ...reading,
              type:    'drift',
              message: 'Drift detected — consider fertilizing',
            }, ...prev].slice(0, 100));
          }
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

      unsubsRef.current = [unsubLatest, unsubHistory, unsubAlerts];
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

  const value = {
    // ── Core data (same shape as mqtt.js) ─────────────────────────────────
    status,
    latestReading,
    history,
    alerts,
    connect,
    clearHistory,
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
