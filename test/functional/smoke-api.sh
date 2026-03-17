#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
. "$ROOT_DIR/test/functional/common.sh"

BASE_URL="${BASE_URL:-}"
MODE="${MODE:-api-smoke}"
SECRET_KEY="${SECRET_KEY:-demo}"
REDIS_DB="${REDIS_DB:-10}"

require_base_url
init_http_test

LONG_PATH="$(printf 'a%.0s' $(seq 1 100))"
INVALID_PATH='bad[]path'
LONG_BODY='0123456789abcdefghi full export body'
CURRENT_YEAR="$(date -u +%Y)"
CURRENT_MM_DD="$(date -u +%m-%d)"
CURRENT_DATE="$(date -u +%F)"
UPLOAD_PATH="upload-file-$(date +%s)-$$"
UPLOAD_FILE_PATH="${UPLOAD_PATH}.md"

ALIAS_TEXT_PATH="api-alias-$(date +%s)-$$"
TEXT_PATH="api-text-$(date +%s)-$$"
URL_PATH="api-url-$(date +%s)-$$"
HTML_PATH="api-html-$(date +%s)-$$"
CONTRACT_TOPIC_PATH="api-topic-$(date +%s)-$$"
CONTRACT_TOPIC_ITEM_PATH="$CONTRACT_TOPIC_PATH/entry"

STORAGE_TOPIC_PATH="storage-topic-$(date +%s)-$$"
STORAGE_ENTRY_PATH="$STORAGE_TOPIC_PATH/entry"
STORAGE_ORPHAN_PATH="$STORAGE_TOPIC_PATH/orphan"
STORAGE_TOPIC_ITEMS_KEY="topic:$STORAGE_TOPIC_PATH:items"

RENDER_TOPIC_PATH="render-topic-$(date +%s)-$$"
RENDER_TOPIC_TITLE="Render Topic Archive"
RENDER_TOPIC_UPDATED_TITLE="Render Topic Archive Updated"
RENDER_HTML_ITEM_PATH="$RENDER_TOPIC_PATH/howl-visual"
RENDER_UPDATED_HTML_ITEM_PATH="$RENDER_TOPIC_PATH/moving-castle"
RENDER_URL_ITEM_PATH="$RENDER_TOPIC_PATH/notes/reference-link"
RENDER_TEXT_ITEM_PATH="$RENDER_TOPIC_PATH/castle-notes"
RENDER_AUTO_ITEM_GREP='\"surl\":\"http://localhost:[0-9]+/render-topic-[^\"]+/[a-z0-9]{5}\"'

READ_TEXT_PATH="read-text-$(date +%s)-$$"
READ_URL_PATH="read-url-$(date +%s)-$$"
READ_HTML_PATH="read-html-$(date +%s)-$$"
READ_TOPIC_PATH="read-topic-$(date +%s)-$$"
READ_TOPIC_ITEM_PATH="$READ_TOPIC_PATH/entry"
GHOST_TOPIC_PATH="ghost-topic-$(date +%s)-$$"

TTL_ZERO_PATH="ttl-zero-$(date +%s)-$$"
TTL_LIVE_PATH="ttl-live-$(date +%s)-$$"
TTL_MAX_PATH="ttl-max-$(date +%s)-$$"
TTL_TOPIC_CONFLICT_PATH="ttl-topic-conflict-$(date +%s)-$$"
TTL_TOPIC_PATH="ttl-topic-$(date +%s)-$$"
TTL_TOPIC_ITEM_PATH="$TTL_TOPIC_PATH/entry"

cleanup() {
  local path
  for path in \
    "$ALIAS_TEXT_PATH" \
    "$TEXT_PATH" \
    "$URL_PATH" \
    "$HTML_PATH" \
    "$CONTRACT_TOPIC_ITEM_PATH" \
    "$STORAGE_ENTRY_PATH" \
    "$STORAGE_ORPHAN_PATH" \
    "$RENDER_HTML_ITEM_PATH" \
    "$RENDER_UPDATED_HTML_ITEM_PATH" \
    "$RENDER_URL_ITEM_PATH" \
    "$RENDER_TEXT_ITEM_PATH" \
    "$READ_TEXT_PATH" \
    "$READ_URL_PATH" \
    "$READ_HTML_PATH" \
    "$READ_TOPIC_ITEM_PATH" \
    "$TTL_ZERO_PATH" \
    "$TTL_LIVE_PATH" \
    "$TTL_MAX_PATH" \
    "$TTL_TOPIC_CONFLICT_PATH" \
    "$TTL_TOPIC_ITEM_PATH" \
    "$UPLOAD_PATH" \
    "$UPLOAD_FILE_PATH"
  do
    /usr/bin/curl -s \
      -X DELETE \
      -H "Authorization: Bearer $SECRET_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"path\":\"$path\"}" \
      "$BASE_URL" >/dev/null 2>&1 || true
  done

  for path in \
    "$CONTRACT_TOPIC_PATH" \
    "$STORAGE_TOPIC_PATH" \
    "$RENDER_TOPIC_PATH" \
    "$READ_TOPIC_PATH" \
    "$TTL_TOPIC_PATH"
  do
    /usr/bin/curl -s \
      -X DELETE \
      -H "Authorization: Bearer $SECRET_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"path\":\"$path\",\"type\":\"topic\"}" \
      "$BASE_URL" >/dev/null 2>&1 || true
  done

  redis-cli -n "$REDIS_DB" DEL \
    "surl:$GHOST_TOPIC_PATH" \
    "$STORAGE_TOPIC_ITEMS_KEY" >/dev/null 2>&1 || true
  cleanup_http_test
}

trap cleanup EXIT

# Contract and validation
CURRENT_STEP="未鉴权写请求被拒绝"
request POST "$BASE_URL" "{\"url\":\"hello\",\"type\":\"text\"}" \
  -H "Content-Type: application/json"
expect_status 401
expect_body_contains "\"code\":\"unauthorized\""
log "未鉴权写请求被拒绝通过"

CURRENT_STEP="type 与 convert 一致时允许写入"
request POST "$BASE_URL" "{\"path\":\"$ALIAS_TEXT_PATH\",\"url\":\"alias body\",\"type\":\"text\",\"convert\":\"text\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$ALIAS_TEXT_PATH\""
log "type 与 convert 一致通过"

CURRENT_STEP="type 与 convert 冲突时返回 400"
request POST "$BASE_URL" "{\"path\":\"bad-alias\",\"url\":\"alias body\",\"type\":\"text\",\"convert\":\"html\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_body_contains "\"error\":\"\`type\` and \`convert\` must match when both are provided\""
log "type 与 convert 冲突通过"

CURRENT_STEP="路径长度校验"
request POST "$BASE_URL" "{\"path\":\"$LONG_PATH\",\"url\":\"hello\",\"type\":\"text\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_json_error_message "path must be 1-99 characters"
log "路径长度校验通过"

CURRENT_STEP="路径字符校验"
request POST "$BASE_URL" "{\"path\":\"$INVALID_PATH\",\"url\":\"hello\",\"type\":\"text\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_json_error_message "path can only contain: a-z A-Z 0-9 - _ . / ( )"
log "路径字符校验通过"

CURRENT_STEP="边缘斜杠会规范到同一个 path"
request POST "$BASE_URL" "{\"path\":\"///\",\"url\":\"root body\",\"type\":\"text\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"/\""
expect_body_contains "\"surl\":\"$BASE_URL/\""
request GET "$BASE_URL/"
expect_status 200
expect_body_contains "root body"
request DELETE "$BASE_URL" "{\"path\":\"/////\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"deleted\":\"/\""
request GET "$BASE_URL/"
expect_status 404
log "边缘斜杠规范化通过"

CURRENT_STEP="无效 JSON body 被拒绝"
request POST "$BASE_URL" '{"path":' \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_body_contains "\"error\":\"Invalid JSON body\""
log "无效 JSON body 被拒绝通过"

CURRENT_STEP="文件上传与缓存链路"
request POST "$BASE_URL" "" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -F "file=@README.md" \
  -F "path=$UPLOAD_PATH"
if [ "$LAST_STATUS" = "501" ]; then
  expect_body_contains "\"code\":\"s3_not_configured\""
  log "未配置 S3 时文件上传返回 501 通过"
else
  expect_status 201
  expect_body_contains "\"path\":\"$UPLOAD_FILE_PATH\""
  request GET "$BASE_URL/$UPLOAD_FILE_PATH"
  expect_status 200
  expect_header_contains "^cache-control: public, max-age=86400, s-maxage=86400"
  FILE_CACHE_EXISTS="$(redis-cli -n "$REDIS_DB" EXISTS "cache:file:$UPLOAD_FILE_PATH")"
  FILE_META_CACHE_EXISTS="$(redis-cli -n "$REDIS_DB" EXISTS "cache:filemeta:$UPLOAD_FILE_PATH")"
  expect_equals "$FILE_CACHE_EXISTS" "1"
  expect_equals "$FILE_META_CACHE_EXISTS" "1"
  request DELETE "$BASE_URL" "{\"path\":\"$UPLOAD_FILE_PATH\"}" \
    -H "Authorization: Bearer $SECRET_KEY" \
    -H "Content-Type: application/json"
  expect_status 200
  FILE_CACHE_EXISTS="$(redis-cli -n "$REDIS_DB" EXISTS "cache:file:$UPLOAD_FILE_PATH")"
  FILE_META_CACHE_EXISTS="$(redis-cli -n "$REDIS_DB" EXISTS "cache:filemeta:$UPLOAD_FILE_PATH")"
  expect_equals "$FILE_CACHE_EXISTS" "0"
  expect_equals "$FILE_META_CACHE_EXISTS" "0"
  log "文件上传、公开读取与缓存清理通过"
fi

# Public behavior, cache headers, export mode, topic home guards
CURRENT_STEP="创建 text/html/url/topic 资源"
request POST "$BASE_URL" "{\"path\":\"$TEXT_PATH\",\"url\":\"$LONG_BODY\",\"type\":\"text\",\"title\":\"Long Body\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
request POST "$BASE_URL" "{\"path\":\"$URL_PATH\",\"url\":\"https://example.com/cache\",\"type\":\"url\",\"title\":\"Cache URL\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
request POST "$BASE_URL" "{\"path\":\"$HTML_PATH\",\"url\":\"<h1>Cache Html</h1>\",\"type\":\"html\",\"title\":\"Cache Html\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
request POST "$BASE_URL" "{\"path\":\"$CONTRACT_TOPIC_PATH\",\"type\":\"topic\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
request POST "$BASE_URL" "{\"topic\":\"$CONTRACT_TOPIC_PATH\",\"path\":\"entry\",\"url\":\"# Topic Entry\\n\\nTopic Body\",\"type\":\"md2html\",\"title\":\"Topic Entry\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
log "创建 text/html/url/topic 资源通过"

CURRENT_STEP="认证 JSON 不应返回 public cache header"
request GET "$BASE_URL" "{\"path\":\"$TEXT_PATH\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 200
expect_header_not_contains "^cache-control: public, max-age=86400, s-maxage=86400"
log "认证 JSON cache header 通过"

CURRENT_STEP="公开 text 响应带 public cache header"
request GET "$BASE_URL/$TEXT_PATH"
expect_status 200
expect_header_contains "^content-type: text/plain; charset=utf-8"
expect_header_contains "^cache-control: public, max-age=86400, s-maxage=86400"
expect_body_contains "$LONG_BODY"
log "公开 text cache header 通过"

CURRENT_STEP="公开 html 响应带 public cache header"
request GET "$BASE_URL/$HTML_PATH"
expect_status 200
expect_header_contains "^content-type: text/html; charset=utf-8"
expect_header_contains "^cache-control: public, max-age=86400, s-maxage=86400"
expect_body_contains "<h1>Cache Html</h1>"
log "公开 html cache header 通过"

CURRENT_STEP="公开 url 响应带 public cache header"
request GET "$BASE_URL/$URL_PATH"
expect_status 302
expect_header_contains "^location: https://example.com/cache"
expect_header_contains "^cache-control: public, max-age=86400, s-maxage=86400"
log "公开 url cache header 通过"

CURRENT_STEP="公开 topic 响应不缓存"
request GET "$BASE_URL/$CONTRACT_TOPIC_PATH"
expect_status 200
expect_header_contains "^content-type: text/html; charset=utf-8"
expect_header_contains "^cache-control: no-store"
expect_body_contains "Topic Entry"
log "公开 topic cache header 通过"

CURRENT_STEP="x-export lookup 返回全文"
request GET "$BASE_URL" "{\"path\":\"$TEXT_PATH\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json" \
  -H "x-export: true"
expect_status 200
expect_body_contains "\"content\":\"$LONG_BODY\""
log "x-export lookup 通过"

CURRENT_STEP="x-export list 返回全文"
request GET "$BASE_URL" "{}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json" \
  -H "x-export: true"
expect_status 200
expect_body_contains "\"path\":\"$TEXT_PATH\""
expect_body_contains "\"content\":\"$LONG_BODY\""
log "x-export list 通过"

CURRENT_STEP="topic 的 x-export 仍返回 count 字符串"
request GET "$BASE_URL" "{\"path\":\"$CONTRACT_TOPIC_PATH\",\"type\":\"topic\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json" \
  -H "x-export: true"
expect_status 200
expect_body_contains "\"content\":\"1\""
log "topic 的 x-export 通过"

CURRENT_STEP="重复创建返回 conflict 与 hint"
request POST "$BASE_URL" "{\"path\":\"$TEXT_PATH\",\"url\":\"another\",\"type\":\"text\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 409
expect_body_contains "\"code\":\"conflict\""
expect_body_contains "\"hint\":\"Use PUT to overwrite\""
log "重复创建 conflict 通过"

CURRENT_STEP="topic 首页不能按普通内容更新"
request PUT "$BASE_URL" "{\"path\":\"$CONTRACT_TOPIC_PATH\",\"url\":\"bad overwrite\",\"type\":\"text\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_body_contains "\"error\":\"topic home must be managed with \`type=topic\`\""
log "topic 首页普通更新保护通过"

CURRENT_STEP="topic 首页不能按普通内容删除"
request DELETE "$BASE_URL" "{\"path\":\"$CONTRACT_TOPIC_PATH\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_body_contains "\"error\":\"topic home must be managed with \`type=topic\`\""
log "topic 首页普通删除保护通过"

CURRENT_STEP="删除 topic 返回当前 count"
request DELETE "$BASE_URL" "{\"path\":\"$CONTRACT_TOPIC_PATH\",\"type\":\"topic\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"deleted\":\"$CONTRACT_TOPIC_PATH\""
expect_body_contains "\"content\":\"1\""
log "删除 topic 返回当前 count 通过"

CURRENT_STEP="公开读取不存在返回 not_found"
request GET "$BASE_URL/not-found-api-smoke"
expect_status 404
expect_body_contains "\"code\":\"not_found\""
log "公开读取不存在通过"

# Topic storage synchronization
CURRENT_STEP="创建 storage topic"
request POST "$BASE_URL" "{\"path\":\"$STORAGE_TOPIC_PATH\",\"type\":\"topic\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"content\":\"0\""
log "创建 storage topic 通过"

CURRENT_STEP="校验 storage topic Redis 初始化"
TOPIC_REDIS_VALUE="$(redis-cli -n "$REDIS_DB" GET "surl:$STORAGE_TOPIC_PATH")"
TOPIC_REDIS_TYPE="$(redis-cli -n "$REDIS_DB" TYPE "$STORAGE_TOPIC_ITEMS_KEY")"
TOPIC_REDIS_ZRANGE="$(redis-cli -n "$REDIS_DB" ZRANGE "$STORAGE_TOPIC_ITEMS_KEY" 0 -1 WITHSCORES)"
expect_redis_contains "$TOPIC_REDIS_VALUE" '"type":"topic"'
if printf '%s' "$TOPIC_REDIS_VALUE" | /usr/bin/grep -Fq '"title":'; then
  fail "默认 topic Redis 值不应持久化 title 字段"
fi
expect_equals "$TOPIC_REDIS_TYPE" "zset"
expect_equals "$TOPIC_REDIS_ZRANGE" $'__topic_placeholder__\n0'
log "storage topic Redis 初始化通过"

CURRENT_STEP="创建 storage topic 成员与 orphan"
request POST "$BASE_URL" "{\"topic\":\"$STORAGE_TOPIC_PATH\",\"path\":\"entry\",\"url\":\"# Entry\\n\\nHello\",\"type\":\"md2html\",\"title\":\"Entry Title\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
request POST "$BASE_URL" "{\"path\":\"$STORAGE_ORPHAN_PATH\",\"url\":\"hello orphan\",\"type\":\"text\",\"title\":\"Orphan Title\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
log "创建 storage topic 成员与 orphan 通过"

CURRENT_STEP="校验 storage topic Redis 同步"
ENTRY_REDIS_VALUE="$(redis-cli -n "$REDIS_DB" GET "surl:$STORAGE_ENTRY_PATH")"
ORPHAN_REDIS_VALUE="$(redis-cli -n "$REDIS_DB" GET "surl:$STORAGE_ORPHAN_PATH")"
TOPIC_REDIS_VALUE="$(redis-cli -n "$REDIS_DB" GET "surl:$STORAGE_TOPIC_PATH")"
TOPIC_REDIS_MEMBERS="$(redis-cli -n "$REDIS_DB" ZRANGE "$STORAGE_TOPIC_ITEMS_KEY" 0 -1)"
expect_redis_contains "$ENTRY_REDIS_VALUE" '"type":"html"'
expect_redis_contains "$ENTRY_REDIS_VALUE" '"title":"Entry Title"'
expect_redis_contains "$ORPHAN_REDIS_VALUE" '"type":"text"'
expect_redis_contains "$ORPHAN_REDIS_VALUE" '"title":"Orphan Title"'
expect_redis_contains "$TOPIC_REDIS_VALUE" "$STORAGE_ENTRY_PATH"
expect_redis_contains "$TOPIC_REDIS_VALUE" "$STORAGE_ORPHAN_PATH"
expect_equals "$TOPIC_REDIS_MEMBERS" $'__topic_placeholder__\nentry\norphan'
log "storage topic Redis 同步通过"

CURRENT_STEP="删除 storage topic 成员 entry"
request DELETE "$BASE_URL" "{\"path\":\"$STORAGE_ENTRY_PATH\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 200
ENTRY_EXISTS="$(redis-cli -n "$REDIS_DB" EXISTS "surl:$STORAGE_ENTRY_PATH")"
TOPIC_REDIS_MEMBERS="$(redis-cli -n "$REDIS_DB" ZRANGE "$STORAGE_TOPIC_ITEMS_KEY" 0 -1)"
TOPIC_REDIS_VALUE="$(redis-cli -n "$REDIS_DB" GET "surl:$STORAGE_TOPIC_PATH")"
expect_equals "$ENTRY_EXISTS" "0"
expect_equals "$TOPIC_REDIS_MEMBERS" $'__topic_placeholder__\norphan'
if printf '%s' "$TOPIC_REDIS_VALUE" | /usr/bin/grep -Fq "$STORAGE_ENTRY_PATH"; then
  fail "删除成员后 topic 首页仍然包含 entry"
fi
expect_redis_contains "$TOPIC_REDIS_VALUE" "$STORAGE_ORPHAN_PATH"
log "删除 storage topic 成员 entry 通过"

CURRENT_STEP="删除 storage topic 本身但保留 orphan"
request DELETE "$BASE_URL" "{\"path\":\"$STORAGE_TOPIC_PATH\",\"type\":\"topic\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 200
TOPIC_EXISTS="$(redis-cli -n "$REDIS_DB" EXISTS "surl:$STORAGE_TOPIC_PATH")"
TOPIC_ITEMS_EXISTS="$(redis-cli -n "$REDIS_DB" EXISTS "$STORAGE_TOPIC_ITEMS_KEY")"
ORPHAN_EXISTS="$(redis-cli -n "$REDIS_DB" EXISTS "surl:$STORAGE_ORPHAN_PATH")"
expect_equals "$TOPIC_EXISTS" "0"
expect_equals "$TOPIC_ITEMS_EXISTS" "0"
expect_equals "$ORPHAN_EXISTS" "1"
log "删除 storage topic 本身通过"

CURRENT_STEP="重建 storage topic adopt orphan"
request POST "$BASE_URL" "{\"path\":\"$STORAGE_TOPIC_PATH\",\"type\":\"topic\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"content\":\"1\""
TOPIC_REDIS_MEMBERS="$(redis-cli -n "$REDIS_DB" ZRANGE "$STORAGE_TOPIC_ITEMS_KEY" 0 -1)"
TOPIC_REDIS_VALUE="$(redis-cli -n "$REDIS_DB" GET "surl:$STORAGE_TOPIC_PATH")"
expect_equals "$TOPIC_REDIS_MEMBERS" $'__topic_placeholder__\norphan'
expect_redis_contains "$TOPIC_REDIS_VALUE" "$STORAGE_ORPHAN_PATH"
log "重建 storage topic adopt orphan 通过"

# Rendering behavior
CURRENT_STEP="创建 render topic"
request POST "$BASE_URL" "{\"path\":\"$RENDER_TOPIC_PATH\",\"type\":\"topic\",\"title\":\"$RENDER_TOPIC_TITLE\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"title\":\"$RENDER_TOPIC_TITLE\""
log "创建 render topic 通过"

CURRENT_STEP="空 render topic 公开页渲染"
request GET "$BASE_URL/$RENDER_TOPIC_PATH"
expect_status 200
expect_body_contains "<title>$RENDER_TOPIC_TITLE</title>"
expect_body_contains "<div style=\"font-size: 1.3em; font-weight: bold\">$RENDER_TOPIC_TITLE</div>"
log "空 render topic 公开页渲染通过"

CURRENT_STEP="创建 render topic 条目"
request POST "$BASE_URL" "{\"topic\":\"$RENDER_TOPIC_PATH\",\"path\":\"howl-visual\",\"url\":\"# Howl Visual Draft\\n\\nHello\",\"type\":\"md2html\",\"title\":\"Howl Visual Draft\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
request POST "$BASE_URL" "{\"path\":\"$RENDER_URL_ITEM_PATH\",\"url\":\"https://example.com/reference\",\"type\":\"url\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
request POST "$BASE_URL" "{\"topic\":\"$RENDER_TOPIC_PATH\",\"path\":\"castle-notes\",\"url\":\"castle notes body\",\"type\":\"text\",\"title\":\"Castle Notes\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
log "创建 render topic 条目通过"

CURRENT_STEP="topic 条目可省略 path 自动生成"
request POST "$BASE_URL" "{\"topic\":\"$RENDER_TOPIC_PATH\",\"url\":\"auto path body\",\"type\":\"text\",\"title\":\"Auto Path\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"path\":\"$RENDER_TOPIC_PATH/"
expect_body_matches "$RENDER_AUTO_ITEM_GREP"
log "topic 条目自动生成 path 通过"

CURRENT_STEP="render md2html 公开页渲染"
request GET "$BASE_URL/$RENDER_HTML_ITEM_PATH"
expect_status 200
expect_body_contains "<title>Howl Visual Draft</title>"
expect_body_contains "href=\"/$RENDER_TOPIC_PATH\""
expect_body_contains "<div style=\"font-size: 1.3em; font-weight: bold\">$RENDER_TOPIC_TITLE</div>"
expect_body_contains "<strong>Home</strong>"
expect_body_contains "/  <span style=\"color: #666;\">Howl Visual Draft</span>"
expect_body_not_contains "katex"
expect_body_not_contains "mathjax"
log "render md2html 公开页渲染通过"

CURRENT_STEP="更新 render topic title"
request PUT "$BASE_URL" "{\"path\":\"$RENDER_TOPIC_PATH\",\"type\":\"topic\",\"title\":\"$RENDER_TOPIC_UPDATED_TITLE\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"title\":\"$RENDER_TOPIC_UPDATED_TITLE\""
log "更新 render topic title 通过"

CURRENT_STEP="更新 title 后新 md2html 使用新 topic title"
request POST "$BASE_URL" "{\"topic\":\"$RENDER_TOPIC_PATH\",\"path\":\"moving-castle\",\"url\":\"# Moving Castle\\n\\nHello\",\"type\":\"md2html\",\"title\":\"Moving Castle\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
request GET "$BASE_URL/$RENDER_UPDATED_HTML_ITEM_PATH"
expect_status 200
expect_body_contains "<div style=\"font-size: 1.3em; font-weight: bold\">$RENDER_TOPIC_UPDATED_TITLE</div>"
log "更新 title 后新 md2html 使用新 topic title 通过"

CURRENT_STEP="旧 md2html 不追溯更新 topic title"
request GET "$BASE_URL/$RENDER_HTML_ITEM_PATH"
expect_status 200
expect_body_contains "<div style=\"font-size: 1.3em; font-weight: bold\">$RENDER_TOPIC_TITLE</div>"
expect_body_not_contains "<div style=\"font-size: 1.3em; font-weight: bold\">$RENDER_TOPIC_UPDATED_TITLE</div>"
log "旧 md2html 不追溯更新 topic title 通过"

CURRENT_STEP="render topic 首页渲染"
request GET "$BASE_URL/$RENDER_TOPIC_PATH"
expect_status 200
expect_body_contains "<title>$RENDER_TOPIC_UPDATED_TITLE</title>"
expect_body_contains "<div style=\"font-size: 1.3em; font-weight: bold\">$RENDER_TOPIC_UPDATED_TITLE</div>"
expect_body_contains "<span style=\"color: #666;\">Home</span>"
expect_body_contains "$CURRENT_YEAR"
expect_body_contains "Howl Visual Draft"
expect_body_contains "href=\"/$RENDER_HTML_ITEM_PATH\""
expect_body_contains "Moving Castle"
expect_body_contains "href=\"/$RENDER_UPDATED_HTML_ITEM_PATH\""
expect_body_contains "Castle Notes"
expect_body_contains "☰ · $CURRENT_DATE"
expect_body_contains "href=\"/$RENDER_TOPIC_PATH/notes/reference-link\""
expect_body_contains "↗ · $CURRENT_DATE"
expect_body_contains " · $CURRENT_DATE"
expect_body_not_contains "  · "
log "render topic 首页渲染通过"

CURRENT_STEP="缺失 topic 的负面路径"
request POST "$BASE_URL" "{\"topic\":\"missing-$RENDER_TOPIC_PATH\",\"path\":\"x\",\"url\":\"hello\",\"type\":\"text\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_body_contains "\"error\":\"topic does not exist\""
log "缺失 topic 的负面路径通过"

CURRENT_STEP="topic 请求不允许根路径"
request POST "$BASE_URL" "{\"topic\":\"$RENDER_TOPIC_PATH\",\"path\":\"///\",\"url\":\"hello\",\"type\":\"text\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_body_contains "\"error\":\"\`path\` cannot be \\\"/\\\" when \`topic\` is provided\""
log "topic 根路径保护通过"

CURRENT_STEP="topic 与 path 不匹配的负面路径"
request POST "$BASE_URL" "{\"topic\":\"$RENDER_TOPIC_PATH\",\"path\":\"other/castle\",\"url\":\"hello\",\"type\":\"text\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_body_contains "\"error\":\"\`topic\` and \`path\` must match\""
log "topic 与 path 不匹配的负面路径通过"

# Read contract
CURRENT_STEP="创建 read contract 资源"
request POST "$BASE_URL" "{\"path\":\"$READ_TEXT_PATH\",\"url\":\"hello\",\"type\":\"text\",\"title\":\"Greeting\",\"ttl\":5}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_not_contains "expires_in"
request POST "$BASE_URL" "{\"path\":\"$READ_URL_PATH\",\"url\":\"https://example.com/redirect\",\"type\":\"url\",\"title\":\"Ref\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
request POST "$BASE_URL" "{\"path\":\"$READ_HTML_PATH\",\"url\":\"<h1>Hello Html</h1>\",\"type\":\"html\",\"title\":\"Html Title\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
request POST "$BASE_URL" "{\"path\":\"$READ_TOPIC_PATH\",\"type\":\"topic\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
request POST "$BASE_URL" "{\"topic\":\"$READ_TOPIC_PATH\",\"path\":\"entry\",\"url\":\"# Topic Entry\\n\\nBody\",\"type\":\"md2html\",\"title\":\"Topic Entry\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
log "创建 read contract 资源通过"

CURRENT_STEP="GET body 单条 lookup"
request GET "$BASE_URL" "{\"path\":\"$READ_TEXT_PATH\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"title\":\"Greeting\""
expect_body_matches "\"ttl\":(4|5)"
expect_body_contains "\"content\":\"hello\""
log "GET body 单条 lookup 通过"

CURRENT_STEP="PUT 更新返回 overwritten"
request PUT "$BASE_URL" "{\"path\":\"$READ_TEXT_PATH\",\"url\":\"hello updated body\",\"type\":\"text\",\"title\":\"Greeting Updated\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"ttl\":null"
expect_body_contains "\"overwritten\":\"hello\""
expect_body_not_contains "expires_in"
log "PUT 更新返回 overwritten 通过"

CURRENT_STEP="GET body topic lookup"
request GET "$BASE_URL" "{\"path\":\"$READ_TOPIC_PATH\",\"type\":\"topic\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"type\":\"topic\""
expect_body_contains "\"ttl\":null"
expect_body_contains "\"content\":\"1\""
log "GET body topic lookup 通过"

CURRENT_STEP="GET body topic list"
redis-cli -n "$REDIS_DB" SET "surl:$GHOST_TOPIC_PATH" '{"type":"topic","content":"<html></html>","title":"ghost"}' >/dev/null
request GET "$BASE_URL" "{\"type\":\"topic\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"path\":\"$READ_TOPIC_PATH\""
expect_body_not_contains "\"path\":\"$GHOST_TOPIC_PATH\""
log "GET body topic list 通过"

CURRENT_STEP="GET body 全量列表"
request GET "$BASE_URL" "{}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"path\":\"$READ_TEXT_PATH\""
expect_body_contains "\"path\":\"$READ_TOPIC_PATH\""
expect_body_contains "\"content\":\"1\""
log "GET body 全量列表通过"

CURRENT_STEP="公开读取 read contract 资源"
request GET "$BASE_URL/$READ_TEXT_PATH"
expect_status 200
expect_header_contains "^content-type: text/plain; charset=utf-8"
request GET "$BASE_URL/$READ_HTML_PATH"
expect_status 200
expect_header_contains "^content-type: text/html; charset=utf-8"
request GET "$BASE_URL/$READ_TOPIC_PATH"
expect_status 200
expect_header_contains "^content-type: text/html; charset=utf-8"
expect_body_contains "Topic Entry"
request GET "$BASE_URL/$READ_URL_PATH"
expect_status 302
expect_header_contains "^location: https://example.com/redirect"
log "公开读取 read contract 资源通过"

CURRENT_STEP="GET body type/convert 冲突"
request GET "$BASE_URL" "{\"path\":\"$READ_TEXT_PATH\",\"type\":\"topic\",\"convert\":\"text\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_body_contains "\"error\":\"\`type\` and \`convert\` must match when both are provided\""
log "GET body type/convert 冲突通过"

CURRENT_STEP="普通条目按 topic 查询返回 not_found"
request GET "$BASE_URL" "{\"path\":\"$READ_TEXT_PATH\",\"type\":\"topic\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 404
expect_body_contains "\"code\":\"not_found\""
log "普通条目按 topic 查询通过"

# TTL and topic refresh semantics
CURRENT_STEP="ttl=0 不过期"
request POST "$BASE_URL" "{\"path\":\"$TTL_ZERO_PATH\",\"url\":\"hello zero\",\"type\":\"text\",\"ttl\":0}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"ttl\":null"
TTL_ZERO_REDIS="$(redis-cli -n "$REDIS_DB" TTL "surl:$TTL_ZERO_PATH")"
expect_equals "$TTL_ZERO_REDIS" "-1"
log "ttl=0 不过期通过"

CURRENT_STEP="ttl 正数生效"
request POST "$BASE_URL" "{\"path\":\"$TTL_LIVE_PATH\",\"url\":\"hello live\",\"type\":\"text\",\"ttl\":3}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"ttl\":3"
TTL_LIVE_REDIS="$(redis-cli -n "$REDIS_DB" TTL "surl:$TTL_LIVE_PATH")"
if [ "$TTL_LIVE_REDIS" -le 0 ] || [ "$TTL_LIVE_REDIS" -gt 180 ]; then
  fail "Redis TTL 不在预期范围内: $TTL_LIVE_REDIS"
fi
log "ttl 正数生效通过"

CURRENT_STEP="ttl=365 天生效"
request POST "$BASE_URL" "{\"path\":\"$TTL_MAX_PATH\",\"url\":\"hello max\",\"type\":\"text\",\"ttl\":525600}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
expect_body_contains "\"ttl\":525600"
TTL_MAX_REDIS="$(redis-cli -n "$REDIS_DB" TTL "surl:$TTL_MAX_PATH")"
if [ "$TTL_MAX_REDIS" -le 31449600 ] || [ "$TTL_MAX_REDIS" -gt 31536000 ]; then
  fail "Redis TTL 不在 365 天预期范围内: $TTL_MAX_REDIS"
fi
log "ttl=365 天生效通过"

CURRENT_STEP="ttl 非法值全部拒绝"
request POST "$BASE_URL" "{\"path\":\"bad-ttl-decimal\",\"url\":\"hello\",\"type\":\"text\",\"ttl\":1.5}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_body_contains "\"error\":\"\`ttl\` must be a natural number\""
request POST "$BASE_URL" "{\"path\":\"bad-ttl-string\",\"url\":\"hello\",\"type\":\"text\",\"ttl\":\"10\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_body_contains "\"error\":\"\`ttl\` must be a natural number\""
request POST "$BASE_URL" "{\"path\":\"bad-ttl-bool\",\"url\":\"hello\",\"type\":\"text\",\"ttl\":true}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_body_contains "\"error\":\"\`ttl\` must be a natural number\""
request POST "$BASE_URL" "{\"path\":\"bad-ttl-too-large\",\"url\":\"hello\",\"type\":\"text\",\"ttl\":525601}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_body_contains "\"error\":\"\`ttl\` must be between 0 and 525600 minutes\""
log "ttl 非法值全部拒绝通过"

CURRENT_STEP="topic 不支持 ttl"
request POST "$BASE_URL" "{\"path\":\"$TTL_TOPIC_PATH\",\"type\":\"topic\",\"ttl\":10}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_body_contains "\"error\":\"topic does not support ttl\""
log "topic 不支持 ttl 通过"

CURRENT_STEP="普通路径已存在时不能创建 topic"
request POST "$BASE_URL" "{\"path\":\"$TTL_TOPIC_CONFLICT_PATH\",\"url\":\"hello\",\"type\":\"text\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
request POST "$BASE_URL" "{\"path\":\"$TTL_TOPIC_CONFLICT_PATH\",\"type\":\"topic\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 409
expect_body_contains "\"code\":\"conflict\""
log "普通路径已存在时不能创建 topic 通过"

CURRENT_STEP="topic refresh 清理 stale member"
request POST "$BASE_URL" "{\"path\":\"$TTL_TOPIC_PATH\",\"type\":\"topic\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
request POST "$BASE_URL" "{\"topic\":\"$TTL_TOPIC_PATH\",\"path\":\"entry\",\"url\":\"hello stale\",\"type\":\"text\",\"ttl\":0}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 201
request GET "$BASE_URL" "{\"path\":\"$TTL_TOPIC_PATH\",\"type\":\"topic\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"content\":\"1\""
redis-cli -n "$REDIS_DB" DEL "surl:$TTL_TOPIC_ITEM_PATH" >/dev/null
request GET "$BASE_URL" "{\"path\":\"$TTL_TOPIC_PATH\",\"type\":\"topic\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"content\":\"1\""
request PUT "$BASE_URL" "{\"path\":\"$TTL_TOPIC_PATH\",\"type\":\"topic\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 200
expect_body_contains "\"content\":\"0\""
TTL_TOPIC_ZCARD="$(redis-cli -n "$REDIS_DB" ZCARD "topic:$TTL_TOPIC_PATH:items")"
expect_equals "$TTL_TOPIC_ZCARD" "1"
log "topic refresh 清理 stale member 通过"

CURRENT_STEP="DELETE type/convert 冲突"
request DELETE "$BASE_URL" "{\"path\":\"$TTL_ZERO_PATH\",\"type\":\"topic\",\"convert\":\"text\"}" \
  -H "Authorization: Bearer $SECRET_KEY" \
  -H "Content-Type: application/json"
expect_status 400
expect_body_contains "\"error\":\"\`type\` and \`convert\` must match when both are provided\""
log "DELETE type/convert 冲突通过"

echo "PASS: API smoke"
