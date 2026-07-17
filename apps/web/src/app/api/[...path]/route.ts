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

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');

  const shouldIncludeBody = request.method !== 'GET' && request.method !== 'HEAD';

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: shouldIncludeBody ? await request.arrayBuffer() : undefined,
    });

    const responseBody = await response.arrayBuffer();

    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
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
