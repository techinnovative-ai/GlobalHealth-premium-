#!/usr/bin/env bash
# Local development: backend (FastAPI, port 8000) + frontend (Next.js, port 3000).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -d "$ROOT/backend/.venv" ]; then
  python3 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -r "$ROOT/backend/requirements-dev.txt"
fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  (cd "$ROOT/frontend" && npm install)
fi

export SENTIN_ENV="${SENTIN_ENV:-development}"
(cd "$ROOT/backend" && "$ROOT/backend/.venv/bin/uvicorn" app.main:app --host 0.0.0.0 --port 8000) &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null || true' EXIT
cd "$ROOT/frontend"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}" npx next dev -H 0.0.0.0 -p 3000
