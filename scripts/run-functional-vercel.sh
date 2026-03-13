#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$(mktemp)"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  /bin/rm -f "$LOG_FILE"
}

trap cleanup EXIT

wait_for_ready() {
  local url="$1"
  local retries=90
  local i
  for i in $(seq 1 "$retries"); do
    if /usr/bin/curl -s -o /dev/null "$url"; then
      return 0
    fi
    sleep 1
  done
  echo "服务启动超时: $url"
  /usr/bin/sed -n '1,120p' "$LOG_FILE" || true
  exit 1
}

cd "$ROOT_DIR"

echo "[vercel] 启动 vercel dev"
vercel dev --listen 3020 >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

wait_for_ready "http://localhost:3020/admin"
echo "[vercel] 服务已就绪"

BASE_URL="http://localhost:3020" MODE="vercel" bash "$ROOT_DIR/scripts/test-functional.sh"
