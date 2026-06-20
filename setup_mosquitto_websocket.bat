@echo off
echo Adding WebSocket listener to Mosquitto config...
echo. >> "C:\Program Files\mosquitto\mosquitto.conf"
echo # WebSocket listener for mobile app >> "C:\Program Files\mosquitto\mosquitto.conf"
echo listener 9001 >> "C:\Program Files\mosquitto\mosquitto.conf"
echo protocol websockets >> "C:\Program Files\mosquitto\mosquitto.conf"
echo allow_anonymous true >> "C:\Program Files\mosquitto\mosquitto.conf"
echo.
echo Done! Now restarting Mosquitto...
net stop mosquitto
timeout /t 2
net start mosquitto
echo.
echo Mosquitto restarted with WebSocket support on port 9001.
pause
