import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import axios from 'axios';
import net from 'node:net';
import tls from 'node:tls';
import type { Socket } from 'node:net';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SmtpSecurity = 'starttls' | 'ssl' | 'none';

type ProxyTestInput = {
  id: string;
  url: string;
};

type ProxyTestResult = {
  id: string;
  url: string;
  ok: boolean;
  webOk: boolean;
  smtpOk: boolean;
  latencyMs: number;
  smtpLatencyMs?: number;
  smtpHost?: string;
  smtpPort?: number;
  ip?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  reason?: string;
  smtpReason?: string;
};

function proxyAxiosConfig(proxyUrl: string) {
  const parsed = new URL(proxyUrl);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP/HTTPS proxies are supported');
  }

  return {
    protocol: parsed.protocol.replace(':', ''),
    host: parsed.hostname,
    port: Number(parsed.port),
    ...(parsed.username
      ? {
          auth: {
            username: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
          },
        }
      : {}),
  };
}

function proxyAuthorizationHeader(parsed: URL): string | undefined {
  if (!parsed.username) return undefined;

  const username = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password || '');
  const encoded = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

async function openProxySocket(parsed: URL, timeoutMs: number): Promise<Socket> {
  const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));

  if (!parsed.hostname || !port) {
    throw new Error('Proxy URL is missing host or port');
  }

  return await new Promise<Socket>((resolve, reject) => {
    let settled = false;
    let socket: Socket;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      socket?.destroy();
      reject(error);
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      socket.setTimeout(0);
      socket.removeListener('error', onError);
      socket.removeListener('timeout', onTimeout);
      resolve(socket);
    };

    const onError = (error: Error) => fail(error);
    const onTimeout = () => fail(new Error(`Proxy connection timed out after ${timeoutMs} ms`));

    if (parsed.protocol === 'https:') {
      socket = tls.connect({
        host: parsed.hostname,
        port,
        servername: parsed.hostname,
      });
      socket.once('secureConnect', succeed);
    } else {
      socket = net.connect({
        host: parsed.hostname,
        port,
      });
      socket.once('connect', succeed);
    }

    socket.setTimeout(timeoutMs);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
  });
}

async function testSmtpTunnel(
  proxyUrl: string,
  smtpHost: string,
  smtpPort: number,
  timeoutMs = 10_000
): Promise<{ ok: boolean; latencyMs: number; reason?: string }> {
  const started = Date.now();
  let socket: Socket | undefined;

  try {
    const parsed = new URL(proxyUrl);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only HTTP/HTTPS proxies are supported');
    }

    socket = await openProxySocket(parsed, timeoutMs);

    const authHeader = proxyAuthorizationHeader(parsed);
    const requestLines = [
      `CONNECT ${smtpHost}:${smtpPort} HTTP/1.1`,
      `Host: ${smtpHost}:${smtpPort}`,
      'Proxy-Connection: Keep-Alive',
      'Connection: Keep-Alive',
      ...(authHeader ? [`Proxy-Authorization: ${authHeader}`] : []),
      '',
      '',
    ];

    const statusLinePromise = new Promise<string>((resolve, reject) => {
      let buffer = '';
      let finished = false;

      const hardTimer = setTimeout(() => {
        finishError(new Error(`SMTP CONNECT hard timeout after ${timeoutMs} ms`));
        socket?.destroy();
      }, timeoutMs + 250);

      const cleanup = () => {
        clearTimeout(hardTimer);
        socket?.removeListener('data', onData);
        socket?.removeListener('error', onError);
        socket?.removeListener('timeout', onTimeout);
        socket?.removeListener('close', onClose);
      };

      const finishError = (error: Error) => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(error);
      };

      const onError = (error: Error) => finishError(error);
      const onTimeout = () =>
        finishError(new Error(`SMTP CONNECT timed out after ${timeoutMs} ms`));
      const onClose = () =>
        finishError(new Error('Proxy closed the CONNECT tunnel before replying'));

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('latin1');

        if (buffer.length > 32_768) {
          finishError(new Error('Proxy returned an oversized CONNECT response'));
          return;
        }

        if (!buffer.includes('\r\n\r\n')) return;

        const line = buffer.split('\r\n', 1)[0] || '';
        finished = true;
        cleanup();
        resolve(line);
      };

      // Attach every listener BEFORE sending CONNECT. Some proxies reply immediately.
      socket?.setTimeout(timeoutMs);
      socket?.on('data', onData);
      socket?.once('error', onError);
      socket?.once('timeout', onTimeout);
      socket?.once('close', onClose);
    });

    socket.write(requestLines.join('\r\n'));
    const statusLine = await statusLinePromise;

    const match = statusLine.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})\b/i);
    const statusCode = match ? Number(match[1]) : 0;

    if (statusCode !== 200) {
      throw new Error(
        statusCode
          ? `Proxy denied SMTP CONNECT: ${statusLine}`
          : `Invalid CONNECT response: ${statusLine || 'empty response'}`
      );
    }

    return {
      ok: true,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    socket?.destroy();
  }
}

async function withHardTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} hard timeout after ${timeoutMs} ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function testOneProxy(
  proxy: ProxyTestInput,
  smtpHost?: string,
  smtpPort?: number
): Promise<ProxyTestResult> {
  const started = Date.now();

  let webResult: {
    ok: boolean;
    ip?: string;
    country?: string;
    countryCode?: string;
    region?: string;
    city?: string;
    reason?: string;
  } = { ok: false };

  try {
    const proxyConfig = proxyAxiosConfig(proxy.url);
    const response = await axios.get('https://ipwho.is/', {
      proxy: proxyConfig,
      timeout: 12_000,
      validateStatus: (status) => status >= 200 && status < 500,
      headers: {
        Accept: 'application/json',
        'User-Agent': '3D-SUITEG-Proxy-Test/1.0',
      },
    });

    const data = (response.data || {}) as Record<string, unknown>;

    if (response.status >= 400 || data.success === false || !data.ip) {
      const message = String(data.message || `HTTP ${response.status}`);
      throw new Error(message);
    }

    webResult = {
      ok: true,
      ip: String(data.ip || ''),
      country: String(data.country || ''),
      countryCode: String(data.country_code || '').toUpperCase(),
      region: String(data.region || ''),
      city: String(data.city || ''),
    };
  } catch (error) {
    const value = error as {
      code?: string;
      message?: string;
      response?: { status?: number };
    };

    const code = String(value?.code || '').trim();
    const message = String(value?.message || error || 'Proxy web test failed');
    const status = value?.response?.status;

    webResult = {
      ok: false,
      reason: `${code ? `${code}: ` : ''}${message}${status ? ` (HTTP ${status})` : ''}`,
    };
  }

  let smtpResult: { ok: boolean; latencyMs?: number; reason?: string } = {
    ok: true,
  };

  if (smtpHost && smtpPort) {
    smtpResult = await testSmtpTunnel(proxy.url, smtpHost, smtpPort, 10_000);
  }

  const overallOk = webResult.ok && smtpResult.ok;

  return {
    id: proxy.id,
    url: proxy.url,
    ok: overallOk,
    webOk: webResult.ok,
    smtpOk: smtpResult.ok,
    latencyMs: Date.now() - started,
    smtpLatencyMs: smtpResult.latencyMs,
    smtpHost,
    smtpPort,
    ip: webResult.ip,
    country: webResult.country,
    countryCode: webResult.countryCode,
    region: webResult.region,
    city: webResult.city,
    reason: !webResult.ok ? webResult.reason : undefined,
    smtpReason: !smtpResult.ok ? smtpResult.reason : undefined,
  };
}

async function testProxyPool(
  proxies: ProxyTestInput[],
  smtpHost?: string,
  smtpPort?: number
) {
  const results: ProxyTestResult[] = new Array(proxies.length);
  let cursor = 0;
  const workerCount = Math.min(6, Math.max(1, proxies.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= proxies.length) return;
        try {
          results[index] = await withHardTimeout(
            testOneProxy(proxies[index], smtpHost, smtpPort),
            20_000,
            `Proxy ${index + 1} test`
          );
        } catch (error) {
          results[index] = {
            id: proxies[index].id,
            url: proxies[index].url,
            ok: false,
            webOk: false,
            smtpOk: false,
            latencyMs: 20_000,
            smtpHost,
            smtpPort,
            reason: error instanceof Error ? error.message : String(error),
            smtpReason: error instanceof Error ? error.message : String(error),
          };
        }
      }
    })
  );

  return results;
}

type SmtpAccount = {
  id: string;
  label: string;
  host: string;
  port: number;
  security: SmtpSecurity;
  username: string;
  password: string;
  fromEmail: string;
  enabled: boolean;
  maxSends: number;
};

function classifyError(error: unknown): {
  kind: 'invalid' | 'timeout';
  reason: string;
} {
  const value = error as {
    code?: string;
    responseCode?: number;
    command?: string;
    message?: string;
  };

  const code = String(value?.code || '').toUpperCase();
  const message = String(value?.message || error || 'Unknown SMTP error');

  const timeoutCodes = new Set([
    'ETIMEDOUT',
    'ESOCKETTIMEDOUT',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ECONNREFUSED',
    'EPROXY',
  ]);

  if (
    timeoutCodes.has(code) ||
    /timeout|timed out|socket hang up|connection reset|proxy/i.test(message)
  ) {
    return {
      kind: 'timeout',
      reason: `${code ? `${code}: ` : ''}${message}`,
    };
  }

  return {
    kind: 'invalid',
    reason: `${code ? `${code}: ` : ''}${message}`,
  };
}

function createTransport(account: SmtpAccount, proxyUrl?: string) {
  const connectionTimeout = proxyUrl ? 12_000 : 20_000;
  const greetingTimeout = proxyUrl ? 12_000 : 20_000;
  const socketTimeout = proxyUrl ? 30_000 : 30_000;

  const transporter = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.security === 'ssl',
    requireTLS: account.security === 'starttls',
    ignoreTLS: account.security === 'none',
    auth: {
      user: account.username,
      pass: account.password,
    },
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
  });

  if (proxyUrl) {
    transporter.setupProxy(proxyUrl);
  }

  return transporter;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body?.action === 'testProxies') {
      const proxies = Array.isArray(body.proxies)
        ? (body.proxies as unknown[])
            .map((item, index) => {
              const value = (item || {}) as Record<string, unknown>;
              return {
                id: String(value.id || `proxy-${index + 1}`),
                url: String(value.url || '').trim(),
              };
            })
            .filter((proxy) => /^https?:\/\//i.test(proxy.url))
        : [];

      if (!proxies.length) {
        return NextResponse.json(
          { success: false, error: 'No valid HTTP/HTTPS proxies supplied' },
          { status: 400 }
        );
      }

      const smtpHost = String(body.smtpHost || '').trim() || undefined;
      const parsedPort = Number(body.smtpPort || 0);
      const smtpPort =
        Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535
          ? parsedPort
          : undefined;

      const results = await testProxyPool(proxies, smtpHost, smtpPort);

      return NextResponse.json({
        success: true,
        target:
          smtpHost && smtpPort
            ? { host: smtpHost, port: smtpPort }
            : null,
        results,
        working: results.filter((item) => item.ok).length,
        failed: results.filter((item) => !item.ok).length,
      });
    }

    const accounts = Array.isArray(body.accounts)
      ? (body.accounts as SmtpAccount[])
      : [];

    const proxyUrl =
      typeof body.proxyUrl === 'string' && /^https?:\/\//i.test(body.proxyUrl)
        ? body.proxyUrl
        : undefined;

    const valid: SmtpAccount[] = [];
    const invalid: Array<SmtpAccount & { reason: string }> = [];
    const temporaryTimeouts: Array<SmtpAccount & { reason: string }> = [];

    for (const account of accounts) {
      if (proxyUrl) {
        const tunnel = await testSmtpTunnel(
          proxyUrl,
          account.host,
          account.port,
          10_000
        );

        if (!tunnel.ok) {
          temporaryTimeouts.push({
            ...account,
            reason: `Proxy cannot open SMTP tunnel to ${account.host}:${account.port}: ${tunnel.reason || 'CONNECT failed'}`,
          });
          continue;
        }
      }

      const transporter = createTransport(account, proxyUrl);

      try {
        await transporter.verify();
        valid.push(account);
      } catch (error) {
        const classified = classifyError(error);

        if (classified.kind === 'timeout') {
          temporaryTimeouts.push({
            ...account,
            reason: classified.reason,
          });
        } else {
          invalid.push({
            ...account,
            reason: classified.reason,
          });
        }
      } finally {
        transporter.close();
      }
    }

    return NextResponse.json({
      success: true,
      valid,
      invalid,
      temporaryTimeouts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
