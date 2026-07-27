import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import {
  configureNodemailerProxy,
  createProxyTunnelSocket,
  fetchIpWhoIsThroughProxy,
  isSupportedProxyUrl,
} from '../../../../lib/smtp-proxy';

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

async function testSmtpTunnel(
  proxyUrl: string,
  smtpHost: string,
  smtpPort: number,
  timeoutMs = 10_000
): Promise<{ ok: boolean; latencyMs: number; reason?: string }> {
  const started = Date.now();
  let socket: import('node:net').Socket | undefined;

  try {
    socket = await createProxyTunnelSocket(
      proxyUrl,
      smtpHost,
      smtpPort,
      timeoutMs
    );

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
    const data = await fetchIpWhoIsThroughProxy(proxy.url, 12_000);

    if (data.success === false || !data.ip) {
      const message = String(data.message || 'IP lookup failed');
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
    webResult = {
      ok: false,
      reason: `${code ? `${code}: ` : ''}${message}`,
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

  configureNodemailerProxy(transporter, proxyUrl, connectionTimeout); 

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
            .filter((proxy) => isSupportedProxyUrl(proxy.url))
        : [];

      if (!proxies.length) {
        return NextResponse.json(
          { success: false, error: 'No valid HTTP/HTTPS/SOCKS5 proxies supplied' },
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
      typeof body.proxyUrl === 'string' && isSupportedProxyUrl(body.proxyUrl)
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
