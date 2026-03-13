export function createMockRequest({
  method = 'GET',
  url = '/',
  headers = {},
} = {}) {
  return {
    method,
    url,
    headers,
  };
}

export function createMockResponse() {
  const headers = new Map();

  return {
    headersSent: false,
    statusCode: 200,
    body: undefined,
    ended: false,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    writeHead(statusCode, responseHeaders) {
      this.statusCode = statusCode;
      for (const [headerName, headerValue] of Object.entries(responseHeaders)) {
        this.setHeader(headerName, headerValue);
      }
    },
    write(chunk) {
      if (this.body === undefined) {
        this.body = '';
      }
      this.body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    },
    send(body) {
      this.end(body);
    },
    end(body) {
      if (body !== undefined) {
        this.body = Buffer.isBuffer(body) ? body : String(body);
      } else if (this.body === undefined) {
        this.body = '';
      }
      this.ended = true;
    },
    get headersMap() {
      return headers;
    },
  };
}
