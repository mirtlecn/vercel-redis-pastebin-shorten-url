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
  local retries=60
  local i
  for i in $(seq 1 "$retries"); do
    if /usr/bin/curl -s -o /dev/null "$url"; then
      return 0
    fi
    sleep 1
  done
  echo "服务启动超时: $url"
  /usr/bin/sed -n '1,80p' "$LOG_FILE" || true
  exit 1
}

cd "$ROOT_DIR"

echo "[local] 构建前端"
npm run build

echo "[local] 启动 npm start"
npm start >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

wait_for_ready "http://localhost:3000/admin"
echo "[local] 服务已就绪"

BASE_URL="http://localhost:3000" MODE="local" bash "$ROOT_DIR/scripts/test-functional.sh"
