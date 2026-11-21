@echo off
title National Bank of Egypt - AI-Enhanced RCSA Platform
cd /d %~dp0

echo =======================================================================
echo   National Bank of Egypt (NBE) - Operational Risk RCSA Platform
echo   Platform Startup Script (Windows Local Development)
echo =======================================================================
echo.

REM 1. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH. Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

REM 2. Install dependencies
if not exist node_modules (
    echo [*] Installing Node dependencies from package.json...
    call npm install
)

REM 3. Create persistent data directory if not exists
if not exist data (
    mkdir data
)

REM 4. Launch the integrated Fullstack Server
echo [*] Starting NBE RCSA Fullstack Server on http://localhost:3000...
echo [*] (SQLite persistent database will be verified and initialized automatically)
echo.
npm run dev

pause
