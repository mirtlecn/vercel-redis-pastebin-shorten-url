#!/bin/bash

set -euo pipefail

BASE_URL="${BASE_URL:-}"
MODE="${MODE:-manual}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
SECRET_KEY_INPUT="${SECRET_KEY:-}"

if [ -z "$BASE_URL" ]; then
  echo "缺少 BASE_URL"
  exit 1
fi

if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
elif [ -f .env ]; then
  set -a
  source .env
  set +a
fi

SECRET_KEY="${SECRET_KEY_INPUT:-${SECRET_KEY:-}}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-${ADMIN_KEY:-${SECRET_KEY:-}}}"

if [ -z "${SECRET_KEY:-}" ]; then
  echo "缺少 SECRET_KEY"
  exit 1
fi

if [ -z "${ADMIN_PASSWORD:-}" ]; then
  echo "缺少 ADMIN_PASSWORD/ADMIN_KEY/SECRET_KEY"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
COOKIE_JAR="$TMP_DIR/cookies.txt"
BODY_FILE="$TMP_DIR/body.txt"
HEADERS_FILE="$TMP_DIR/headers.txt"
LAST_STATUS=""
LAST_BODY=""
LAST_HEADERS=""
CURRENT_STEP=""
CREATED_PATHS=()

cleanup() {
  local path
  for path in "${CREATED_PATHS[@]}"; do
    /usr/bin/curl -s \
      -X DELETE \
      -H "Authorization: Bearer $SECRET_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"path\":\"$path\"}" \
      "$BASE_URL" >/dev/null 2>&1 || true
  done
  /bin/rm -rf "$TMP_DIR"
}

trap cleanup EXIT

log() {
  echo "[$MODE] $1"
}

fail() {
  local message="$1"
  echo "FAIL: $CURRENT_STEP"
  echo "原因: $message"
  if [ -n "${REQUEST_METHOD:-}" ] || [ -n "${REQUEST_URL:-}" ]; then
    echo "请求: ${REQUEST_METHOD:-GET} ${REQUEST_URL:-}"
  fi
  if [ -n "${EXPECTED_STATUS:-}" ]; then
    echo "期望状态码: $EXPECTED_STATUS"
  fi
  if [ -n "${LAST_STATUS:-}" ]; then
    echo "实际状态码: $LAST_STATUS"
  fi
  if [ -f "$HEADERS_FILE" ]; then
    echo "响应头:"
    /usr/bin/sed -n '1,12p' "$HEADERS_FILE"
  fi
  if [ -f "$BODY_FILE" ]; then
    echo "响应体:"
    /usr/bin/sed -n '1,20p' "$BODY_FILE"
  fi
  exit 1
}

request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  shift 3 || true

  REQUEST_METHOD="$method"
  REQUEST_URL="$url"
  : >"$BODY_FILE"
  : >"$HEADERS_FILE"

  local args=(
    -sS
    -D "$HEADERS_FILE"
    -o "$BODY_FILE"
    -X "$method"
    "$url"
  )

  if [ -n "$body" ]; then
    args+=(-d "$body")
  fi

  while [ "$#" -gt 0 ]; do
    args+=("$1")
    shift
  done

  LAST_STATUS="$(
    /usr/bin/curl \
      "${args[@]}" \
      -w "%{http_code}"
  )"
  LAST_BODY="$(/bin/cat "$BODY_FILE" 2>/dev/null || true)"
  LAST_HEADERS="$(/bin/cat "$HEADERS_FILE" 2>/dev/null || true)"
}

expect_status() {
  EXPECTED_STATUS="$1"
  if [ "$LAST_STATUS" != "$EXPECTED_STATUS" ]; then
    fail "状态码不符合预期"
  fi
}

expect_header_contains() {
  local needle="$1"
  if ! /usr/bin/grep -qi "$needle" "$HEADERS_FILE"; then
    fail "响应头未包含: $needle"
  fi
}

expect_body_contains() {
  local needle="$1"
  if ! /usr/bin/grep -Fq "$needle" "$BODY_FILE"; then
    fail "响应体未包含: $needle"
  fi
}

expect_body_not_contains() {
  local needle="$1"
  if /usr/bin/grep -Fq "$needle" "$BODY_FILE"; then
    fail "响应体不应包含: $needle"
  fi
}

expect_location() {
  local expected="$1"
  local actual
  actual="$(
    /usr/bin/grep -i '^location:' "$HEADERS_FILE" | /usr/bin/head -n 1 | /usr/bin/cut -d' ' -f2- | /usr/bin/tr -d '\r'
  )"
  if [ "$actual" != "$expected" ]; then
    fail "Location 不匹配，期望 ${expected}，实际 ${actual:-<empty>}"
  fi
}

expect_json_error_message() {
  local message="$1"
  expect_body_contains "\"code\":\"invalid_request\""
  expect_body_contains "\"error\":\"$message\""
}

add_created_path() {
  CREATED_PATHS+=("$1")
}

remove_created_path() {
  local target="$1"
  local next=()
  local item
  for item in "${CREATED_PATHS[@]}"; do
    if [ "$item" != "$target" ]; then
      next+=("$item")
    fi
  done
  CREATED_PATHS=("${next[@]}")
}

uniq_path() {
  echo "smoke-$1-$(date +%s)-$RANDOM"
}

AUTH_HEADER="Authorization: Bearer $SECRET_KEY"
LONG_PATH="$(printf 'a%.0s' $(seq 1 100))"
INVALID_PATH='bad[]path'
SLASH_PATH="$(uniq_path nested)/child.item"

CURRENT_STEP="环境可达"
request GET "$BASE_URL/admin" "" 
expect_status 200
expect_header_contains '^content-type: text/html'
expect_body_contains '<!doctype html>'
log "环境启动成功"

CURRENT_STEP="管理页子路径已收紧"
request GET "$BASE_URL/admin/not-a-route" ""
expect_status 404
log "管理页子路径收紧通过"

CURRENT_STEP="管理鉴权未登录"
request GET "$BASE_URL/api/admin/session" ""
expect_status 401
log "管理未登录鉴权通过"

CURRENT_STEP="管理登录"
request POST "$BASE_URL/api/admin/session" "{\"password\":\"$ADMIN_PASSWORD\"}" \
  -c "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains '"authenticated":true'
if ! /usr/bin/grep -q 'post_admin_session' "$COOKIE_JAR"; then
  fail "未写入管理会话 Cookie"
fi
log "管理登录通过"

CURRENT_STEP="管理会话检查"
request GET "$BASE_URL/api/admin/session" "" -b "$COOKIE_JAR"
expect_status 200
expect_body_contains '"authenticated":true'
log "管理会话通过"

CURRENT_STEP="管理列表"
request GET "$BASE_URL/api/admin" "" -b "$COOKIE_JAR"
expect_status 200
expect_header_contains '^content-type: application/json'
log "管理列表通过"

ADMIN_PATH="$(uniq_path admin)"

CURRENT_STEP="管理创建"
request POST "$BASE_URL/api/admin" "{\"path\":\"$ADMIN_PATH\",\"url\":\"https://example.com/admin\"}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$ADMIN_PATH\""
add_created_path "$ADMIN_PATH"
log "管理创建通过"

CURRENT_STEP="管理列表包含新条目"
request GET "$BASE_URL/api/admin" "" -b "$COOKIE_JAR"
expect_status 200
expect_body_contains "\"path\":\"$ADMIN_PATH\""
log "管理列表校验通过"

CURRENT_STEP="管理删除"
request DELETE "$BASE_URL/api/admin" "{\"path\":\"$ADMIN_PATH\"}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"deleted\":\"$ADMIN_PATH\""
remove_created_path "$ADMIN_PATH"
log "管理删除通过"

CURRENT_STEP="管理列表不包含已删除条目"
request GET "$BASE_URL/api/admin" "" -b "$COOKIE_JAR"
expect_status 200
expect_body_not_contains "\"path\":\"$ADMIN_PATH\""
log "管理删除校验通过"

CURRENT_STEP="管理创建-路径超长"
request POST "$BASE_URL/api/admin" "{\"path\":\"$LONG_PATH\",\"url\":\"https://example.com/too-long\"}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 400
expect_json_error_message 'path must be 1-99 characters'
log "管理超长路径校验通过"

CURRENT_STEP="管理创建-非法路径"
request POST "$BASE_URL/api/admin" "{\"path\":\"$INVALID_PATH\",\"url\":\"https://example.com/invalid\"}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 400
expect_json_error_message 'path can only contain: a-z A-Z 0-9 - _ . / ( )'
log "管理非法路径校验通过"

CURRENT_STEP="管理创建-允许斜杠路径"
request POST "$BASE_URL/api/admin" "{\"path\":\"$SLASH_PATH\",\"url\":\"slash path text\",\"type\":\"text\"}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$SLASH_PATH\""
add_created_path "$SLASH_PATH"
log "管理斜杠路径创建通过"

CURRENT_STEP="管理列表包含斜杠路径"
request GET "$BASE_URL/api/admin" "" -b "$COOKIE_JAR"
expect_status 200
expect_body_contains "\"path\":\"$SLASH_PATH\""
log "管理斜杠路径列表通过"

CURRENT_STEP="管理删除斜杠路径"
request DELETE "$BASE_URL/api/admin" "{\"path\":\"$SLASH_PATH\"}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"deleted\":\"$SLASH_PATH\""
remove_created_path "$SLASH_PATH"
log "管理斜杠路径删除通过"

CURRENT_STEP="API 未鉴权创建"
request POST "$BASE_URL" "{\"path\":\"$(uniq_path unauth)\",\"url\":\"https://example.com/unauth\"}" \
  -H "Content-Type: application/json"
expect_status 401
log "API 未鉴权校验通过"

API_PATH="$(uniq_path api)"

CURRENT_STEP="API 鉴权创建"
request POST "$BASE_URL" "{\"path\":\"$API_PATH\",\"url\":\"https://example.com/api\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$API_PATH\""
add_created_path "$API_PATH"
log "API 创建通过"

CURRENT_STEP="API 鉴权列表"
request GET "$BASE_URL" "" -H "$AUTH_HEADER"
expect_status 200
expect_body_contains "\"path\":\"$API_PATH\""
log "API 列表通过"

CURRENT_STEP="API 鉴权删除"
request DELETE "$BASE_URL" "{\"path\":\"$API_PATH\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"deleted\":\"$API_PATH\""
remove_created_path "$API_PATH"
log "API 删除通过"

CURRENT_STEP="API 删除后列表"
request GET "$BASE_URL" "" -H "$AUTH_HEADER"
expect_status 200
expect_body_not_contains "\"path\":\"$API_PATH\""
log "API 删除校验通过"

CURRENT_STEP="API 创建-路径超长"
request POST "$BASE_URL" "{\"path\":\"$LONG_PATH\",\"url\":\"https://example.com/too-long\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 400
expect_json_error_message 'path must be 1-99 characters'
log "API 超长路径校验通过"

CURRENT_STEP="API 创建-非法路径"
request POST "$BASE_URL" "{\"path\":\"$INVALID_PATH\",\"url\":\"https://example.com/invalid\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 400
expect_json_error_message 'path can only contain: a-z A-Z 0-9 - _ . / ( )'
log "API 非法路径校验通过"

CURRENT_STEP="API 创建-允许斜杠路径"
request POST "$BASE_URL" "{\"path\":\"$SLASH_PATH\",\"url\":\"slash api text\",\"type\":\"text\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$SLASH_PATH\""
add_created_path "$SLASH_PATH"
log "API 斜杠路径创建通过"

CURRENT_STEP="API 查单条-斜杠路径"
request GET "$BASE_URL" "{\"path\":\"$SLASH_PATH\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -H "x-export: true"
expect_status 200
expect_body_contains "\"path\":\"$SLASH_PATH\""
expect_body_contains '"content":"slash api text"'
log "API 斜杠路径查询通过"

CURRENT_STEP="API 更新-斜杠路径"
request PUT "$BASE_URL" "{\"path\":\"$SLASH_PATH\",\"url\":\"slash api updated\",\"type\":\"text\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"path\":\"$SLASH_PATH\""
log "API 斜杠路径更新通过"

CURRENT_STEP="API 列表包含更新后的斜杠路径"
request GET "$BASE_URL" "" -H "$AUTH_HEADER" -H "x-export: true"
expect_status 200
expect_body_contains "\"path\":\"$SLASH_PATH\""
expect_body_contains '"content":"slash api updated"'
log "API 斜杠路径列表通过"

CURRENT_STEP="公开访问-斜杠路径"
request GET "$BASE_URL/$SLASH_PATH" ""
expect_status 200
expect_header_contains '^content-type: text/plain; charset=utf-8'
expect_body_contains 'slash api updated'
log "公开斜杠路径访问通过"

CURRENT_STEP="API 删除-斜杠路径"
request DELETE "$BASE_URL" "{\"path\":\"$SLASH_PATH\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"deleted\":\"$SLASH_PATH\""
remove_created_path "$SLASH_PATH"
log "API 斜杠路径删除通过"

CURRENT_STEP="API 删除后列表不含斜杠路径"
request GET "$BASE_URL" "" -H "$AUTH_HEADER"
expect_status 200
expect_body_not_contains "\"path\":\"$SLASH_PATH\""
log "API 斜杠路径删除校验通过"

PUBLIC_URL_PATH="$(uniq_path public-url)"
PUBLIC_TEXT_PATH="$(uniq_path public-text)"
PUBLIC_HTML_PATH="$(uniq_path public-html)"

CURRENT_STEP="公开跳转准备数据"
request POST "$BASE_URL" "{\"path\":\"$PUBLIC_URL_PATH\",\"url\":\"https://example.com/public\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
add_created_path "$PUBLIC_URL_PATH"

CURRENT_STEP="公开跳转"
request GET "$BASE_URL/$PUBLIC_URL_PATH" "" 
expect_status 302
expect_location "https://example.com/public"
log "公开跳转通过"

CURRENT_STEP="公开 text 准备数据"
request POST "$BASE_URL" "{\"path\":\"$PUBLIC_TEXT_PATH\",\"url\":\"hello functional text\",\"type\":\"text\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
add_created_path "$PUBLIC_TEXT_PATH"

CURRENT_STEP="公开 text 展示"
request GET "$BASE_URL/$PUBLIC_TEXT_PATH" ""
expect_status 200
expect_header_contains '^content-type: text/plain; charset=utf-8'
expect_body_contains 'hello functional text'
log "公开 text 展示通过"

CURRENT_STEP="公开 html 准备数据"
request POST "$BASE_URL" "{\"path\":\"$PUBLIC_HTML_PATH\",\"url\":\"<h1>Functional HTML</h1><p>visible</p>\",\"type\":\"html\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
add_created_path "$PUBLIC_HTML_PATH"

CURRENT_STEP="公开 html 展示"
request GET "$BASE_URL/$PUBLIC_HTML_PATH" ""
expect_status 200
expect_header_contains '^content-type: text/html; charset=utf-8'
expect_body_contains '<h1>Functional HTML</h1>'
expect_body_contains '<p>visible</p>'
log "公开 html 展示通过"

log "全部功能测试通过"
