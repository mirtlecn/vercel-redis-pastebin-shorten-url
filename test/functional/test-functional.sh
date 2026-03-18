#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
. "$ROOT_DIR/test/functional/common.sh"
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

init_http_test
COOKIE_JAR="$TMP_DIR/cookies.txt"
CREATED_PATHS=()
CREATED_TOPICS=()

cleanup() {
  local path
  for path in "${CREATED_PATHS[@]-}"; do
    /usr/bin/curl -s \
      -X DELETE \
      -H "Authorization: Bearer $SECRET_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"path\":\"$path\"}" \
      "$BASE_URL" >/dev/null 2>&1 || true
  done
  for path in "${CREATED_TOPICS[@]-}"; do
    /usr/bin/curl -s \
      -X DELETE \
      -H "Authorization: Bearer $SECRET_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"path\":\"$path\",\"type\":\"topic\"}" \
      "$BASE_URL" >/dev/null 2>&1 || true
  done
  cleanup_http_test
}

trap cleanup EXIT

add_created_path() {
  CREATED_PATHS+=("$1")
}

add_created_topic() {
  CREATED_TOPICS+=("$1")
}

remove_created_path() {
  local target="$1"
  local -a remaining_paths=()
  local item
  for item in "${CREATED_PATHS[@]}"; do
    if [ "$item" != "$target" ]; then
      remaining_paths+=("$item")
    fi
  done
  CREATED_PATHS=()
  if [ "${#remaining_paths[@]}" -gt 0 ]; then
    CREATED_PATHS=("${remaining_paths[@]}")
  fi
}

remove_created_topic() {
  local target="$1"
  local -a remaining_topics=()
  local item
  for item in "${CREATED_TOPICS[@]}"; do
    if [ "$item" != "$target" ]; then
      remaining_topics+=("$item")
    fi
  done
  CREATED_TOPICS=()
  if [ "${#remaining_topics[@]}" -gt 0 ]; then
    CREATED_TOPICS=("${remaining_topics[@]}")
  fi
}

AUTH_HEADER="Authorization: Bearer $SECRET_KEY"
LONG_PATH="$(printf 'a%.0s' $(seq 1 100))"
INVALID_PATH='bad[]path'
SLASH_PATH="$(uniq_path nested)/child.item"
DOUBLE_SLASH_PATH="$(uniq_path two)/branch/leaf.txt"
TRIPLE_SLASH_PATH="$(uniq_path three)/branch/deeper/leaf.txt"
ADMIN_NORMALIZED_PATH="$(uniq_path admin-normalized)"
ADMIN_NORMALIZED_PATH_INPUT="/$ADMIN_NORMALIZED_PATH/"
API_NORMALIZED_PATH="$(uniq_path api-normalized)"
API_NORMALIZED_PATH_INPUT="/$API_NORMALIZED_PATH/"

CURRENT_STEP="环境可达"
if [ "$MODE" = "vercel" ]; then
  request GET "$BASE_URL/admin" ""
  if [ "$LAST_STATUS" = "307" ]; then
    expect_location "/admin/"
    request GET "$BASE_URL/admin/" ""
    expect_status 200
    expect_header_contains '^content-type: text/html'
    expect_body_contains '<!doctype html>'
  else
    expect_status 200
    expect_header_contains '^content-type: text/html'
    expect_body_contains '<!doctype html>'
  fi
else
  request GET "$BASE_URL/admin" ""
  expect_status 200
  expect_header_contains '^content-type: text/html'
  expect_body_contains '<!doctype html>'
fi
log "环境启动成功"

CURRENT_STEP="管理页子路径已收紧"
request GET "$BASE_URL/admin/not-a-route" ""
if [ "$MODE" = "vercel" ]; then
  expect_status 200
  expect_body_contains '<!doctype html>'
else
  expect_status 404
fi
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
remove_created_path "$ADMIN_PATH"
log "管理删除通过"

CURRENT_STEP="管理删除校验"
request GET "$BASE_URL/api/admin" "" -b "$COOKIE_JAR"
expect_status 200
expect_body_not_contains "\"path\":\"$ADMIN_PATH\""
log "管理删除校验通过"

CURRENT_STEP="管理超长路径校验"
request POST "$BASE_URL/api/admin" "{\"path\":\"$LONG_PATH\",\"url\":\"https://example.com/too-long\"}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 400
expect_json_error_message "path must be 1-99 characters"
log "管理超长路径校验通过"

CURRENT_STEP="管理非法路径校验"
request POST "$BASE_URL/api/admin" "{\"path\":\"$INVALID_PATH\",\"url\":\"https://example.com/invalid\"}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 400
expect_json_error_message "path can only contain: a-z A-Z 0-9 - _ . / ( )"
log "管理非法路径校验通过"

CURRENT_STEP="管理斜杠路径创建"
request POST "$BASE_URL/api/admin" "{\"path\":\"$SLASH_PATH\",\"url\":\"https://example.com/admin/nested\"}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$SLASH_PATH\""
add_created_path "$SLASH_PATH"
log "管理斜杠路径创建通过"

CURRENT_STEP="管理斜杠路径列表"
request GET "$BASE_URL/api/admin" "" -b "$COOKIE_JAR"
expect_status 200
expect_body_contains "\"path\":\"$SLASH_PATH\""
log "管理斜杠路径列表通过"

CURRENT_STEP="管理斜杠路径删除"
request DELETE "$BASE_URL/api/admin" "{\"path\":\"$SLASH_PATH\"}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 200
remove_created_path "$SLASH_PATH"
log "管理斜杠路径删除通过"

CURRENT_STEP="管理路径会规范化首尾斜杠"
request POST "$BASE_URL/api/admin" "{\"path\":\"$ADMIN_NORMALIZED_PATH_INPUT\",\"url\":\"https://example.com/admin-normalized\"}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$ADMIN_NORMALIZED_PATH\""
add_created_path "$ADMIN_NORMALIZED_PATH"
request GET "$BASE_URL/api/admin" "" -b "$COOKIE_JAR"
expect_status 200
expect_body_contains "\"path\":\"$ADMIN_NORMALIZED_PATH\""
request DELETE "$BASE_URL/api/admin" "{\"path\":\"//$ADMIN_NORMALIZED_PATH//\"}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 200
remove_created_path "$ADMIN_NORMALIZED_PATH"
log "管理路径规范化通过"

ADMIN_TOPIC="$(uniq_path admin-topic)"
ADMIN_TOPIC_CHILD="child-note"
ADMIN_TOPIC_PATH="$ADMIN_TOPIC/$ADMIN_TOPIC_CHILD"
ADMIN_TTL_ZERO_PATH="$(uniq_path admin-ttl-zero)"
ADMIN_TTL_LIVE_PATH="$(uniq_path admin-ttl-live)"

CURRENT_STEP="管理 ttl=0 创建"
request POST "$BASE_URL/api/admin" "{\"path\":\"$ADMIN_TTL_ZERO_PATH\",\"url\":\"ttl zero body\",\"ttl\":0}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$ADMIN_TTL_ZERO_PATH\""
expect_body_contains "\"ttl\":null"
add_created_path "$ADMIN_TTL_ZERO_PATH"
request GET "$BASE_URL/api/admin" "" -b "$COOKIE_JAR"
expect_status 200
expect_body_contains "\"path\":\"$ADMIN_TTL_ZERO_PATH\""
expect_body_contains "\"ttl\":null"
log "管理 ttl=0 通过"

CURRENT_STEP="管理 ttl 正数创建"
request POST "$BASE_URL/api/admin" "{\"path\":\"$ADMIN_TTL_LIVE_PATH\",\"url\":\"ttl live body\",\"ttl\":30}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$ADMIN_TTL_LIVE_PATH\""
expect_body_contains "\"ttl\":30"
add_created_path "$ADMIN_TTL_LIVE_PATH"
request GET "$BASE_URL/api/admin" "" -b "$COOKIE_JAR"
expect_status 200
expect_body_contains "\"path\":\"$ADMIN_TTL_LIVE_PATH\""
expect_body_matches "\"path\":\"$ADMIN_TTL_LIVE_PATH\"[^\n]*\"ttl\":(2[0-9]|30)"
log "管理 ttl 正数通过"

CURRENT_STEP="管理 title 与 topic 创建"
request POST "$BASE_URL" "{\"path\":\"$ADMIN_TOPIC\",\"type\":\"topic\",\"title\":\"Admin Topic Home\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"title\":\"Admin Topic Home\""
add_created_topic "$ADMIN_TOPIC"
request POST "$BASE_URL/api/admin" "{\"topic\":\"$ADMIN_TOPIC\",\"path\":\"$ADMIN_TOPIC_CHILD\",\"title\":\"Admin Topic Title\",\"url\":\"topic body\"}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$ADMIN_TOPIC_PATH\""
expect_body_contains "\"title\":\"Admin Topic Title\""
add_created_path "$ADMIN_TOPIC_PATH"
request GET "$BASE_URL/api/admin" "" -b "$COOKIE_JAR"
expect_status 200
expect_body_contains "\"path\":\"$ADMIN_TOPIC_PATH\""
expect_body_contains "\"title\":\"Admin Topic Title\""
expect_body_contains "\"path\":\"$ADMIN_TOPIC\""
expect_body_contains "\"title\":\"Admin Topic Home\""
log "管理 title 与 topic 通过"

CURRENT_STEP="管理 topic 子项删除"
request DELETE "$BASE_URL/api/admin" "{\"path\":\"$ADMIN_TOPIC_PATH\"}" \
  -b "$COOKIE_JAR" \
  -H "Content-Type: application/json"
expect_status 200
remove_created_path "$ADMIN_TOPIC_PATH"
request DELETE "$BASE_URL" "{\"path\":\"$ADMIN_TOPIC\",\"type\":\"topic\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 200
remove_created_topic "$ADMIN_TOPIC"
log "管理 topic 子项删除通过"

CURRENT_STEP="API 未鉴权校验"
request POST "$BASE_URL" "{\"url\":\"https://example.com/unauthorized\"}" \
  -H "Content-Type: application/json"
expect_status 401
log "API 未鉴权校验通过"

API_PATH="$(uniq_path api)"

CURRENT_STEP="API 创建"
request POST "$BASE_URL" "{\"path\":\"$API_PATH\",\"url\":\"https://example.com/api\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$API_PATH\""
add_created_path "$API_PATH"
log "API 创建通过"

CURRENT_STEP="API 列表"
request GET "$BASE_URL" "" -H "$AUTH_HEADER"
expect_status 200
expect_body_contains "\"path\":\"$API_PATH\""
log "API 列表通过"

CURRENT_STEP="API 删除"
request DELETE "$BASE_URL" "{\"path\":\"$API_PATH\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 200
remove_created_path "$API_PATH"
log "API 删除通过"

CURRENT_STEP="API 删除校验"
request GET "$BASE_URL" "" -H "$AUTH_HEADER"
expect_status 200
expect_body_not_contains "\"path\":\"$API_PATH\""
log "API 删除校验通过"

CURRENT_STEP="API 超长路径校验"
request POST "$BASE_URL" "{\"path\":\"$LONG_PATH\",\"url\":\"https://example.com/too-long\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 400
expect_json_error_message "path must be 1-99 characters"
log "API 超长路径校验通过"

CURRENT_STEP="API 非法路径校验"
request POST "$BASE_URL" "{\"path\":\"$INVALID_PATH\",\"url\":\"https://example.com/invalid\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 400
expect_json_error_message "path can only contain: a-z A-Z 0-9 - _ . / ( )"
log "API 非法路径校验通过"

CURRENT_STEP="API 斜杠路径创建"
request POST "$BASE_URL" "{\"path\":\"$SLASH_PATH\",\"url\":\"https://example.com/api/nested\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$SLASH_PATH\""
add_created_path "$SLASH_PATH"
log "API 斜杠路径创建通过"

CURRENT_STEP="API 斜杠路径查询"
request GET "$BASE_URL" "{\"path\":\"$SLASH_PATH\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"path\":\"$SLASH_PATH\""
log "API 斜杠路径查询通过"

CURRENT_STEP="API 斜杠路径更新"
request PUT "$BASE_URL" "{\"path\":\"$SLASH_PATH\",\"url\":\"https://example.com/api/nested-updated\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"path\":\"$SLASH_PATH\""
expect_body_contains "\"overwritten\":\"https://example"
log "API 斜杠路径更新通过"

CURRENT_STEP="API 斜杠路径列表"
request GET "$BASE_URL" "" -H "$AUTH_HEADER"
expect_status 200
expect_body_contains "\"path\":\"$SLASH_PATH\""
log "API 斜杠路径列表通过"

CURRENT_STEP="公开斜杠路径访问"
request GET "$BASE_URL/$SLASH_PATH" ""
expect_status 302
expect_location "https://example.com/api/nested-updated"
log "公开斜杠路径访问通过"

CURRENT_STEP="API 双层路径创建"
request POST "$BASE_URL" "{\"path\":\"$DOUBLE_SLASH_PATH\",\"url\":\"https://example.com/api/two-level\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$DOUBLE_SLASH_PATH\""
add_created_path "$DOUBLE_SLASH_PATH"
log "API 双层路径创建通过"

CURRENT_STEP="公开双层路径访问"
request GET "$BASE_URL/$DOUBLE_SLASH_PATH" ""
expect_status 302
expect_location "https://example.com/api/two-level"
log "公开双层路径访问通过"

CURRENT_STEP="API 三层路径创建"
request POST "$BASE_URL" "{\"path\":\"$TRIPLE_SLASH_PATH\",\"url\":\"https://example.com/api/three-level\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$TRIPLE_SLASH_PATH\""
add_created_path "$TRIPLE_SLASH_PATH"
log "API 三层路径创建通过"

CURRENT_STEP="公开三层路径访问"
request GET "$BASE_URL/$TRIPLE_SLASH_PATH" ""
expect_status 302
expect_location "https://example.com/api/three-level"
log "公开三层路径访问通过"

CURRENT_STEP="API 斜杠路径删除"
request DELETE "$BASE_URL" "{\"path\":\"$SLASH_PATH\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 200
remove_created_path "$SLASH_PATH"
log "API 斜杠路径删除通过"

CURRENT_STEP="API 双层路径删除"
request DELETE "$BASE_URL" "{\"path\":\"$DOUBLE_SLASH_PATH\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 200
remove_created_path "$DOUBLE_SLASH_PATH"
log "API 双层路径删除通过"

CURRENT_STEP="API 三层路径删除"
request DELETE "$BASE_URL" "{\"path\":\"$TRIPLE_SLASH_PATH\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 200
remove_created_path "$TRIPLE_SLASH_PATH"
log "API 三层路径删除通过"

CURRENT_STEP="API 斜杠路径删除校验"
request GET "$BASE_URL" "" -H "$AUTH_HEADER"
expect_status 200
expect_body_not_contains "\"path\":\"$SLASH_PATH\""
log "API 斜杠路径删除校验通过"

CURRENT_STEP="API 路径会规范化首尾斜杠"
request POST "$BASE_URL" "{\"path\":\"$API_NORMALIZED_PATH_INPUT\",\"url\":\"https://example.com/api-normalized\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$API_NORMALIZED_PATH\""
add_created_path "$API_NORMALIZED_PATH"
request GET "$BASE_URL" "{\"path\":\"//$API_NORMALIZED_PATH//\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"path\":\"$API_NORMALIZED_PATH\""
request GET "$BASE_URL/$API_NORMALIZED_PATH/" ""
expect_status 302
expect_location "https://example.com/api-normalized"
request DELETE "$BASE_URL" "{\"path\":\"//$API_NORMALIZED_PATH//\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 200
remove_created_path "$API_NORMALIZED_PATH"
log "API 路径规范化通过"

REDIRECT_PATH="$(uniq_path redirect)"
FILE_URL_PATH="$(uniq_path file-url)"
MAILTO_URL_PATH="$(uniq_path mailto-url)"
INVALID_URL_PATH="$(uniq_path invalid-url)"
TEXT_PATH="$(uniq_path text)"
HTML_PATH="$(uniq_path html)"

CURRENT_STEP="公开跳转通过"
request POST "$BASE_URL" "{\"path\":\"$REDIRECT_PATH\",\"url\":\"https://example.com/public\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
add_created_path "$REDIRECT_PATH"
request GET "$BASE_URL/$REDIRECT_PATH" ""
expect_status 302
expect_location "https://example.com/public"
log "公开跳转通过"

CURRENT_STEP="公开 file url trim 跳转通过"
request POST "$BASE_URL" "{\"path\":\"$FILE_URL_PATH\",\"url\":\"  file:///tmp/post-functional.txt  \",\"type\":\"url\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
add_created_path "$FILE_URL_PATH"
request GET "$BASE_URL/$FILE_URL_PATH" ""
expect_status 302
expect_location "file:///tmp/post-functional.txt"
log "公开 file url trim 跳转通过"

CURRENT_STEP="公开 mailto url 跳转通过"
request POST "$BASE_URL" "{\"path\":\"$MAILTO_URL_PATH\",\"url\":\"mailto:functional@example.com\",\"type\":\"url\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
add_created_path "$MAILTO_URL_PATH"
request GET "$BASE_URL/$MAILTO_URL_PATH" ""
expect_status 302
expect_location "mailto:functional@example.com"
log "公开 mailto url 跳转通过"

CURRENT_STEP="公开非法 url 拒绝存储"
request POST "$BASE_URL" "{\"path\":\"$INVALID_URL_PATH\",\"url\":\" example.com \",\"type\":\"url\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 400
expect_json_error_message '`url` must be a valid absolute URL with a scheme'
log "公开非法 url 拒绝存储通过"

CURRENT_STEP="公开 text 展示通过"
request POST "$BASE_URL" "{\"path\":\"$TEXT_PATH\",\"url\":\"plain text body\",\"type\":\"text\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
add_created_path "$TEXT_PATH"
request GET "$BASE_URL/$TEXT_PATH" ""
expect_status 200
expect_header_contains '^content-type: text/plain'
expect_body_contains 'plain text body'
log "公开 text 展示通过"

CURRENT_STEP="公开 html 展示通过"
request POST "$BASE_URL" "{\"path\":\"$HTML_PATH\",\"url\":\"<h1>hello</h1>\",\"type\":\"html\"}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json"
expect_status 201
add_created_path "$HTML_PATH"
request GET "$BASE_URL/$HTML_PATH" ""
expect_status 200
expect_header_contains '^content-type: text/html'
expect_body_contains '<h1>hello</h1>'
log "公开 html 展示通过"

log "全部功能测试通过"
