# 🌱 Soil Monitor — Complete Data Flow Explained

---

## 1. DATA FLOW — How the app receives sensor readings

```
┌─────────────────────────────────────────────────────────────┐
│                        ESP32                                │
│                                                             │
│  Sensors → Read every 30s (configurable)                   │
│  ├── NPK Sensor (Modbus RS485)  → N, P, K values           │
│  ├── DS18B20 (OneWire)          → Temperature              │
│  └── Capacitive ADC (Pin 34)    → Moisture %               │
│                                                             │
│  Processing:                                                │
│  ├── ML Inference (model.h)     → Fertility Class          │
│  └── CUSUM Algorithm            → Drift Detection          │
│                                                             │
│  Publishes JSON to MQTT topic: soil/readings               │
└──────────────────────┬──────────────────────────────────────┘
                       │ MQTT (TCP port 1883)
                       │ Same WiFi network required
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Mosquitto MQTT Broker (Laptop)                 │
│                    localhost:1883                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Node-RED (Laptop)                         │
│                   localhost:1880                             │
│                                                             │
│  Subscribe readings (soil/readings)                         │
│       │                                                     │
│       ▼                                                     │
│  Format Readings function:                                  │
│  ├── msg.payload.timestamp = Date.now()  ← Server time     │
│  ├── PUT  → Firebase /soil/readings/latest  (overwrites)   │
│  └── POST → Firebase /soil/readings/history (appends)      │
│                                                             │
│  Subscribe alerts (soil/alerts)                             │
│       │                                                     │
│       ▼                                                     │
│  Format Alerts function:                                    │
│  └── POST → Firebase /soil/alerts                          │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS REST API
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           Firebase Realtime Database                        │
│   soil-monitoring-8b69c-default-rtdb.firebaseio.com        │
│                                                             │
│   soil/                                                     │
│   ├── readings/                                             │
│   │   ├── latest    ← Single object, always overwritten    │
│   │   └── history/  ← Array of last 200 readings           │
│   ├── alerts/       ← Last 50 drift alerts                 │
│   └── control/      ← Config set by the app               │
│       └── config    ← ESP32 polls this every 15s           │
└──────────────────────┬──────────────────────────────────────┘
                       │ Firebase SDK (real-time WebSocket)
                       │ Works on ANY network!
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Mobile App (Expo Go)                      │
│                                                             │
│  firebaseService.js — 3 onValue() listeners:               │
│  ├── /latest   → latestReading state → Dashboard cards     │
│  ├── /history  → history[] state    → Trends charts        │
│  ├── /alerts   → alerts[] state     → Alerts screen        │
│  └── /control/config → deviceConfig → Device Control UI    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. PARAMETER SETTING FLOW — How Device Control works

```
┌─────────────────────────────────────────────────────────────┐
│              Mobile App — 🎛️ Device Control Tab            │
│                                                             │
│  User changes:                                              │
│  ├── enableNPK      = false  (toggle OFF)                  │
│  ├── sampleInterval = 10000  (10 seconds)                  │
│  ├── cusumH         = 50.0   (raise threshold)             │
│  └── mqttBroker     = "10.227.166.29"                      │
│                                                             │
│  Tap "✅ Apply Config to ESP32"                            │
│       │                                                     │
│       ▼                                                     │
│  writeConfig() in firebaseService.js                       │
│  → Firebase set() writes to soil/control/config            │
└──────────────────────┬──────────────────────────────────────┘
                       │ Firebase SDK write (HTTPS)
                       │ Works on ANY network!
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           Firebase /soil/control/config                     │
│   {                                                         │
│     "enableNPK":      false,                               │
│     "enableTemp":     true,                                │
│     "enableMoisture": true,                                │
│     "enableMQTT":     true,                                │
│     "sampleInterval": 10000,                               │
│     "cusumK":         5.0,                                 │
│     "cusumH":         50.0,                                │
│     "mqttBroker":     "10.227.166.29",                     │
│     "updatedAt":      1719312600000                        │
│   }                                                         │
└──────────────────────┬──────────────────────────────────────┘
                       │ ESP32 polls this every 15 seconds
                       │ via HTTPS GET (WiFiClientSecure)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              ESP32 — checkFirebaseConfig()                  │
│                                                             │
│  Every 15 seconds:                                          │
│  → GET https://...firebaseio.com/soil/control/config.json  │
│  → Parse JSON response                                      │
│  → Apply changes:                                           │
│      cfg_enableNPK = false     ← Stop Modbus reads        │
│      cfg_sampleInterval = 10000 ← Sample every 10s        │
│      cfg_cusumH = 50.0          ← New CUSUM threshold     │
│      cfg_mqttBroker = new IP    ← Reconnect MQTT          │
│  → Save to NVS flash (Preferences)                         │
│      ← Survives reboot without WiFi!                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Special Case — resetCUSUM

```
App sends: { "resetCUSUM": true }
                │
                ▼
         Firebase updated
                │
         ESP32 polls (15s)
                │
                ▼
    cusum_score = 0.0
    firstSample = true
    drift_alert = false
                │
    App auto-clears after 2s:
    { "resetCUSUM": false }
    (so ESP32 only resets once)
```

---

## 4. What works cross-network vs same-network

| Feature | Requires same WiFi? | How |
|---------|-------------------|-----|
| App reads sensor data | ❌ No | Firebase (internet) |
| App receives alerts | ❌ No | Firebase (internet) |
| App sends config to ESP32 | ❌ No | Firebase (internet) |
| ESP32 picks up config | ❌ No | Firebase (internet) |
| ESP32 → MQTT → Node-RED | ✅ Yes | Direct TCP on local network |
| Node-RED → Firebase | ❌ No | HTTPS (internet) |

> **Only the ESP32↔MQTT↔Node-RED leg needs the same WiFi.**
> Everything else goes through Firebase and works from anywhere.

---

## 5. Threshold Alerts (in-app only, no ESP32 involved)

```
firebaseService.js receives new reading
        │
        ▼
checkThresholds(reading) runs:
├── N  < 100 mg/kg?  → "🚨 THRESHOLD: Nitrogen low"
├── P  < 50 mg/kg?   → "🚨 THRESHOLD: Phosphorus low"
├── K  < 75 mg/kg?   → "🚨 THRESHOLD: Potassium low"
├── moisture < 20%?  → "🚨 THRESHOLD: Moisture low"
├── moisture > 85%?  → "🚨 THRESHOLD: Moisture high"
└── temp > 40°C?     → "🚨 THRESHOLD: Temperature high"
        │
        ▼
Added to alerts[] state → shown in 🚨 Alerts tab
(These are generated IN the app, not by ESP32)
```

---

*RVCE IoT Mini Project — ESP32 + MQTT + Node-RED + Firebase + React Native*
