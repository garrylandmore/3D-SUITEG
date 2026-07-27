import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_API_URL = 'http://localhost:7201';

function getApiBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  return configuredUrl || DEFAULT_API_URL;
}

async function proxyRequest(
  request: NextRequest,
  context: { params: { path: string[] } }
) {
  const apiBaseUrl = getApiBaseUrl();
  const joinedPath = context.params.path.join('/');
  const targetUrl = `${apiBaseUrl}/api/${joinedPath}${request.nextUrl.search}`;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('host');
  requestHeaders.delete('connection');
  requestHeaders.delete('content-length');

  const shouldIncludeBody =
    request.method !== 'GET' && request.method !== 'HEAD';

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: requestHeaders,
      body: shouldIncludeBody ? await request.arrayBuffer() : undefined,
      cache: 'no-store',
    });

    // IMPORTANT: Do not call response.arrayBuffer(), response.text(), or
    // response.json() here. Doing so buffers the backend response and prevents
    // NDJSON/SSE-style progress events from reaching the dashboard live.
    const responseHeaders = new Headers(response.headers);

    // Let the Next.js/Node response layer calculate streaming transfer details.
    responseHeaders.delete('content-length');
    responseHeaders.delete('transfer-encoding');
    responseHeaders.delete('connection');

    // Prevent intermediaries from caching or transforming streamed output.
    if (!responseHeaders.has('cache-control')) {
      responseHeaders.set('cache-control', 'no-cache, no-store, no-transform');
    }

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: 'API service unavailable',
        details: error?.message || 'Failed to reach backend API',
        target: targetUrl,
      },
      { status: 503 }
    );
  }
}

export { proxyRequest as GET };
export { proxyRequest as POST };
export { proxyRequest as PATCH };
export { proxyRequest as PUT };
export { proxyRequest as DELETE };
