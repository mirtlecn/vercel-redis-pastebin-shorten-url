export function wrapNodeResponse(response) {
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.setHeader = response.setHeader.bind(response);
  response.send = (body) => {
    if (!response.getHeader('Content-Type')) {
      response.setHeader(
        'Content-Type',
        typeof body === 'string' ? 'text/plain' : 'application/json',
      );
    }
    response.end(body);
  };
  return response;
}
