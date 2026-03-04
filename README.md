# Vercel URL Shortener & Pastebin

基于 Vercel + Redis 的短链接服务 & 文本分享工具。

## 功能特性

### 短链接功能
- ✅ 创建短链接（自动生成或自定义路径）
- ✅ 支持多种 URL scheme（http、https、ftp、mailto 等）
- ✅ 自动 302 重定向

### Pastebin 功能
- ✅ 分享纯文本、代码片段
- ✅ 保持文本格式和换行
- ✅ 支持 HTML 渲染（`type: html`）
- ✅ 最大支持 500KB 文本（可通过 `MAX_CONTENT_SIZE_KB` 调整）

### 内容转换功能 🎨
- ✅ **Markdown → HTML**：自动渲染为 GitHub 风格页面（支持 GFM）
- ✅ **QR 码生成**：将 URL/文本转为终端 UTF-8 二维码
- ✅ **类型设置**：一键指定为 `html`、`url` 或 `text` 类型
- ✅ **服务端转换**：客户端零依赖，无需安装额外工具

### 通用功能
- ✅ 支持 TTL（过期时间，单位：分钟）
- ✅ 列出所有短链接和文本
- ✅ 删除短链接或文本
- ✅ Bearer Token 认证保护

## 环境变量

创建 `.env.local` 文件（用于本地开发，优先级高于 `.env`）：

```bash
LINKS_REDIS_URL=redis://localhost:6379
SECRET_KEY=your-secret-key-here
# MAX_CONTENT_SIZE_KB=500   # 可选，默认 500
# PORT=3000                 # 可选，默认 3000
```

部署到 Vercel 时，在项目设置中添加 `LINKS_REDIS_URL` 和 `SECRET_KEY`。

## 本地开发

1. 安装依赖：
   ```bash
   npm install
   ```

2. 启动本地 Redis

3. 启动服务器：
   ```bash
   npm start         # 默认监听 http://localhost:3000
   ```

   也可以使用 Vercel CLI：
   ```bash
   vercel dev
   ```

4. 访问 http://localhost:3000

### 封装 CLI

下载 `cli/post` 试用：

**依赖要求**：
- ✅ `curl` + `jq`（通常系统自带）
- ✅ 剪贴板工具（可选）：`pbcopy/pbpaste` (macOS) 或 `xclip/xsel` (Linux)
- ❌ ~~不再需要~~：`pandoc`、`qrencode`、`GITHUB_TOKEN`

```bash
> post help
post - paste & short-URL manager

Usage:
  post new [opts] <text...>    Upload text
  post new [opts] -f <file>    Upload file contents
  post new [opts]              Upload clipboard contents (no -f, no text, no stdin)
  echo "..." | post [new]      Upload from stdin
  post ls                      List all posts
  post ls <path>               Show a specific post
  post rm <path>               Delete a post
  post help | -h | --help      Show this help

Options for 'new':
  -f, --file <path>              Read content from file
  -s, --slug <path>              Custom slug/path (default: auto-generated)
  -t, --ttl <minutes>            Expiration time in minutes (default: never)
  -u, --update                   Overwrite if slug already exists (uses PUT)
  -y, --no-confirm               Skip confirmation prompt
  -c, --convert <mode>           Convert/type before uploading:
                                   html    → set type to html
                                   md2html → convert Markdown to HTML (type: html)
                                   url     → set type to url
                                   text    → set type to text
                                   qrcode  → convert content to QR code

Environment variables:
  POST_HOST    Base endpoint URL (e.g. https://example.com)
  POST_TOKEN   Bearer token

Examples:
  post new hello world
  post new -f ~/notes.txt
  post new -s mycode -f script.sh
  post new -t 60 "expires in 1 hour"
  post new -y "quick note"
  post new                          # uploads clipboard
  echo "piped" | post
  echo "piped" | post new -s myslug
  post new -c md2html -f README.md  # Markdown → HTML
  post new -c qrcode "https://..."  # generate QR code
  post ls
  post ls myslug
  post rm myslug
```

### API

#### POST /  创建条目（path 已存在时拒绝）
```bash
curl -X POST http://localhost:3000/ \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","path":"mylink"}'
```

响应示例（201 Created）：
```json
{
  "surl": "http://localhost:3000/mylink",
  "path": "mylink",
  "url": "https://example.com",
  "expires_in": "never"
}
```

path 已存在时返回 409 Conflict：
```json
{
  "error": "path \"mylink\" already exists",
  "hint": "Use PUT to overwrite",
  "existing": {
    "surl": "http://localhost:3000/mylink",
    "type": "url",
    "content": "https://example.com"
  }
}
```

#### PUT /  创建或覆写条目（幂等）
```bash
curl -X PUT http://localhost:3000/ \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://new-target.com","path":"mylink"}'
```

- path 不存在 → 201 Created
- path 已存在 → 200 OK，并附带 `overwritten` 字段：

```json
{
  "surl": "http://localhost:3000/mylink",
  "path": "mylink",
  "url": "https://new-target.com",
  "expires_in": "never",
  "overwritten": "https://example.com"
}
```

#### POST / PUT 通用参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | string | ✅ | 目标 URL 或文本内容 |
| `path` | string | ❌ | 自定义路径，省略时随机生成 5 位 |
| `type` | string | ❌ | `url` \| `text` \| `html`，省略时自动检测 |
| `ttl` | number | ❌ | 过期时间（分钟） |
| `convert` | string | ❌ | 内容转换模式（见下方） |

##### `convert` 参数说明

`convert` 字段用于在服务端进行内容转换，支持以下模式：

| 值 | 说明 | 效果 |
|---|------|------|
| `md2html` | Markdown → HTML | 将 Markdown 转为完整 HTML 页面（GitHub 样式），`type` 自动设为 `html` |
| `qrcode` | 生成 QR 码 | 将文本转为 UTF-8 终端二维码（最大 250 字符） |
| `html` | 设置类型为 HTML | 仅设置 `type=html`，不转换内容 |
| `url` | 设置类型为 URL | 仅设置 `type=url`，不转换内容 |
| `text` | 设置类型为纯文本 | 仅设置 `type=text`，不转换内容 |

**示例**：

```bash
# Markdown 转 HTML
curl -X POST http://localhost:3000/ \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "# Hello\n\nThis is **bold**",
    "path": "readme",
    "convert": "md2html"
  }'

# 生成 QR 码
curl -X POST http://localhost:3000/ \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "path": "qr",
    "convert": "qrcode"
  }'
```

**Markdown 转换特性**：
- ✅ 支持 GitHub Flavored Markdown (GFM)
- ✅ 代码块、表格、任务列表、删除线
- ✅ 响应式布局，支持深色模式
- ✅ 自动注入 GitHub Markdown CSS

**QR 码特性**：
- ✅ UTF-8 字符艺术格式（终端友好）
- ✅ 最大支持 250 字符
- ✅ 超长内容会返回错误

**错误处理**：转换失败时返回 400 错误，不会创建记录。

#### 访问内容（无授权）
```bash
# URL → 302 重定向
curl -L http://localhost:3000/mylink

# text → 纯文本
curl http://localhost:3000/script

# html → 浏览器渲染
curl http://localhost:3000/mypage
```

#### 查询单条信息（需认证）
```bash
curl http://localhost:3000/mylink \
  -H "Authorization: Bearer your-secret-key"
```

响应示例：
```json
{
  "surl": "http://localhost:3000/mylink",
  "path": "mylink",
  "type": "url",
  "content": "https://example.com"
}
```

> `text` / `html` 类型的 `content` 会截断为前 15 个字符 + `...`

#### 列出所有短链和文本
```bash
curl http://localhost:3000/ \
  -H "Authorization: Bearer your-secret-key"
```

响应示例：
```json
[
  {
    "surl": "http://localhost:3000/mylink",
    "path": "mylink",
    "type": "url",
    "content": "https://example.com"
  },
  {
    "surl": "http://localhost:3000/script",
    "path": "script",
    "type": "text",
    "content": "#!/bin/bash\nech..."
  },
  {
    "surl": "http://localhost:3000/mypage",
    "path": "mypage",
    "type": "html",
    "content": "<h1>Hello</h1>..."
  }
]
```

#### 导出所有完整内容（需认证）
```bash
curl http://localhost:3000/ \
  -H "Authorization: Bearer your-secret-key" \
  -H "X-Export: true"
```

返回格式同上，但 `text` / `html` 类型的 `content` 不截断。

#### 删除短链或文本
```bash
curl -X DELETE http://localhost:3000/ \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"path":"mylink"}'
```

响应示例：
```json
{
  "deleted": "mylink",
  "url": "https://example.com"
}
```

## 内容类型识别规则

`type` 字段可选值：`url` | `text` | `html`

| type | 存储前缀 | 无授权访问行为 | 有授权访问 |
|------|---------|--------------|-----------|
| `url` | `url:` | 302 重定向 | 返回 JSON |
| `text` | `text:` | 返回 `text/plain` | 返回 JSON（截断） |
| `html` | `html:` | 返回 `text/html`，浏览器渲染 | 返回 JSON（截断） |

**自动识别**（不指定 `type` 时）：
- 内容能解析为合法 URL（含 scheme）→ `url`
- 否则 → `text`

**限制**：
- 文本最大 **500KB**（可通过 `MAX_CONTENT_SIZE_KB` 环境变量调整）
- 超过限制会返回错误

## 部署到 Vercel

1. 安装 Vercel CLI（如果还没安装）：
   ```bash
   npm install -g vercel
   ```

2. 部署：
   ```bash
   vercel
   ```

3. 在 Vercel 项目设置中添加环境变量：
   - `LINKS_REDIS_URL`
   - `SECRET_KEY`

## 项目结构

```
├── api/
│   ├── index.js            # 入口：POST 创建、DELETE 删除、GET 列表/根路径
│   ├── [path].js           # 动态路由：按 path 查找并响应（重定向 / 渲染 / JSON）
│   ├── redis.js            # Redis 客户端单例
│   ├── handlers/
│   │   ├── create.js       # POST/PUT 创建逻辑
│   │   ├── remove.js       # DELETE 删除逻辑
│   │   └── list.js         # GET 列表逻辑
│   └── utils/
│       ├── auth.js         # Bearer Token 认证工具
│       ├── converter.js    # Markdown/QR 码转换工具（新增 🎨）
│       ├── response.js     # HTTP 响应工具（JSON / text / HTML）
│       └── storage.js      # Redis 存储格式序列化 / 反序列化
├── cli/
│   └── post                # 命令行客户端（简化依赖 ✨）
├── server.js               # 本地独立 HTTP 服务器（不用于 Vercel）
├── vercel.json             # Vercel 路由配置
├── package.json
└── README.md
```

## 技术栈

- **后端**：Vercel Serverless Functions (Node.js)
- **数据库**：Redis (支持 TTL)
- **部署**：Vercel
- **认证**：Bearer Token
- **转换**：marked (Markdown), qrcode-terminal (QR 码)

## 注意事项

1. **安全性**：请妥善保管 `SECRET_KEY`，不要泄露或提交到版本控制
2. **Redis**：确保 Redis 服务可访问，建议使用 Redis Cloud 或 Upstash
3. **TTL**：过期时间单位为分钟，最小值为 1 分钟
4. **文本大小**：单个内容默认最大 500KB，可通过 `MAX_CONTENT_SIZE_KB` 调整
5. **URL 格式**：只有包含 scheme 的才会被识别为 URL 并重定向
6. **非 ASCII 路径**：支持中文等 Unicode 字符作为 path，`server.js` 会自动 decode percent-encoded URL

## 常见问题

**Q: 为什么我的域名没有重定向？**  
A: 域名（如 `google.com`）没有 URL scheme，会被当作纯文本。请使用完整 URL（如 `https://google.com`），或显式指定 `"type":"url"`。

**Q: 如何让内容以 JSON 形式返回？**  
A: 添加 `Authorization: Bearer <SECRET_KEY>` 请求头即可。

**Q: 如何渲染 HTML？**  
A: 创建时指定 `"type":"html"`，访问时浏览器会直接渲染 HTML 内容。

**Q: 文本内容为什么被截断？**  
A: 为了列表展示的简洁性，`text` / `html` 类型的内容会截断为前 15 个字符。实际存储的是完整内容。使用 `X-Export: true` 可获取完整内容。

**Q: 支持哪些 URL scheme？**  
A: 所有标准 URL scheme 都支持，包括 `http://`, `https://`, `ftp://`, `mailto:` 等。

**Q: Markdown 转换支持哪些语法？**  
A: 支持 GitHub Flavored Markdown (GFM)，包括代码块、表格、任务列表、删除线等。使用 `convert: "md2html"` 即可。

**Q: QR 码为什么有长度限制？**  
A: QR 码有容量限制，超过 250 字符可能导致二维码过于复杂难以扫描。建议先创建短链接，再将短链接转为 QR 码。

**Q: 客户端工具需要安装什么？**  
A: 只需 `curl` 和 `jq`（通常系统自带）。不再需要 `pandoc`、`qrencode` 等工具，所有转换在服务端完成。
