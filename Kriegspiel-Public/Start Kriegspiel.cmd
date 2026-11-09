@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo This browser game needs Node.js 20 or newer on the host computer.
  pause
  exit /b 1
)
node server.mjs --lan
if errorlevel 1 pause
