#!/usr/bin/env python3
# ─── publish_mock_data.py ──────────────────────────────────────────────
# Publishes simulated soil data to the Mosquitto broker.
# Use this to test the mobile app without having hardware connected.

import sys
import time
import json
import random

# Auto-install paho-mqtt if missing
try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("Installing paho-mqtt package...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paho-mqtt"])
    import paho.mqtt.client as mqtt

BROKER = "127.0.0.1"  # Localhost is fine since this runs on the same PC
PORT = 1883

def main():
    client = mqtt.Client()
    print(f"Connecting to MQTT Broker at {BROKER}:{PORT}...")
    try:
        client.connect(BROKER, PORT, 60)
    except Exception as e:
        print(f"Error connecting: {e}")
        print("Please ensure Mosquitto broker is running.")
        sys.exit(1)

    print("Connected successfully!")
    print("Publishing mock data to 'soil/readings' and 'soil/alerts' every 3 seconds.")
    print("Press Ctrl+C to stop.")

    # Base values
    n = 750
    p = 800
    k = 900
    moisture = 75.0
    temp = 25.0
    cusum = 0.0

    try:
        step = 0
        while True:
            # Simulate a rapid depletion trend over time (6-step cycle)
            step += 1
            if step % 6 < 3:
                # Normal state: healthy fertile baseline
                n = 750 + random.randint(-10, 10)
                p = 800 + random.randint(-5, 5)
                k = 900 + random.randint(-10, 10)
                moisture = 75.0 + random.uniform(-1, 1)
                temp = 25.0 + random.uniform(-0.2, 0.2)
                cusum = max(0.0, cusum - 1.0)
                drift_alert = False
                fertility_class = "Nutrient-Rich"
            else:
                # Depletion / Drift state: values drop rapidly
                n -= random.randint(120, 180)  # Steeper drop
                p -= random.randint(80, 120)
                k -= random.randint(120, 180)
                moisture -= random.uniform(8.0, 15.0)
                
                n = max(30, n)
                p = max(30, p)
                k = max(30, k)
                moisture = max(20, moisture)

                cusum += random.uniform(2.5, 4.0)  # Fast CUSUM increase
                drift_alert = cusum > 5.0
                fertility_class = "Moderate" if n > 300 else "Depleted"

            # Create soil readings payload
            payload = {
                "N": int(n),
                "P": int(p),
                "K": int(k),
                "moisture": round(moisture, 1),
                "temp": round(temp, 1),
                "class": fertility_class,
                "cusum": round(cusum, 2),
                "drift": drift_alert,
                "timestamp": int(time.time() * 1000)
            }

            client.publish("soil/readings", json.dumps(payload))
            print(f"Published reading: N={payload['N']} P={payload['P']} K={payload['K']} Moisture={payload['moisture']}% Class={payload['class']} CUSUM={payload['cusum']} Drift={payload['drift']}")

            # If drift is active, publish an alert event
            if drift_alert:
                alert_payload = {
                    "type": "DEPLETION_DRIFT",
                    "cusum": round(cusum, 2),
                    "timestamp": int(time.time() * 1000),
                    "message": "Critical depletion trend detected — consider fertilizing"
                }
                client.publish("soil/alerts", json.dumps(alert_payload))
                print(f"  [ALERT] Published drift alert: CUSUM={alert_payload['cusum']}")

            # Cycle reset
            if step % 6 == 5:
                n, p, k, moisture, cusum = 750, 800, 900, 80.0, 0.0
                print("--- Resetting soil parameters to fertile baseline ---")

            time.sleep(3)

    except KeyboardInterrupt:
        print("\nStopping data publisher.")
        client.disconnect()

if __name__ == "__main__":
    main()
