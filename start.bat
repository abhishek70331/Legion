@echo off
setlocal enabledelayedexpansion
title Legion Ultrasonic Testing System - Launcher
color 0B

echo ======================================================================
echo          LEGION SYSTEM - INSULATOR ULTRASONIC TESTING SUITE
echo ======================================================================
echo.

:: 1. Verify Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Resolve Paths
set "CURRENT_DIR=%~dp0"
if exist "%CURRENT_DIR%backend" (
    set "BACKEND_DIR=%CURRENT_DIR%backend"
    set "FRONTEND_DIR=%CURRENT_DIR%frontend"
) else if exist "%CURRENT_DIR%NDT\backend" (
    set "BACKEND_DIR=%CURRENT_DIR%NDT\backend"
    set "FRONTEND_DIR=%CURRENT_DIR%NDT\frontend"
) else if exist "D:\ntd test\legion NTD\NDT\backend" (
    set "BACKEND_DIR=D:\ntd test\legion NTD\NDT\backend"
    set "FRONTEND_DIR=D:\ntd test\legion NTD\NDT\frontend"
) else (
    color 0C
    echo [ERROR] Could not locate backend and frontend folders.
    pause
    exit /b 1
)

echo [OK] Located project directories:
echo      Backend:  "%BACKEND_DIR%"
echo      Frontend: "%FRONTEND_DIR%"
echo.

:: 3. Free up ports 5000 and 5173 if already running from previous session
echo [INFO] Checking for previous instances on ports 5000 and 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do (
    echo   Releasing port 5000 (PID %%a)...
    taskkill /F /PID %%a >nul 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo   Releasing port 5173 (PID %%a)...
    taskkill /F /PID %%a >nul 2>nul
)
ping 127.0.0.1 -n 2 >nul

:: 4. Check Backend Dependencies
if not exist "%BACKEND_DIR%\node_modules" (
    echo [INFO] Backend node_modules not found. Installing dependencies...
    cd /d "%BACKEND_DIR%"
    call npm install
    if !ERRORLEVEL! neq 0 (
        color 0C
        echo [ERROR] Failed to install backend dependencies.
        pause
        exit /b 1
    )
)

:: 5. Check Frontend Dependencies
if not exist "%FRONTEND_DIR%\node_modules" (
    echo [INFO] Frontend node_modules not found. Installing dependencies...
    cd /d "%FRONTEND_DIR%"
    call npm install
    if !ERRORLEVEL! neq 0 (
        color 0C
        echo [ERROR] Failed to install frontend dependencies.
        pause
        exit /b 1
    )
)

echo.
echo ======================================================================
echo Starting Legion Services...
echo ======================================================================

:: 6. Launch Backend Server in new window
echo [1/2] Launching Backend Server (Port 5000)...
start "Legion Backend API [Port 5000]" /D "%BACKEND_DIR%" cmd.exe /k "color 0A && npm start"

:: Small delay to let backend bind port
ping 127.0.0.1 -n 4 >nul

:: 7. Launch Frontend Dev Server in new window
echo [2/2] Launching Frontend Interface (Port 5173)...
start "Legion Frontend [Port 5173]" /D "%FRONTEND_DIR%" cmd.exe /k "color 09 && npm run dev"

:: Small delay before opening browser
ping 127.0.0.1 -n 4 >nul

:: 8. Open Browser
echo.
echo [LAUNCH] Opening Legion Workspace in default browser...
start http://localhost:5173

echo.
echo ======================================================================
echo                    LEGION APPLICATION IS RUNNING
echo ======================================================================
echo.
echo   Frontend URL:   http://localhost:5173
echo   Backend API:    http://localhost:5000/api
echo.
echo   Sign in through the web portal using your configured accounts.
echo   No passwords or credentials are hardcoded in scripts or .env.
echo.
echo   Keep the Backend and Frontend command windows open.
echo   To shut down services at any time, run stop.bat or close their windows.
echo ======================================================================
echo.
pause
