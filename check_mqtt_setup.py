import socket
import subprocess
import os
import sys

def get_local_ips():
    import re
    ips_with_gateway = []
    ips_without_gateway = []
    
    try:
        output = subprocess.run(["ipconfig"], capture_output=True, text=True, check=False).stdout
        # Split by double newline to separate adapters
        blocks = output.split('\n\n')
        for block in blocks:
            lines = [line.strip() for line in block.split('\n') if line.strip()]
            if not lines:
                continue
            
            ipv4 = None
            gateway = None
            for line in lines:
                if "ipv4 address" in line.lower():
                    match = re.search(r'ipv4 address.*:\s*([0-9\.]+)', line.lower())
                    if match:
                        ipv4 = match.group(1)
                elif "default gateway" in line.lower():
                    # Check if there is a gateway IP listed on the line
                    match = re.search(r'default gateway.*:\s*([0-9\.]+)', line.lower())
                    if match:
                        gateway = match.group(1)
            
            if ipv4 and not ipv4.startswith("127."):
                if gateway:
                    ips_with_gateway.append(ipv4)
                else:
                    ips_without_gateway.append(ipv4)
    except Exception:
        pass

    # Fallback to standard socket methods if ipconfig parsing yields nothing
    if not ips_with_gateway and not ips_without_gateway:
        ips = []
        try:
            hostname = socket.gethostname()
            for ip in socket.gethostbyname_ex(hostname)[2]:
                if not ip.startswith("127."):
                    ips.append(ip)
        except Exception:
            pass
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            primary_ip = s.getsockname()[0]
            s.close()
            if primary_ip not in ips and not primary_ip.startswith("127."):
                ips.insert(0, primary_ip)
        except Exception:
            pass
        return ips
        
    return ips_with_gateway + ips_without_gateway

def check_mosquitto_service():
    print("Checking Mosquitto Broker service status on Windows...")
    try:
        # Run sc query command to check the service
        result = subprocess.run(["sc", "query", "mosquitto"], capture_output=True, text=True, check=False)
        output = result.stdout
        
        if "RUNNING" in output:
            return "RUNNING", "The Mosquitto service is running successfully."
        elif "STOPPED" in output:
            return "STOPPED", "The Mosquitto service is stopped. Start it by running command prompt as Administrator and executing: net start mosquitto"
        elif "does not exist" in output or "FAILED" in result.stderr:
            # Check if mosquitto.exe is in the tasklist (maybe running standalone)
            task_result = subprocess.run(["tasklist"], capture_output=True, text=True, check=False)
            if "mosquitto.exe" in task_result.stdout:
                return "RUNNING", "Mosquitto is running as a standalone process (mosquitto.exe found in task list)."
            return "NOT_INSTALLED", "Mosquitto service was not found. Please install it from https://mosquitto.org/download/"
        else:
            return "UNKNOWN", f"Status unknown. Command output:\n{output.strip()}"
    except Exception as e:
        return "ERROR", f"Error checking service: {str(e)}"

def main():
    print("="*60)
    print("  MQTT / MOSQUITTO BROKER SETUP DIAGNOSTIC")
    print("="*60)
    
    # Get local IPs
    ips = get_local_ips()
    if not ips:
        print("\n[!] Warning: Could not detect any active network interface. Are you connected to Wi-Fi?")
    else:
        print("\nDetected local IP addresses:")
        for idx, ip in enumerate(ips):
            is_lan = ip.startswith("192.168.") or ip.startswith("10.") or ip.startswith("172.")
            tag = " (Preferred LAN subnet)" if is_lan else ""
            print(f"  [{idx + 1}] {ip}{tag}")
            
        primary_ip = ips[0]
        print(f"\n---> Use this IP for your ESP32's MQTT_BROKER: \"{primary_ip}\"")
        print("     Ensure your ESP32 and this laptop are connected to the EXACT SAME Wi-Fi network!")

    print("\n" + "-"*40)
    
    # Check Mosquitto
    status, msg = check_mosquitto_service()
    print(f"Status: {status}")
    print(f"Details: {msg}")
    
    print("\n" + "-"*40)
    print("Quick Command Reference:")
    print("  - Start Mosquitto:    net start mosquitto   (Run Cmd/Powershell as Admin)")
    print("  - Stop Mosquitto:     net stop mosquitto    (Run Cmd/Powershell as Admin)")
    print("  - Run verbosely:      mosquitto -v")
    print("="*60)

if __name__ == "__main__":
    main()
