@echo off
REM Launch RaceLog - Starts server and opens browser
cd /d "%~dp0"

REM Start the server in a minimized window
start "RaceLog Server" /min RaceLog.exe

REM Wait for server to start (2 seconds)
timeout /t 2 /nobreak >nul

REM Open the browser
start "" "http://localhost:3000"
