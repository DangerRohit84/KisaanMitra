@echo off
REM KisaanMitra MVP - double-click to start backend + frontend.
REM Usage: start.bat [port]   (e.g. start.bat 8082; omit for auto 8080-else-8081)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
if errorlevel 1 pause
