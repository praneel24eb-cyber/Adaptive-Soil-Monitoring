// ─── mqtt.js ──────────────────────────────────────────────────────────────
// Kept for backward compatibility.
// All screens that import useMqtt / MqttProvider from here now get the
// Firebase-backed implementation from firebaseService.js.
// Nothing else in this file is used anymore.

export {
  useMqtt,
  useData,
  MqttProvider,
  FirebaseProvider,
} from './firebaseService';
