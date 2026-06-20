// ─── MQTT Connection Service ──────────────────────────────────────────
// Manages the MQTT WebSocket connection to Mosquitto broker.
// Provides a React Context so all screens can access live sensor data.

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { init as initMqtt } from './mqttShim';

const STORAGE_KEY_IP   = '@mqtt_broker_ip';
const STORAGE_KEY_PORT = '@mqtt_broker_port';
const DEFAULT_IP       = '172.17.0.213';  // Last known RVCE IP
const DEFAULT_PORT     = '9001';

// ─── Context ──────────────────────────────────────────────────────────
const MqttContext = createContext(null);

export const useMqtt = () => {
  const ctx = useContext(MqttContext);
  if (!ctx) throw new Error('useMqtt must be used within MqttProvider');
  return ctx;
};

// ─── Provider ─────────────────────────────────────────────────────────
export const MqttProvider = ({ children }) => {
  const [status, setStatus]         = useState('disconnected'); // 'connected' | 'connecting' | 'disconnected'
  const [latestReading, setLatest]  = useState(null);
  const [history, setHistory]       = useState([]);             // last 200 readings
  const [alerts, setAlerts]         = useState([]);             // drift alerts
  const [brokerIp, setBrokerIp]     = useState(DEFAULT_IP);
  const [brokerPort, setBrokerPort] = useState(DEFAULT_PORT);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const clientRef = useRef(null);

  // Load saved settings
  useEffect(() => {
    (async () => {
      try {
        const savedIp   = await AsyncStorage.getItem(STORAGE_KEY_IP);
        const savedPort = await AsyncStorage.getItem(STORAGE_KEY_PORT);
        if (savedIp)   setBrokerIp(savedIp);
        if (savedPort) setBrokerPort(savedPort);
      } catch (e) {
        console.warn('Failed to load MQTT settings:', e);
      } finally {
        setIsSettingsLoaded(true);
      }
    })();
  }, []);

  // Connect to broker
  const connect = useCallback(() => {
    // Disconnect existing client
    if (clientRef.current) {
      try { clientRef.current.end(true); } catch (_) {}
      clientRef.current = null;
    }

    setStatus('connecting');
    const url = `ws://${brokerIp}:${brokerPort}/mqtt`;
    console.log(`[MQTT] Connecting to ${url}`);

    const client = initMqtt(url, {
      clientId: `SoilMonitorApp_${Math.random().toString(16).slice(2, 8)}`,
      keepalive: 30,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    });

    client.on('connect', () => {
      console.log('[MQTT] Connected');
      setStatus('connected');
      client.subscribe('soil/readings', { qos: 0 });
      client.subscribe('soil/alerts',   { qos: 0 });
    });

    client.on('message', (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString());
        const reading = {
          ...data,
          receivedAt: new Date(),
        };

        if (topic === 'soil/readings') {
          setLatest(reading);
          setHistory(prev => {
            const next = [...prev, reading];
            return next.length > 200 ? next.slice(-200) : next;
          });

          // If drift is detected, also log as alert
          if (data.drift === true || data.drift === 1) {
            setAlerts(prev => [{
              ...reading,
              type: 'drift',
              message: 'Drift detected — consider fertilizing',
            }, ...prev].slice(0, 100));
          }
        }

        if (topic === 'soil/alerts') {
          setAlerts(prev => [{
            ...reading,
            type: 'alert',
            message: data.message || 'Alert received',
          }, ...prev].slice(0, 100));
        }
      } catch (e) {
        console.warn('[MQTT] Parse error:', e);
      }
    });

    client.on('error', (err) => {
      console.warn('[MQTT] Error:', err.message);
      setStatus('disconnected');
    });

    client.on('close', () => {
      console.log('[MQTT] Disconnected');
      setStatus('disconnected');
    });

    client.on('reconnect', () => {
      console.log('[MQTT] Reconnecting...');
      setStatus('connecting');
    });

    clientRef.current = client;
  }, [brokerIp, brokerPort]);

  // Auto-connect when settings are loaded and settings change
  useEffect(() => {
    if (!isSettingsLoaded) return;
    connect();
    return () => {
      if (clientRef.current) {
        try { clientRef.current.end(true); } catch (_) {}
      }
    };
  }, [connect, isSettingsLoaded]);

  // Save settings
  const updateBrokerSettings = useCallback(async (ip, port) => {
    setBrokerIp(ip);
    setBrokerPort(port);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_IP, ip);
      await AsyncStorage.setItem(STORAGE_KEY_PORT, port);
    } catch (e) {
      console.warn('Failed to save MQTT settings:', e);
    }
  }, []);

  // Clear history
  const clearHistory = useCallback(() => {
    setHistory([]);
    setAlerts([]);
  }, []);

  const value = {
    status,
    latestReading,
    history,
    alerts,
    brokerIp,
    brokerPort,
    connect,
    updateBrokerSettings,
    clearHistory,
  };

  return (
    <MqttContext.Provider value={value}>
      {children}
    </MqttContext.Provider>
  );
};
