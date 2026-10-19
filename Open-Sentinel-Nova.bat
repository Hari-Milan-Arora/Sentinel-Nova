@echo off
setlocal
cd /d "%~dp0"

echo.
echo Sentinel Nova startup checks
echo ----------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo FAIL Node.js is not installed or is not on PATH.
  goto :not_ready
)
where npm >nul 2>nul
if errorlevel 1 (
  echo FAIL npm is not installed or is not on PATH.
  goto :not_ready
)

call npm run check:ready
if errorlevel 1 goto :not_ready

echo.
echo Starting API in a separate Command Prompt...
start "Sentinel Nova API - port 3001" /D "%~dp0" cmd /k "set SENTINEL_NOVA_API_ONLY=true && set PORT=3001 && npm run dev:server"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$until=(Get-Date).AddSeconds(30); $ready=$false; while ((Get-Date) -lt $until) { $client=[System.Net.Sockets.TcpClient]::new(); try { $client.Connect('127.0.0.1',3001); $ready=$true; break } catch { Start-Sleep -Milliseconds 300 } finally { $client.Dispose() } }; if (-not $ready) { exit 1 }"
if errorlevel 1 (
  echo FAIL API did not open port 3001 within 30 seconds. Check the API terminal for the startup error.
  goto :not_ready
)

echo Starting Vite frontend in a separate Command Prompt...
start "Sentinel Nova Frontend - port 3000" /D "%~dp0" cmd /k "npm run dev:frontend"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
echo.
echo Sentinel Nova is opening at http://localhost:3000
echo API terminal: port 3001   Frontend terminal: port 3000
echo Keep both terminal windows open while using the application.
echo JSON storage is local, unencrypted, and single-process only.
goto :eof

:not_ready
echo.
echo Sentinel Nova was not launched. Review the failed checks above and complete the missing setup.
echo Common setup: npm install, copy .env.example to .env, configure matching Google OAuth client IDs and a 32+ character AUTH_SECRET.
echo Gemini is required for live LLM features; without it only deterministic fallback behavior is available.
pause
exit /b 1
