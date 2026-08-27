#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# RCA Tool — Internal Deployment Script
# Builds React frontend, installs backend deps, starts FastAPI server
# ──────────────────────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$SCRIPT_DIR/frontend"
BACKEND="$SCRIPT_DIR/backend"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║     Resources & Claims Analysis Tool — Startup       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 1. Frontend build ─────────────────────────────────────────────────────────
echo "▸ Installing frontend dependencies..."
cd "$FRONTEND"
npm install --silent

echo "▸ Building React frontend..."
npm run build

echo "✓ Frontend built to frontend/dist"

# ── 2. Backend dependencies ───────────────────────────────────────────────────
echo ""
echo "▸ Installing backend dependencies..."
cd "$BACKEND"

if [ ! -d "venv" ]; then
  python -m venv venv
  echo "  Created Python virtual environment"
fi

source venv/bin/activate
pip install -q -r requirements.txt
echo "✓ Backend dependencies installed"

# ── 3. Start server ───────────────────────────────────────────────────────────
echo ""
echo "▸ Starting FastAPI server on http://0.0.0.0:8000"
echo "  Press Ctrl+C to stop"
echo ""

uvicorn main:app --host 0.0.0.0 --port 8000
