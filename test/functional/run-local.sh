#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-3000}"
REDIS_DB="${REDIS_DB:-9}"
SECRET_KEY="${SECRET_KEY:-demo}"
MODE="local"
. "$ROOT_DIR/test/functional/common.sh"

cleanup() {
  stop_local_server
}

trap cleanup EXIT

cd "$ROOT_DIR"
start_local_server

BASE_URL="http://localhost:$PORT" MODE="local" bash "$ROOT_DIR/test/functional/test-functional.sh"
