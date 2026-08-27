@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM RCA Tool — Windows Startup Script (Production)
REM Builds React frontend, installs backend deps, starts FastAPI server
REM Run from the rca-tool\ directory: start.bat
REM ─────────────────────────────────────────────────────────────────────────────

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║     Resources ^& Claims Analysis Tool — Startup       ║
echo ╚══════════════════════════════════════════════════════╝
echo.

REM ── 1. Frontend build ────────────────────────────────────────────────────────
echo ^▸ Installing frontend dependencies...
cd frontend
call npm install --silent
if %ERRORLEVEL% neq 0 ( echo ERROR: npm install failed & exit /b 1 )

echo ^▸ Building React frontend...
call npm run build
if %ERRORLEVEL% neq 0 ( echo ERROR: npm build failed & exit /b 1 )

echo ✓ Frontend built to frontend\dist
cd ..

REM ── 2. Backend virtual environment ───────────────────────────────────────────
echo.
echo ^▸ Setting up Python environment...
cd backend

if not exist venv (
    python -m venv venv
    echo   Created Python virtual environment
)

call venv\Scripts\activate.bat
pip install -q -r requirements.txt
if %ERRORLEVEL% neq 0 ( echo ERROR: pip install failed & exit /b 1 )
echo ✓ Backend dependencies installed

REM ── 3. Start server ──────────────────────────────────────────────────────────
echo.
echo ^▸ Starting server at http://localhost:8000
echo   Press Ctrl+C to stop
echo.

uvicorn main:app --host 0.0.0.0 --port 8000
