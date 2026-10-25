@echo off
title Legion System - Stop Services
color 0C

echo ======================================================================
echo                  STOPPING LEGION SERVICES
echo ======================================================================
echo.

echo [INFO] Terminating processes on Port 5000 (Backend API)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>nul

echo [INFO] Terminating processes on Port 5173 (Frontend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>nul

echo.
echo ======================================================================
echo [OK] All Legion services have been stopped.
echo ======================================================================
echo.
ping 127.0.0.1 -n 3 >nul
