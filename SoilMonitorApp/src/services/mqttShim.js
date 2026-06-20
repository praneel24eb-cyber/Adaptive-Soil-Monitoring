// ─── MQTT Shim for React Native ───────────────────────────────────────
// mqtt v5.15+ has built-in react-native export (dist/mqtt.esm.js)
// that uses WebSocket transport. This shim re-exports the connect fn.

import mqtt from 'mqtt';

export const init = (brokerUrl, options) => {
  return mqtt.connect(brokerUrl, {
    ...options,
    protocol: 'ws',
  });
};
