#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>      // Note: Assumes ArduinoJson v6.x
#include <ModbusMaster.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <HTTPClient.h>        // ESP32 built-in — Firebase REST polling
#include <WiFiClientSecure.h>  // ESP32 built-in — HTTPS for Firebase
#include <Preferences.h>       // ESP32 built-in — NVS flash storage
#include <WiFiManager.h>       // Allows dynamic WiFi configuration via AP
#include "model.h"

// ==========================================
// PIN DEFINITIONS
// ==========================================
#define MAX485_DE_RE 23
#define ONE_WIRE_BUS 4
#define MOISTURE_PIN 34

// ==========================================
// MOISTURE CALIBRATION
// ==========================================
#define DRY_VALUE 3065
#define WET_VALUE 1050

// ==========================================
// FIREBASE CONFIG ENDPOINT
// — App writes to this path; ESP reads from it
// ==========================================
#define FIREBASE_DB_URL "https://soil-monitoring-8b69c-default-rtdb.firebaseio.com"
#define FIREBASE_CONFIG_PATH "/soil/control/config.json"

// ==========================================
// WIFI & MQTT CREDENTIALS
// ==========================================
// WIFI_SSID and WIFI_PASSWORD are now managed dynamically by WiFiManager
// const char* WIFI_SSID     = "Raghottam's S24";
// const char* WIFI_PASSWORD = "12347890";

const int   MQTT_PORT     = 1883;
const char* MQTT_CLIENT   = "RVCE_SoilMonitor_ESP32";

// ==========================================
// RUNTIME CONFIG (controlled from Firebase)
// These are the defaults; overridden by NVS/Firebase on boot
// ==========================================
bool  cfg_enableNPK      = true;
bool  cfg_enableTemp     = true;
bool  cfg_enableMoisture = true;
bool  cfg_enableMQTT     = true;
int   cfg_sampleInterval = 30000;  // ms
float cfg_cusumK         = 5.0f;
float cfg_cusumH         = 30.0f;

// Mutable MQTT broker IP (so it can be changed via Firebase without re-flashing)
char  cfg_mqttBroker[64] = "10.227.166.29";  // ← Laptop IP on Raghottam's S24 hotspot

// ==========================================
// OBJECTS
// ==========================================
Preferences prefs;
ModbusMaster node;
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensor(&oneWire);
WiFiClient espClient;
PubSubClient mqtt(espClient);

// ==========================================
// VARIABLES
// ==========================================
int nitrogen   = 0;
int phosphorus = 0;
int potassium  = 0;
float temperature = 0.0;
float moisture    = 0.0;
bool  npkValid    = false;

unsigned long lastSampleTime      = 0;
unsigned long lastConfigCheckTime = 0;
unsigned long lastMqttRetryTime   = 0;
#define CONFIG_CHECK_INTERVAL_MS 15000   // Poll Firebase every 15 seconds
#define MQTT_RETRY_INTERVAL_MS    5000   // Non-blocking MQTT retry every 5 seconds

// CUSUM Drift Detection & Adaptive Calibration
float cusum_score        = 0.0;
float nitrogen_baseline  = 150.0f;
bool  firstSample        = true;
bool  drift_alert        = false;

// ==========================================
// SCALER PARAMETERS & ML INFERENCE
// ==========================================
const float N_mean = 91.639831f;
const float N_std  = 114.690674f;
const float P_mean = 128.389831f;
const float P_std  = 160.618431f;
const float K_mean = 257.186441f;
const float K_std  = 321.136315f;
const float Moisture_mean = 79.708475f;
const float Moisture_std  = 18.567089f;
const float Temperature_mean = 27.871822f;
const float Temperature_std  = 0.711871f;

String runInference(int n, int p, int k, float moist, float temp) {
  double input[5];
  input[0] = (n - N_mean) / N_std;
  input[1] = (p - P_mean) / P_std;
  input[2] = (k - K_mean) / K_std;
  input[3] = (moist - Moisture_mean) / Moisture_std;
  input[4] = (temp  - Temperature_mean) / Temperature_std;

  double result[3];
  score(input, result);

  int maxIdx = 0;
  for (int i = 1; i < 3; i++) {
    if (result[i] > result[maxIdx]) maxIdx = i;
  }
  if (maxIdx == 0) return "Depleted";
  if (maxIdx == 1) return "Moderate";
  return "Nutrient-Rich";
}

// ==========================================
// NVS PREFERENCES (persist config across reboots)
// ==========================================
void loadPrefs() {
  prefs.begin("soilcfg", true); // read-only
  cfg_enableNPK      = prefs.getBool("enNPK",     true);
  cfg_enableTemp     = prefs.getBool("enTemp",     true);
  cfg_enableMoisture = prefs.getBool("enMoist",    true);
  cfg_enableMQTT     = prefs.getBool("enMQTT",     true);
  cfg_sampleInterval = prefs.getInt ("sampInt",    30000);
  cfg_cusumK         = prefs.getFloat("cusumK",    5.0f);
  cfg_cusumH         = prefs.getFloat("cusumH",    30.0f);
  String broker      = prefs.getString("mqttBroker", "10.150.195.29");
  broker.toCharArray(cfg_mqttBroker, sizeof(cfg_mqttBroker));
  prefs.end();
  Serial.println("[Prefs] Config loaded from NVS.");
}

void savePrefs() {
  prefs.begin("soilcfg", false); // read-write
  prefs.putBool  ("enNPK",      cfg_enableNPK);
  prefs.putBool  ("enTemp",     cfg_enableTemp);
  prefs.putBool  ("enMoist",    cfg_enableMoisture);
  prefs.putBool  ("enMQTT",     cfg_enableMQTT);
  prefs.putInt   ("sampInt",    cfg_sampleInterval);
  prefs.putFloat ("cusumK",     cfg_cusumK);
  prefs.putFloat ("cusumH",     cfg_cusumH);
  prefs.putString("mqttBroker", String(cfg_mqttBroker));
  prefs.end();
  Serial.println("[Prefs] Config saved to NVS.");
}

// ==========================================
// FIREBASE CONFIG POLLING
// Reads soil/control/config.json from Firebase REST API
// Works from any network — only requires ESP32 internet access
// ==========================================
void checkFirebaseConfig() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure(); // Skip cert verification — acceptable for local IoT project

  HTTPClient http;
  String url = String(FIREBASE_DB_URL) + FIREBASE_CONFIG_PATH;
  http.begin(client, url);
  http.setTimeout(8000);
  int httpCode = http.GET();

  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    Serial.println("[Firebase] Config payload: " + payload);

    if (payload == "null") {
      Serial.println("[Firebase] No config set yet in Firebase.");
      http.end();
      return;
    }

#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument doc;
#else
    StaticJsonDocument<512> doc;
#endif
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
      Serial.print("[Firebase] JSON parse error: ");
      Serial.println(err.c_str());
      http.end();
      return;
    }

    bool changed = false;

    if (doc.containsKey("enableNPK")) {
      bool v = doc["enableNPK"].as<bool>();
      if (v != cfg_enableNPK) { cfg_enableNPK = v; changed = true; }
    }
    if (doc.containsKey("enableTemp")) {
      bool v = doc["enableTemp"].as<bool>();
      if (v != cfg_enableTemp) { cfg_enableTemp = v; changed = true; }
    }
    if (doc.containsKey("enableMoisture")) {
      bool v = doc["enableMoisture"].as<bool>();
      if (v != cfg_enableMoisture) { cfg_enableMoisture = v; changed = true; }
    }
    if (doc.containsKey("enableMQTT")) {
      bool v = doc["enableMQTT"].as<bool>();
      if (v != cfg_enableMQTT) { cfg_enableMQTT = v; changed = true; }
    }
    if (doc.containsKey("sampleInterval")) {
      int v = doc["sampleInterval"].as<int>();
      if (v >= 3000 && v != cfg_sampleInterval) { cfg_sampleInterval = v; changed = true; }
    }
    if (doc.containsKey("cusumK")) {
      float v = doc["cusumK"].as<float>();
      if (v != cfg_cusumK) { cfg_cusumK = v; changed = true; }
    }
    if (doc.containsKey("cusumH")) {
      float v = doc["cusumH"].as<float>();
      if (v != cfg_cusumH) { cfg_cusumH = v; changed = true; }
    }
    if (doc.containsKey("mqttBroker")) {
      String v = doc["mqttBroker"].as<String>();
      if (v.length() > 0 && v != String(cfg_mqttBroker)) {
        v.toCharArray(cfg_mqttBroker, sizeof(cfg_mqttBroker));
        mqtt.setServer(cfg_mqttBroker, MQTT_PORT);
        mqtt.disconnect(); // Reconnect with new broker
        changed = true;
        Serial.println("[Config] MQTT broker changed to: " + v);
      }
    }
    if (doc.containsKey("resetCUSUM") && doc["resetCUSUM"].as<bool>()) {
      cusum_score      = 0.0f;
      drift_alert      = false;
      firstSample      = true;
      nitrogen_baseline = (float)nitrogen;
      Serial.println("[Config] CUSUM reset by remote command.");
      // Note: app clears this flag itself after sending, so no write-back needed
    }

    if (changed) {
      savePrefs();
      Serial.println("[Config] Config updated and saved.");
      Serial.printf("[Config] NPK=%d Temp=%d Moisture=%d MQTT=%d Interval=%dms K=%.1f H=%.1f\n",
        cfg_enableNPK, cfg_enableTemp, cfg_enableMoisture,
        cfg_enableMQTT, cfg_sampleInterval, cfg_cusumK, cfg_cusumH);
    }
  } else {
    Serial.printf("[Firebase] Config fetch failed, HTTP code: %d\n", httpCode);
  }
  http.end();
}

// ==========================================
// MAX485 CONTROL
// ==========================================
void preTransmission() {
  digitalWrite(MAX485_DE_RE, HIGH);
  delayMicroseconds(100);
}

void postTransmission() {
  delayMicroseconds(100);
  digitalWrite(MAX485_DE_RE, LOW);
}

// ==========================================
// MOISTURE PERCENT
// ==========================================
float readMoisturePercent() {
  int raw = analogRead(MOISTURE_PIN);
  float pct = map(raw, DRY_VALUE, WET_VALUE, 0, 100);
  return constrain(pct, 0.0, 100.0);
}

// ==========================================
// WIFI CONNECTION HELPERS
// ==========================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println("Starting WiFiManager...");
  WiFiManager wifiManager;

  // UNCOMMENT the following line if you truly want to wipe the saved WiFi 
  // password and type it in EVERY SINGLE TIME the ESP32 is powered on:
  // wifiManager.resetSettings();

  // If you don't connect to the Setup AP within 3 minutes, it restarts and tries again
  wifiManager.setConfigPortalTimeout(180);

  // autoConnect attempts to connect to the previously saved WiFi. 
  // If it can't find it (e.g. you changed locations), it creates an Access Point.
  if (!wifiManager.autoConnect("ESP32_Soil_Setup")) {
    Serial.println("Failed to connect and hit timeout. Restarting...");
    delay(3000);
    ESP.restart();
  }

  Serial.println("\nWiFi connected. IP: " + WiFi.localIP().toString());
}

// ==========================================
// MQTT CONNECTION HELPERS
// ==========================================
// Non-blocking: makes ONE connection attempt. Call from loop() on a timer.
void connectMQTT() {
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED) return;

  Serial.print("Attempting MQTT connection to ");
  Serial.print(cfg_mqttBroker);
  Serial.println("...");

  if (mqtt.connect(MQTT_CLIENT)) {
    Serial.println("MQTT connected.");
  } else {
    Serial.print("MQTT connection failed, rc=");
    Serial.print(mqtt.state());
    Serial.println(". Will retry in 5 seconds...");
    // No delay() — caller uses a timer
  }
}

// ==========================================
// MQTT PUBLISH — STATUS HEARTBEAT
// Publishes current config alongside readings
// so the app can confirm what's active
// ==========================================
void publishReadings(int n, int p, int k,
                     float moist, float temp,
                     String fertilityClass,
                     float cusumScore, bool driftAlert) {
  if (!mqtt.connected() || !cfg_enableMQTT) return;

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<384> doc;
#endif
  doc["N"]              = n;
  doc["P"]              = p;
  doc["K"]              = k;
  doc["moisture"]       = moist;
  doc["temp"]           = temp;
  doc["class"]          = fertilityClass;
  doc["cusum"]          = cusumScore;
  doc["drift"]          = driftAlert;
  doc["timestamp"]      = millis();

  // Embed current config state so app can see what's active
  JsonObject cfg        = doc.createNestedObject("cfg");
  cfg["enableNPK"]      = cfg_enableNPK;
  cfg["enableTemp"]     = cfg_enableTemp;
  cfg["enableMoisture"] = cfg_enableMoisture;
  cfg["enableMQTT"]     = cfg_enableMQTT;
  cfg["sampleInterval"] = cfg_sampleInterval;

  char payload[384];
  serializeJson(doc, payload);
  
  if (mqtt.publish("soil/readings", payload)) {
    Serial.println("MQTT Publish Success: " + String(payload));
  } else {
    Serial.println("MQTT Publish Failed!");
  }
}

// ==========================================
// MQTT PUBLISH ALERTS
// ==========================================
void publishAlert(float cusumScore) {
  if (!mqtt.connected() || !cfg_enableMQTT) return;

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<128> doc;
#endif
  doc["type"]       = "DEPLETION_DRIFT";
  doc["cusum"]      = cusumScore;
  doc["timestamp"]  = millis();

  char payload[128];
  serializeJson(doc, payload);
  
  if (mqtt.publish("soil/alerts", payload)) {
    Serial.println("MQTT Alert Publish Success: " + String(payload));
  } else {
    Serial.println("MQTT Alert Publish Failed!");
  }
}

// ==========================================
// DIRECT FIREBASE PUBLISH
// Used when cfg_enableMQTT = false.
// Pushes readings directly to Firebase REST API via HTTPS.
// No broker, no Node-RED, no same-WiFi requirement.
// ==========================================
void publishToFirebase(int n, int p, int k,
                       float moist, float temp,
                       String fertilityClass,
                       float cusumScore, bool driftAlert) {
  if (WiFi.status() != WL_CONNECTED) return;

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<512> doc;
#endif
  doc["N"]         = n;
  doc["P"]         = p;
  doc["K"]         = k;
  doc["moisture"]  = moist;
  doc["temp"]      = temp;
  doc["class"]     = fertilityClass;
  doc["cusum"]     = cusumScore;
  doc["drift"]     = driftAlert;
  doc["timestamp"] = millis();

  // Embed current config so the app's "Active Config" panel still updates
  JsonObject cfg        = doc.createNestedObject("cfg");
  cfg["enableNPK"]      = cfg_enableNPK;
  cfg["enableTemp"]     = cfg_enableTemp;
  cfg["enableMoisture"] = cfg_enableMoisture;
  cfg["enableMQTT"]     = cfg_enableMQTT;
  cfg["sampleInterval"] = cfg_sampleInterval;

  char payload[512];
  serializeJson(doc, payload);

  WiFiClientSecure client;
  client.setInsecure(); // Same as checkFirebaseConfig() — acceptable for IoT demo

  HTTPClient http;

  // 1. PUT /latest (overwrites — app reads this for live dashboard)
  String latestUrl = String(FIREBASE_DB_URL) + "/soil/readings/latest.json";
  http.begin(client, latestUrl);
  http.addHeader("Content-Type", "application/json");
  int code = http.PUT(payload);
  Serial.printf("[Firebase Direct] PUT /latest → HTTP %d\n", code);
  http.end();

  // 2. POST /history (appends — app reads this for Trends chart)
  String histUrl = String(FIREBASE_DB_URL) + "/soil/readings/history.json";
  http.begin(client, histUrl);
  http.addHeader("Content-Type", "application/json");
  code = http.POST(payload);
  Serial.printf("[Firebase Direct] POST /history → HTTP %d\n", code);
  http.end();

  // 3. POST alert if drift detected
  if (driftAlert) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument alertDoc;
#else
    StaticJsonDocument<128> alertDoc;
#endif
    alertDoc["type"]      = "DEPLETION_DRIFT";
    alertDoc["cusum"]     = cusumScore;
    alertDoc["timestamp"] = millis();
    alertDoc["message"]   = "Critical depletion trend detected — consider fertilizing";
    char alertPayload[128];
    serializeJson(alertDoc, alertPayload);

    String alertUrl = String(FIREBASE_DB_URL) + "/soil/alerts.json";
    http.begin(client, alertUrl);
    http.addHeader("Content-Type", "application/json");
    http.POST(alertPayload);
    http.end();
    Serial.println("[Firebase Direct] Alert posted.");
  }
}

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  // Load persisted config from NVS flash (survives reboots)
  loadPrefs();

  // MAX485 pins
  pinMode(MAX485_DE_RE, OUTPUT);
  digitalWrite(MAX485_DE_RE, LOW);

  // NPK SENSOR (Modbus)
  Serial1.begin(9600, SERIAL_8N1, 16, 17);
  node.begin(1, Serial1);
  node.preTransmission(preTransmission);
  node.postTransmission(postTransmission);

  // TEMPERATURE SENSOR
  tempSensor.begin();

  // MOISTURE SENSOR
  pinMode(MOISTURE_PIN, INPUT);
  analogReadResolution(12);

  // Connect to WiFi
  connectWiFi();

  // Configure MQTT with runtime broker (from NVS or default)
  mqtt.setServer(cfg_mqttBroker, MQTT_PORT);

  // Fetch initial config from Firebase on boot
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[Config] Fetching initial config from Firebase...");
    checkFirebaseConfig();
  }

  Serial.println("Timestamp,N,P,K,Moisture,Temperature,Label,CUSUM,DriftAlert");
  Serial.printf("[Config] Active: NPK=%d Temp=%d Moisture=%d MQTT=%d Interval=%dms\n",
    cfg_enableNPK, cfg_enableTemp, cfg_enableMoisture,
    cfg_enableMQTT, cfg_sampleInterval);
}

// ==========================================
// LOOP
// ==========================================
void loop() {
  // Ensure WiFi stays connected
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // ── Non-blocking MQTT retry every 5 seconds ───────────────────────────
  // IMPORTANT: This must NOT use delay() so the Firebase poll always runs.
  if (cfg_enableMQTT && !mqtt.connected() &&
      millis() - lastMqttRetryTime >= MQTT_RETRY_INTERVAL_MS) {
    lastMqttRetryTime = millis();
    connectMQTT();
  }

  mqtt.loop();

  // ── Poll Firebase for config changes every 15 seconds ────────────────
  // This now ALWAYS runs regardless of MQTT state.
  if (millis() - lastConfigCheckTime >= CONFIG_CHECK_INTERVAL_MS) {
    lastConfigCheckTime = millis();
    checkFirebaseConfig();
  }

  // ── Periodic sensor sampling ──────────────────────────────────────────
  if (millis() - lastSampleTime >= (unsigned long)cfg_sampleInterval) {
    lastSampleTime = millis();

    // 1. Read NPK from Modbus (if enabled)
    if (cfg_enableNPK) {
      uint8_t result = node.readHoldingRegisters(0x001E, 3);
      if (result == node.ku8MBSuccess) {
        nitrogen   = node.getResponseBuffer(0);
        phosphorus = node.getResponseBuffer(1);
        potassium  = node.getResponseBuffer(2);
        npkValid   = true;
      } else {
        npkValid = false;
        Serial.println("Modbus read failed! Skipping sample.");
        return;
      }
    } else {
      Serial.println("[Config] NPK sensor disabled — skipping Modbus read.");
      npkValid = false;
    }

    // 2. Read Temperature (if enabled)
    if (cfg_enableTemp) {
      tempSensor.requestTemperatures();
      temperature = tempSensor.getTempCByIndex(0);
      if (temperature == DEVICE_DISCONNECTED_C) {
        Serial.println("Temperature sensor disconnected! Skipping sample.");
        return;
      }
    } else {
      Serial.println("[Config] Temperature sensor disabled.");
      temperature = 0.0f;
    }

    // 3. Read Moisture (if enabled)
    if (cfg_enableMoisture) {
      moisture = readMoisturePercent();
    } else {
      Serial.println("[Config] Moisture sensor disabled.");
      moisture = 0.0f;
    }

    // 4. Run CUSUM Drift Detection (using runtime K & H parameters)
    if (cfg_enableNPK && npkValid) {
      if (firstSample) {
        nitrogen_baseline = (float)nitrogen;
        firstSample       = false;
        cusum_score       = 0.0f;
        drift_alert       = false;
      } else {
        if (!drift_alert) {
          nitrogen_baseline = (0.99f * nitrogen_baseline) + (0.01f * (float)nitrogen);
        }
        float diff  = (nitrogen_baseline - (float)nitrogen) - cfg_cusumK;
        cusum_score = cusum_score + diff;
        if (cusum_score < 0.0f) cusum_score = 0.0f;
        drift_alert = (cusum_score > cfg_cusumH);
      }
    }

    // 5. Run Live ML Inference (only if NPK is valid)
    String mlClass = "Unknown";
    if (cfg_enableNPK && npkValid) {
      mlClass = runInference(nitrogen, phosphorus, potassium, moisture, temperature);
    }

    // 6. Print CSV output to Serial
    Serial.print(millis()); Serial.print(",");
    Serial.print(nitrogen);   Serial.print(",");
    Serial.print(phosphorus); Serial.print(",");
    Serial.print(potassium);  Serial.print(",");
    Serial.print(moisture, 1); Serial.print(",");
    Serial.print(temperature, 2); Serial.print(",");
    Serial.print(mlClass);    Serial.print(",");
    Serial.print(cusum_score, 2); Serial.print(",");
    Serial.println(drift_alert ? "DRIFT_ALERT" : "NORMAL");

    // 7. Publish — dual pipeline based on cfg_enableMQTT
    if (cfg_enableMQTT) {
      // MQTT pipeline: ESP32 → Mosquitto → Node-RED → Firebase
      publishReadings(nitrogen, phosphorus, potassium, moisture, temperature,
                      mlClass, cusum_score, drift_alert);
      if (drift_alert) publishAlert(cusum_score);
    } else {
      // Direct Firebase pipeline: ESP32 → Firebase (no broker/Node-RED needed)
      publishToFirebase(nitrogen, phosphorus, potassium, moisture, temperature,
                        mlClass, cusum_score, drift_alert);
    }
  }
}
