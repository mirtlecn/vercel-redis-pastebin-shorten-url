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
- ✅ 最大支持 10KB 文本

### 通用功能
- ✅ 支持 TTL（过期时间，单位：分钟）
- ✅ 列出所有短链接和文本
- ✅ 删除短链接或文本
- ✅ Bearer Token 认证保护

## 环境变量

创建 `.env.development.local` 文件（用于本地开发）：

```bash
LINKS_REDIS_URL=redis://default:password@host:port
SECRET_KEY=your-secret-key-here
```

部署到 Vercel 时，在项目设置中添加这些环境变量。

## 本地开发

1. 安装依赖：
   ```bash
   npm install
   ```

2. 启动开发服务器：
   ```bash
   vercel dev --listen 3001
   ```

3. 访问 http://localhost:3001

## API 使用示例

### 短链接功能

#### 创建短链（自动生成路径）
```bash
curl -X POST http://localhost:3001/ \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

响应示例：
```json
{
  "surl": "http://localhost:3001/a1b2c",
  "path": "a1b2c",
  "url": "https://example.com",
  "expires_in": "never"
}
```

#### 创建短链（指定路径）
```bash
curl -X POST http://localhost:3001/ \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","path":"mylink"}'
```

#### 创建短链（指定过期时间，单位：分钟）
```bash
curl -X POST http://localhost:3001/ \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","path":"temp","ttl":60}'
```

响应示例：
```json
{
  "surl": "http://localhost:3001/temp",
  "path": "temp",
  "url": "https://example.com",
  "expires_in": "60 minute(s)"
}
```

#### 访问短链（重定向）
```bash
curl -L http://localhost:3001/mylink
# 自动 302 重定向到 https://example.com
```

#### 查询短链信息（需认证）
```bash
curl http://localhost:3001/mylink \
  -H "Authorization: Bearer your-secret-key"
```

响应示例：
```json
{
  "surl": "http://localhost:3001/mylink",
  "path": "mylink",
  "url": "https://example.com"
}
```

### Pastebin 功能

#### 创建文本片段（自动生成路径）
```bash
curl -X POST http://localhost:3001/ \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"url":"Hello World!\nThis is a text snippet."}'
```

响应示例：
```json
{
  "surl": "http://localhost:3001/x9y2z",
  "path": "x9y2z",
  "text": "Hello World!\nTh...",
  "expires_in": "never"
}
```

> **注意**：`url` 字段用于传递内容，无论是 URL 还是纯文本。如果内容不是有效的 URL（带 scheme），会被当作纯文本处理。

#### 创建代码片段（指定路径）
```bash
curl -X POST http://localhost:3001/ \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"url":"#!/bin/bash\necho \"Hello\"\ndate","path":"script"}'
```

#### 访问文本片段（直接展示）
```bash
curl http://localhost:3001/script
# 直接返回纯文本内容（保持换行）
```

输出示例：
```
#!/bin/bash
echo "Hello"
date
```

#### 查询文本信息（需认证）
```bash
curl http://localhost:3001/script \
  -H "Authorization: Bearer your-secret-key"
```

响应示例：
```json
{
  "surl": "http://localhost:3001/script",
  "path": "script",
  "text": "#!/bin/bash\nech..."
}
```

> **注意**：文本内容会被截断为前 15 个字符 + `...`

### 通用功能

#### 列出所有短链和文本
```bash
curl http://localhost:3001/ \
  -H "Authorization: Bearer your-secret-key"
```

响应示例：
```json
[
  {
    "surl": "http://localhost:3001/mylink",
    "path": "mylink",
    "url": "https://example.com"
  },
  {
    "surl": "http://localhost:3001/script",
    "path": "script",
    "text": "#!/bin/bash\nech..."
  }
]
```

#### 删除短链或文本
```bash
curl -X DELETE http://localhost:3001/ \
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

系统会自动识别内容类型：

- **URL**：内容包含有效的 URL scheme（`http://`、`https://`、`ftp://`、`mailto:` 等）
  - 无授权访问 → **302 重定向**
  - 有授权访问 → 返回 JSON 信息
  
- **纯文本**：不包含 URL scheme 的内容（代码、文本、域名等）
  - 无授权访问 → **直接展示纯文本**（保持换行）
  - 有授权访问 → 返回 JSON 信息（截断为 15 字符）

**限制**：
- 文本最大 **10KB**
- 超过限制会返回错误

**示例**：
- `https://google.com` → URL（重定向）
- `google.com` → 纯文本（展示）
- `这是中文内容` → 纯文本（展示）
- `function hello() {}` → 纯文本（展示）

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
│   ├── redis.js       # Redis 连接管理
│   ├── index.js       # 主 API（创建、列表、删除）
│   └── [path].js      # 动态路由（重定向/展示、查询）
├── vercel.json        # Vercel 配置
├── package.json       # 项目配置
└── README.md          # 项目文档
```

## 技术栈

- **后端**：Vercel Serverless Functions (Node.js)
- **数据库**：Redis (支持 TTL)
- **部署**：Vercel
- **认证**：Bearer Token

## 注意事项

1. **安全性**：请妥善保管 `SECRET_KEY`，不要泄露
2. **Redis**：确保 Redis 服务可访问，建议使用 Redis Cloud 或 Upstash
3. **TTL**：过期时间单位为分钟，最小值为 1 分钟
4. **文本大小**：单个文本最大 10KB
5. **URL 格式**：只有包含 scheme 的才会被识别为 URL 并重定向

## 常见问题

**Q: 为什么我的域名没有重定向？**  
A: 域名（如 `google.com`）没有 URL scheme，会被当作纯文本。请使用完整 URL（如 `https://google.com`）。

**Q: 如何让纯文本以 JSON 形式返回？**  
A: 添加 `Authorization: Bearer <SECRET_KEY>` 请求头即可。

**Q: 文本内容为什么被截断？**  
A: 为了列表展示和删除响应的简洁性，文本会被截断为前 15 个字符。实际存储的是完整内容。

**Q: 支持哪些 URL scheme？**  
A: 所有标准 URL scheme 都支持，包括 `http://`, `https://`, `ftp://`, `mailto:` 等。
