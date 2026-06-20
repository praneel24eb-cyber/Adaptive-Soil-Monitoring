#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>      // Note: Assumes ArduinoJson v6.x
#include <ModbusMaster.h>
#include <OneWire.h>
#include <DallasTemperature.h>
// esp_wpa2.h removed - using personal hotspot (simple WPA2) instead of RVCE enterprise WiFi
#include "model.h"

// ==========================================
// PIN DEFINITIONS
// ==========================================
#define MAX485_DE_RE 23
#define ONE_WIRE_BUS 4
#define MOISTURE_PIN 34

// The system is now in live inference mode. Data collection labels are no longer needed.

// ==========================================
// MOISTURE CALIBRATION
// ==========================================
#define DRY_VALUE 3065
#define WET_VALUE 1050

// ==========================================
// SAMPLING INTERVAL
// ==========================================
#define SAMPLE_INTERVAL_MS 30000

// ==========================================
// WIFI & MQTT CREDENTIALS
// ==========================================
const char* WIFI_SSID     = "Praneelka";   // Phone hotspot name
const char* WIFI_PASSWORD = "praneel16";   // Phone hotspot password

// Laptop's IP on the hotspot network — run ipconfig on laptop after
// connecting to the Praneelka hotspot, then update this value & re-upload
const char* MQTT_BROKER   = "10.237.146.29"; // Laptop IP on Praneelka hotspot
const int   MQTT_PORT     = 1883;
const char* MQTT_CLIENT   = "RVCE_SoilMonitor_ESP32";

// ==========================================
// OBJECTS
// ==========================================
ModbusMaster node;
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensor(&oneWire);
WiFiClient espClient;
PubSubClient mqtt(espClient);

// ==========================================
// VARIABLES
// ==========================================
int nitrogen = 0;
int phosphorus = 0;
int potassium = 0;

float temperature = 0.0;
float moisture = 0.0;

bool npkValid = false;
unsigned long lastSampleTime = 0;

// CUSUM Drift Detection & Adaptive Calibration
float cusum_score = 0.0;
const float CUSUM_K = 5.0f;         // Slack parameter (allowable variation)
const float CUSUM_H = 30.0f;        // Threshold parameter (above this, drift is triggered)
float nitrogen_baseline = 150.0f;   // Adaptive Nitrogen baseline
bool firstSample = true;
bool drift_alert = false;

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

String runInference(int n, int p, int k, float moisture, float temp) {
  double input[5];
  input[0] = (n - N_mean) / N_std;
  input[1] = (p - P_mean) / P_std;
  input[2] = (k - K_mean) / K_std;
  input[3] = (moisture - Moisture_mean) / Moisture_std;
  input[4] = (temp - Temperature_mean) / Temperature_std;

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

  Serial.print("Connecting to hotspot: ");
  Serial.println(WIFI_SSID);

  WiFi.disconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);   // Simple WPA2 — no enterprise auth needed

  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED && attempt < 30) {
    delay(500);
    Serial.print(".");
    attempt++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected. IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nWiFi connection failed! Will retry in the next loop.");
  }
}

// ==========================================
// MQTT CONNECTION HELPERS
// ==========================================
void connectMQTT() {
  while (!mqtt.connected() && WiFi.status() == WL_CONNECTED) {
    Serial.print("Attempting MQTT connection to ");
    Serial.print(MQTT_BROKER);
    Serial.println("...");
    
    if (mqtt.connect(MQTT_CLIENT)) {
      Serial.println("MQTT connected.");
    } else {
      Serial.print("MQTT connection failed, rc=");
      Serial.print(mqtt.state());
      Serial.println(". Retrying in 5 seconds...");
      delay(5000);
    }
  }
}

// ==========================================
// MQTT PUBLISH READINGS
// ==========================================
void publishReadings(int n, int p, int k,
                     float moisture, float temp,
                     String fertilityClass,
                     float cusumScore, bool driftAlert) {
  if (!mqtt.connected()) return;

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<256> doc;
#endif
  doc["N"]          = n;
  doc["P"]          = p;
  doc["K"]          = k;
  doc["moisture"]   = moisture;
  doc["temp"]       = temp;
  doc["class"]      = fertilityClass;
  doc["cusum"]      = cusumScore;
  doc["drift"]      = driftAlert;
  doc["timestamp"]  = millis();

  char payload[256];
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
  if (!mqtt.connected()) return;

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
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);

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

  // Configure MQTT
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);

  // CSV Output Header for Serial loggers
  Serial.println("Timestamp,N,P,K,Moisture,Temperature,Label");
}

// ==========================================
// LOOP
// ==========================================
void loop() {
  // Ensure WiFi and MQTT stay connected
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
  
  if (WiFi.status() == WL_CONNECTED && !mqtt.connected()) {
    connectMQTT();
  }
  
  mqtt.loop();

  // Periodically sample data
  if (millis() - lastSampleTime >= SAMPLE_INTERVAL_MS) {
    lastSampleTime = millis();

    // 1. Read NPK from Modbus
    uint8_t result = node.readHoldingRegisters(0x001E, 3);
    if (result == node.ku8MBSuccess) {
      nitrogen   = node.getResponseBuffer(0);
      phosphorus = node.getResponseBuffer(1);
      potassium  = node.getResponseBuffer(2);
      npkValid = true;
    } else {
      npkValid = false;
      Serial.println("Modbus read failed! Skipping sample.");
      return;
    }

    // 2. Read Temperature
    tempSensor.requestTemperatures();
    temperature = tempSensor.getTempCByIndex(0);
    if (temperature == DEVICE_DISCONNECTED_C) {
      Serial.println("Temperature sensor disconnected! Skipping sample.");
      return;
    }

    // 3. Read Moisture
    moisture = readMoisturePercent();

    // 4. Run CUSUM Drift Detection & Adaptive Calibration
    if (firstSample) {
      nitrogen_baseline = (float)nitrogen;
      firstSample = false;
      cusum_score = 0.0f;
      drift_alert = false;
    } else {
      // Exponential moving average baseline calibration (slow adjustment) if no drift detected
      if (!drift_alert) {
        nitrogen_baseline = (0.99f * nitrogen_baseline) + (0.01f * (float)nitrogen);
      }

      // CUSUM formula for detecting depletion drift (drop in Nitrogen):
      // S_t = max(0, S_{t-1} + (baseline - current_N) - K)
      float diff = (nitrogen_baseline - (float)nitrogen) - CUSUM_K;
      cusum_score = cusum_score + diff;
      if (cusum_score < 0.0f) {
        cusum_score = 0.0f;
      }

      // Check if CUSUM score exceeds threshold
      drift_alert = (cusum_score > CUSUM_H);
    }

    // 5. Run Live ML Inference
    String mlClass = runInference(nitrogen, phosphorus, potassium, moisture, temperature);

    // 6. Print CSV output to Serial (for data logging/backward compatibility)
    Serial.print(millis());
    Serial.print(",");
    Serial.print(nitrogen);
    Serial.print(",");
    Serial.print(phosphorus);
    Serial.print(",");
    Serial.print(potassium);
    Serial.print(",");
    Serial.print(moisture, 1);
    Serial.print(",");
    Serial.print(temperature, 2);
    Serial.print(",");
    Serial.print(mlClass);
    Serial.print(",");
    Serial.print(cusum_score, 2);
    Serial.print(",");
    Serial.println(drift_alert ? "DRIFT_ALERT" : "NORMAL");

    // 7. Publish to MQTT
    publishReadings(nitrogen, phosphorus, potassium, moisture, temperature, mlClass, cusum_score, drift_alert);

    // 8. Publish to soil/alerts if drift detected
    if (drift_alert) {
      publishAlert(cusum_score);
    }
  }
}
