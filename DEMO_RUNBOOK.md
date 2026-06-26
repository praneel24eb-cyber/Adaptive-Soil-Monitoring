# 🌱 Soil Monitor — Demo Runbook

> Every time you want to run a demo, follow these steps in order.

---

## ✅ Pre-Demo Checklist

- [ ] ESP32 is connected to laptop via USB (for Serial Monitor) OR powered independently
- [ ] Phone hotspot **"Raghottam's S24"** is ON
- [ ] Laptop connected to **"Raghottam's S24"** hotspot
- [ ] Phone (Expo Go app) connected to **"Raghottam's S24"** hotspot

---

## Step 1 — Get Laptop IP

Open PowerShell and run:

```powershell
ipconfig | Select-String "IPv4"
```

Note the IP that starts with **10.x.x.x** (e.g. `10.227.166.29`).
This changes every time you reconnect to the hotspot.

---

## Step 2 — Start Mosquitto MQTT Broker

```powershell
net start mosquitto
```

> If it says "already running" that's fine. If it says "service not found":
> ```powershell
> & "C:\Program Files\mosquitto\mosquitto.exe" -v
> ```

---

## Step 3 — Start Node-RED

```powershell
cd "C:\Users\PRANEEL K.A\Desktop\IoT_project"
node-red
```

Then open **http://localhost:1880** in browser.

Import the flow (only needed first time or after reset):
- **☰ Menu → Import → select a file**
- Pick `C:\Users\PRANEEL K.A\Desktop\IoT_project\node_red_firebase_flow.json`
- Click **Import → Deploy**

Verify: Both MQTT nodes show 🟢 **connected**

---

## Step 4 — Start the Mobile App

```powershell
cd "C:\Users\PRANEEL K.A\Desktop\IoT_project\SoilMonitorApp"
npm start
```

Scan the QR code with **Expo Go** on your phone.

---

## Step 5 — Update MQTT Broker IP (if laptop IP changed)

Two options:

### Option A — Via App (no reflash) ✅ Recommended
1. Open app → **🎛️ Device** tab
2. Scroll to **"🔌 MQTT Broker IP"**
3. Enter the IP from Step 1 (e.g. `10.227.166.29`)
4. Tap **✅ Apply Config to ESP32**
5. Wait **15 seconds** → ESP32 auto-reconnects to MQTT

### Option B — Via Arduino IDE (only if ESP32 has old firmware)
Open `data_collection_mqtt.ino` → find line ~54:
```cpp
char cfg_mqttBroker[64] = "10.x.x.x";  // ← update this
```
Change to the new IP → Click **Upload (→)**

---

## Step 6 — Verify Everything is Working

### Check ESP32 Serial Monitor (115200 baud):
```
WiFi connected. IP: 192.168.x.x
[Firebase] Fetching initial config from Firebase...
MQTT connected.
MQTT Publish Success: {"N":200,"P":280,"K":561,...}
```

### Check Node-RED Debug panel (right side):
You should see Firebase responses like `{"name":"-abc123xyz"}`

### Check App:
- **🌱 Dashboard** → Live NPK, moisture, temperature, health score
- **📈 Trends** → Historical charts updating
- **⚙️ Settings** → Shows "● Connected" and last reading time

---

## Troubleshooting

### ESP32 keeps saying `MQTT connection failed, rc=-2`

```powershell
# Check if Mosquitto is listening on port 1883
netstat -an | Select-String ":1883"
# Should show: TCP  0.0.0.0:1883  LISTENING

# Check firewall rule exists
netsh advfirewall firewall show rule name="Mosquitto MQTT 1883"
```

If firewall rule is missing, open PowerShell **as Administrator** and run:
```powershell
netsh advfirewall firewall add rule name="Mosquitto MQTT 1883" dir=in action=allow protocol=TCP localport=1883
```

### App shows "X days ago" / stale data
- Node-RED flow is not deployed → re-import and Deploy
- MQTT nodes show 🔴 disconnected → Mosquitto not running → Step 2

### App shows "Disconnected"
- Firebase rules need to be open → Go to:
  https://console.firebase.google.com/project/soil-monitoring-8b69c/database/soil-monitoring-8b69c-default-rtdb/rules
  Set: `{ "rules": { ".read": true, ".write": true } }` → Publish

### Node-RED not starting
```powershell
# Kill existing node-red process
taskkill /F /IM node.exe
# Then restart
node-red
```

---

## Quick Reference — All Ports

| Service | Port | Purpose |
|---------|------|---------|
| Mosquitto MQTT | 1883 | ESP32 → Node-RED |
| Node-RED | 1880 | http://localhost:1880 |
| Firebase | 443 (HTTPS) | Node-RED → Firebase, App → Firebase, ESP32 → Firebase config |

---

## Architecture (for reference)

```
ESP32 (sensors + ML + CUSUM)
  │
  │── MQTT publish ──▶ Mosquitto :1883
  │                        │
  │                    Node-RED :1880
  │                        │
  │◀── Firebase poll ──▶ Firebase Realtime DB
                              │
                          Mobile App (Expo Go)
                          🌱 Dashboard  📈 Trends
                          🚨 Alerts    🎛️ Device Control
```

---

*Generated: 25-Jun-2026 | RVCE IoT Mini Project*
