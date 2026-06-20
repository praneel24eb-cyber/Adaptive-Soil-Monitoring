/*
  ===================================================================
  Moisture Sensor Calibration Utility
  ===================================================================
  
  Use this sketch to find the exact DRY and WET raw calibration values
  for your capacitive soil moisture sensor.
  
  Instructions:
  1. Upload this sketch to your ESP32.
  2. Open the Serial Monitor and set the baud rate to 115200.
  
  How to calibrate:
  - Step 1: DRY VALUE (0% Moisture)
    Keep the sensor dry in the air (do not touch the metal or PCB).
    Observe the raw values printed on the Serial Monitor. 
    Write down the average value. This is your DRY_VALUE.
    
  - Step 2: WET VALUE (100% Moisture)
    Submerge the sensor probe into a glass of water up to the 
    maximum indicator line (do not submerge the electronics at the top!).
    Observe the raw values printed on the Serial Monitor.
    Write down the average value. This is your WET_VALUE.
    
  - Step 3: Update your main firmware
    Replace the values in your main sketch:
    #define DRY_VALUE <your_dry_value>
    #define WET_VALUE <your_wet_value>
*/

#define MOISTURE_PIN 34 // ADC1_CH6 (Pin 34 on ESP32)

void setup() {
  // Initialize serial communication
  Serial.begin(115200);
  delay(1000);
  
  // Configure analog input resolution to 12-bit (0 - 4095)
  analogReadResolution(12);
  
  Serial.println("============================================");
  Serial.println(" Moisture Sensor Calibration Running...");
  Serial.println("============================================");
}

void loop() {
  // Read raw ADC value
  int rawValue = analogRead(MOISTURE_PIN);
  
  // Calculate voltage (ESP32 ADC is generally non-linear but this gives a rough estimate)
  float voltage = (rawValue * 3.3) / 4095.0;
  
  // Print values to Serial Monitor
  Serial.print("Raw ADC Value: ");
  Serial.print(rawValue);
  Serial.print("  |  Approx. Voltage: ");
  Serial.print(voltage, 2);
  Serial.println(" V");
  
  // Sample every 1 second
  delay(1000);
}
