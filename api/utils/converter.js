/**
 * 内容转换工具模块
 * 提供 Markdown → HTML 和文本 → QR 码的转换功能
 */

import { marked } from 'marked';
import qrcode from 'qrcode-terminal';

/**
 * 将 Markdown 转换为完整的 HTML 页面
 * 
 * @param {string} markdown - Markdown 文本
 * @returns {string} 完整的 HTML 页面（包含样式）
 * @throws {Error} 转换失败时抛出错误
 * 
 * @example
 * const html = convertMarkdownToHtml('# Hello\n\n**Bold** text');
 */
export function convertMarkdownToHtml(markdown) {
  try {
    // 配置 marked 以支持 GitHub Flavored Markdown
    marked.setOptions({
      gfm: true,           // GitHub Flavored Markdown
      breaks: true,        // 单换行转 <br>
      headerIds: true,     // 为标题生成 id
      mangle: false        // 不混淆邮箱地址
    });

    const htmlBody = marked.parse(markdown);

    // 使用 GitHub Markdown CSS 样式
    const cssUrl = 'https://cdn.jsdelivr.net/gh/sindresorhus/github-markdown-css/github-markdown.css';
    const darkBg = '#0d1117';

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, minimal-ui">
<title></title>
<link rel="stylesheet" href="${cssUrl}">
<style>
  body {
    box-sizing: border-box;
    min-width: 200px;
    max-width: 980px;
    margin: 0 auto;
    padding: 45px;
  }
  .markdown-body .markdown-alert {
    padding: 0.5rem 1rem;
  }
  @media (prefers-color-scheme: dark) {
    body {
      background-color: ${darkBg};
    }
  }
  @media (max-width: 767px) {
    body {
      max-width: 100%;
      padding: 25px;
    }
  }
</style>
</head>
<body>
<article class="markdown-body">
${htmlBody}
</article>
</body>
</html>`;
  } catch (error) {
    throw new Error(`Markdown conversion failed: ${error.message}`);
  }
}

/**
 * 将文本转换为 UTF-8 QR 码（终端艺术字符）
 * 
 * @param {string} text - 要转换的文本
 * @returns {Promise<string>} QR 码字符串（包含说明横幅）
 * @throws {Error} 转换失败时抛出错误
 * 
 * @example
 * const qr = await convertToQrCode('https://example.com');
 * 
 * @note
 * - 输入长度超过 250 字符时会拒绝转换（QR 码容量限制）
 * - 生成的是小尺寸 QR 码（适合终端显示）
 */
export function convertToQrCode(text) {
  return new Promise((resolve, reject) => {
    const textLength = text.length;
    
    // QR 码容量限制：超过 250 字符时拒绝转换
    if (textLength > 250) {
      reject(new Error(
        `QR code conversion failed: input length ${textLength} exceeds 250 characters`
      ));
      return;
    }

    try {
      let qrOutput = '';
      
      // 使用 qrcode-terminal 生成小尺寸 QR 码
      // 捕获输出到字符串而非直接打印到控制台
      qrcode.generate(text, { small: true }, (qr) => {
        qrOutput = qr;
      });

      if (!qrOutput) {
        reject(new Error('QR code generation produced empty output'));
        return;
      }

      // 添加说明横幅（匹配客户端脚本格式）
      const banner = '📷 Scan this QR code';
      resolve(`${banner}\n\n${qrOutput}`);
    } catch (error) {
      reject(new Error(`QR code conversion failed: ${error.message}`));
    }
  });
}
