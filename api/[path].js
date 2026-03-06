/**
 * GET /:path
 *
 * 已认证：返回该条目的 JSON 信息（供管理用）
 * 未认证：按类型响应——URL 重定向、HTML 渲染、纯文本输出
 */

import { getRedisClient } from './redis.js';
import { jsonResponse, textResponse, htmlResponse, redirectResponse, proxyStreamResponse } from './utils/response.js';
import { isAuthenticated } from './utils/auth.js';
import { LINKS_PREFIX, parseStoredValue, previewContent, getDomain } from './utils/storage.js';
import { getS3Object, isS3Configured } from './utils/s3.js';

export default async function handler(req, res) {
  try {
    const path = decodeURIComponent(req.url).slice(1);

    if (!path) return jsonResponse(res, { error: 'URL not found' }, 404);

    const redis = await getRedisClient();
    const stored = await redis.get(LINKS_PREFIX + path);

    if (!stored) return jsonResponse(res, { error: 'URL not found' }, 404);

    const { type, content } = parseStoredValue(stored);

    // 已认证：返回条目详情，不执行重定向/渲染/代理
    if (isAuthenticated(req)) {
      return jsonResponse(res, {
        surl: `${getDomain(req)}/${path}`,
        path,
        type,
        content: previewContent(type, content),
      });
    }

    // 未认证 file 类型：流式代理，地址栏 URL 保持不变
    if (type === 'file') {
      if (!isS3Configured()) {
        return jsonResponse(res, { error: 'S3 service is not configured' }, 501);
      }
      try {
        const s3Object = await getS3Object(content);
        return proxyStreamResponse(res, s3Object);
      } catch (error) {
        console.error('Failed to serve file', error);
        return jsonResponse(res, { error: 'Failed to retrieve file' }, 500);
      }
    }

    // 未认证：按类型响应
    if (type === 'url') {
      redirectResponse(res, content);
    } else if (type === 'html') {
      htmlResponse(res, content);
    } else {
      textResponse(res, content);
    }
  } catch (error) {
    console.error('Error:', error);
    return jsonResponse(res, { error: 'Internal server error' }, 500);
  }
}
