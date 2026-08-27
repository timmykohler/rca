#!/usr/bin/env bash
# Dev mode: Vite dev server + FastAPI with hot reload running concurrently
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting development servers..."
echo "  Frontend:  http://localhost:5173"
echo "  Backend:   http://localhost:8000"
echo "  API docs:  http://localhost:8000/docs"
echo ""

# Kill both on exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT

# Backend
cd "$SCRIPT_DIR/backend"
if [ -d "venv" ]; then source venv/bin/activate; fi
uvicorn main:app --reload --port 8000 &

# Frontend
cd "$SCRIPT_DIR/frontend"
npm run dev &

wait
