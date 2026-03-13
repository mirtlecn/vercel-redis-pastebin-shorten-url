/**
 * HTTP response helpers with consistent content types and payload formatting.
 */

export function jsonResponse(res, data, status = 200) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).send(JSON.stringify(data) + '\n');
}

export function errorResponse(res, { code, message, hint, details } = {}, status = 400) {
  const payload = {
    error: message || 'Request failed',
    code: code || 'invalid_request',
  };
  if (hint) payload.hint = hint;
  if (details !== undefined) payload.details = details;
  return jsonResponse(res, payload, status);
}

export function textResponse(res, text, cache = true) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  if (cache) res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  res.status(200).send(text + '\n');
}

export function htmlResponse(res, html, cache = true) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (cache) res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  res.status(200).send(html);
}

export function redirectResponse(res, url, cache = true) {
  const headers = { Location: url };
  if (cache) {
    headers['Cache-Control'] = 'public, max-age=86400, s-maxage=86400';
  }
  res.writeHead(302, headers);
  res.end();
}

export function binaryResponse(res, { buffer, contentType, contentLength, cache = true } = {}) {
  res.statusCode = 200;
  if (contentType) res.setHeader('Content-Type', contentType);
  const length = contentLength || (buffer ? buffer.length : 0);
  if (length) res.setHeader('Content-Length', length);
  if (cache) res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  res.end(buffer || Buffer.alloc(0));
}

/**
 * Stream an S3 object to the client without changing the browser URL.
 */
export function proxyStreamResponse(res, s3Object) {
  const { body, contentType, contentLength } = s3Object;
  res.statusCode = 200;
  if (contentType) res.setHeader('Content-Type', contentType);
  if (contentLength) res.setHeader('Content-Length', contentLength);
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  body.pipe(res);
}

/**
 * Stream an S3 object to the client and populate cache when size constraints allow it.
 */
export function proxyStreamWithCache(res, s3Object, { maxBytes, writeCache } = {}) {
  const { body, contentType, contentLength } = s3Object;
  const length = contentLength || 0;

  if (!writeCache || !maxBytes || length === 0 || length > maxBytes) {
    proxyStreamResponse(res, s3Object);
    return Promise.resolve();
  }

  res.statusCode = 200;
  if (contentType) res.setHeader('Content-Type', contentType);
  if (contentLength) res.setHeader('Content-Length', contentLength);
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');

  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    body.on('data', (chunk) => {
      total += chunk.length;
      chunks.push(chunk);
      res.write(chunk);
    });

    body.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks, total);
        await writeCache(buffer, { contentType, contentLength: contentLength || buffer.length });
      } catch (error) {
        console.warn('Cache write failed:', error);
      } finally {
        res.end();
        resolve();
      }
    });

    body.on('error', (error) => {
      if (!res.headersSent) {
        return reject(error);
      }
      res.end();
      resolve();
    });
  });
}
