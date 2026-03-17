/**
 * Content conversion helpers for Markdown and QR code output.
 */

import { marked } from 'marked';
import markedAlert from 'marked-alert';
import markedFootnote from 'marked-footnote';
import { gfmHeadingId } from "marked-gfm-heading-id";
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import qrcode from 'qrcode-terminal';

marked.use(
  { gfm: true, breaks: false },
  markedAlert(),
  markedFootnote(),
  gfmHeadingId(),
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    }
  })
);

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function prependTopicBackLink(
  markdown,
  { pageTitle = '', topicBackLink = '', topicBackLabel = '' } = {},
) {
  if (!topicBackLink) {
    return markdown;
  }

  const topicHeading = `<div style="font-size: 1.3em; font-weight: bold">${escapeHtml(topicBackLabel)}</div>`;
  const titleSuffix = pageTitle
    ? ` <span style="color: #666;">${escapeHtml(pageTitle)}</span>`
    : '';
  return `${topicHeading}\n\n[**Home**](<${topicBackLink}>) / ${titleSuffix}\n\n\n\n\n\n${markdown}`;
}

/**
 * Convert Markdown into a full HTML document.
 */
export function convertMarkdownToHtml(markdown, { pageTitle = '', topicBackLink = '', topicBackLabel = '' } = {}) {
  try {
    // Remove YAML front matter before rendering.
    const stripped = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    const htmlBody = marked.parse(prependTopicBackLink(stripped, { pageTitle, topicBackLink, topicBackLabel }));

    // Base assets are injected only when the rendered result needs them.
    // const cssUrl = 'https://cdn.jsdelivr.net/gh/sindresorhus/github-markdown-css/github-markdown.min.css';
    const cssUrl = 'https://cdn.jsdelivr.net/gh/mirtlecn/public/ravel-gfm.min.css';
    const darkBg = '#0d1117';
    const hlJs = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/highlight.min.js';
    const hlCssLight = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/github.min.css';
    const hlCssDark = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/github-dark.min.css';
    const tocJS = 'https://cdn.jsdelivr.net/gh/mirtlecn/public/gfm-addon.min.js';
    const tocCSS = 'https://cdn.jsdelivr.net/gh/mirtlecn/public/gfm-addon.min.css';

    let extraHead = '';
    let extraBody = '';

    // Inject a table of contents only when the document has enough headings.
    const headingCount = (htmlBody.match(/<h[1-6]\b/gi) || []).length;
    if (headingCount >= 2) {
      extraHead += `<link rel="stylesheet" href="${tocCSS}">\n`;
      extraBody += `<script src="${tocJS}"></script>\n`;
    }

    // Inject highlight assets only when code blocks are present.
    if (htmlBody.includes('<code class="hljs language-') || htmlBody.includes('<code class="language-')) {
      extraHead += `<link rel="stylesheet" href="${hlCssLight}" media="(prefers-color-scheme: light)">\n`;
      extraHead += `<link rel="stylesheet" href="${hlCssDark}" media="(prefers-color-scheme: dark)">\n`;
      extraBody += `<script src="${hlJs}"></script>\n`;
    }

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, minimal-ui">
<title>${escapeHtml(pageTitle)}</title>
<link rel="stylesheet" href="${cssUrl}">
${extraHead}
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
${extraBody}
</body>
</html>`;
  } catch (error) {
    throw new Error(`Markdown conversion failed: ${error.message}`);
  }
}

/**
 * Convert text into a UTF-8 QR code string for terminal-style output.
 */
export function convertToQrCode(text) {
  return new Promise((resolve, reject) => {
    const textLength = text.length;
    
    // Keep the generated QR code within a compact size envelope.
    if (textLength > 250) {
      reject(new Error(
        `QR code conversion failed: input length ${textLength} exceeds 250 characters`
      ));
      return;
    }

    try {
      let qrOutput = '';
      
      // Capture the renderer output as a string instead of writing to stdout.
      qrcode.generate(text, { small: true }, (qr) => {
        qrOutput = qr;
      });

      if (!qrOutput) {
        reject(new Error('QR code generation produced empty output'));
        return;
      }

      const banner = '📷 Scan this QR code';
      resolve(`${banner}\n\n${qrOutput}`);
    } catch (error) {
      reject(new Error(`QR code conversion failed: ${error.message}`));
    }
  });
}
