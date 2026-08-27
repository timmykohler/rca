@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM RCA Tool — Windows Dev Script
REM Opens backend and frontend in two separate terminal windows.
REM Run from the rca-tool\ directory: dev.bat
REM ─────────────────────────────────────────────────────────────────────────────

echo Starting RCA Tool in development mode...
echo.
echo   Backend:   http://localhost:8000
echo   Frontend:  http://localhost:5173
echo   API docs:  http://localhost:8000/docs
echo.
echo Two windows will open — keep both running.
echo Close this window or press Ctrl+C in each to stop.
echo.

REM Set the root directory so both windows know where they are
set ROOT=%~dp0

REM ── Backend window ────────────────────────────────────────────────────────────
start "RCA Backend" cmd /k "cd /d %ROOT%backend && (if not exist venv python -m venv venv) && call venv\Scripts\activate.bat && pip install -q -r requirements.txt && uvicorn main:app --reload --port 8000"

REM ── Frontend window ───────────────────────────────────────────────────────────
start "RCA Frontend" cmd /k "cd /d %ROOT%frontend && npm install --silent && npm run dev"

echo Both servers are starting in separate windows.
echo.
pause
