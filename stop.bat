@echo off
REM KisaanMitra MVP - double-click to stop backend + frontend (node on 8080/8081/5173).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1" %*
pause
