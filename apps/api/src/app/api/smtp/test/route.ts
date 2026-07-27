import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import axios from 'axios';

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
  latencyMs: number;
  ip?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
  reason?: string;
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

async function testOneProxy(
  proxy: ProxyTestInput
): Promise<ProxyTestResult> {
  const started = Date.now();

  try {
    const proxyConfig = proxyAxiosConfig(proxy.url);

    const response = await axios.get('https://ipwho.is/', {
      proxy: proxyConfig,
      timeout: 15_000,

      validateStatus: (status) =>
        status >= 200 && status < 500,

      headers: {
        Accept: 'application/json',
        'User-Agent': '3D-SUITEG-Proxy-Test/1.0',
      },
    });

    const data = (response.data || {}) as Record<
      string,
      unknown
    >;

    if (
      response.status >= 400 ||
      data.success === false ||
      !data.ip
    ) {
      const message = String(
        data.message || `HTTP ${response.status}`
      );

      throw new Error(message);
    }

    return {
      id: proxy.id,
      url: proxy.url,
      ok: true,
      latencyMs: Date.now() - started,
      ip: String(data.ip || ''),
      country: String(data.country || ''),
      countryCode: String(
        data.country_code || ''
      ).toUpperCase(),
      region: String(data.region || ''),
      city: String(data.city || ''),
    };
  } catch (error) {
    const value = error as {
      code?: string;
      message?: string;
      response?: {
        status?: number;
        statusText?: string;
      };
    };

    const code = String(value?.code || '').trim();

    const message = String(
      value?.message ||
        error ||
        'Proxy test failed'
    );

    const status = value?.response?.status;

    return {
      id: proxy.id,
      url: proxy.url,
      ok: false,
      latencyMs: Date.now() - started,

      reason: `${
        code ? `${code}: ` : ''
      }${message}${
        status ? ` (HTTP ${status})` : ''
      }`,
    };
  }
}

async function testProxyPool(
  proxies: ProxyTestInput[]
) {
  const results: ProxyTestResult[] =
    new Array(proxies.length);

  let cursor = 0;

  const workerCount = Math.min(
    8,
    Math.max(1, proxies.length)
  );

  await Promise.all(
    Array.from(
      { length: workerCount },
      async () => {
        while (true) {
          const index = cursor++;

          if (index >= proxies.length) {
            return;
          }

          results[index] =
            await testOneProxy(proxies[index]);
        }
      }
    )
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

function classifyError(
  error: unknown
): {
  kind: 'invalid' | 'timeout';
  reason: string;
} {
  const value = error as {
    code?: string;
    responseCode?: number;
    command?: string;
    message?: string;
  };

  const code = String(
    value?.code || ''
  ).toUpperCase();

  const message = String(
    value?.message ||
      error ||
      'Unknown SMTP error'
  );

  const timeoutCodes = new Set([
    'ETIMEDOUT',
    'ESOCKETTIMEDOUT',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ECONNREFUSED',
  ]);

  if (
    timeoutCodes.has(code) ||
    /timeout|timed out|socket hang up|connection reset/i.test(
      message
    )
  ) {
    return {
      kind: 'timeout',

      reason: `${
        code ? `${code}: ` : ''
      }${message}`,
    };
  }

  return {
    kind: 'invalid',

    reason: `${
      code ? `${code}: ` : ''
    }${message}`,
  };
}

function createTransport(
  account: SmtpAccount,
  proxyUrl?: string
) {
  const transporter =
    nodemailer.createTransport({
      host: account.host,
      port: account.port,

      secure:
        account.security === 'ssl',

      requireTLS:
        account.security === 'starttls',

      ignoreTLS:
        account.security === 'none',

      auth: {
        user: account.username,
        pass: account.password,
      },

      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 30_000,
    });

  if (proxyUrl) {
    transporter.setupProxy(proxyUrl);
  }

  return transporter;
}

export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();

    /*
     * -----------------------------------------
     * PROXY TESTING
     * -----------------------------------------
     */

    if (body?.action === 'testProxies') {
      const proxies = Array.isArray(
        body.proxies
      )
        ? (body.proxies as unknown[])
            .map((item, index) => {
              const value =
                (item || {}) as Record<
                  string,
                  unknown
                >;

              return {
                id: String(
                  value.id ||
                    `proxy-${index + 1}`
                ),

                url: String(
                  value.url || ''
                ).trim(),
              };
            })

            .filter((proxy) =>
              /^https?:\/\//i.test(
                proxy.url
              )
            )
        : [];

      if (!proxies.length) {
        return NextResponse.json(
          {
            success: false,

            error:
              'No valid HTTP/HTTPS proxies supplied',
          },
          {
            status: 400,
          }
        );
      }

      const results =
        await testProxyPool(proxies);

      return NextResponse.json({
        success: true,
        results,

        working: results.filter(
          (item) => item.ok
        ).length,

        failed: results.filter(
          (item) => !item.ok
        ).length,
      });
    }

    /*
     * -----------------------------------------
     * SMTP TESTING
     * -----------------------------------------
     */

    const accounts = Array.isArray(
      body.accounts
    )
      ? (body.accounts as SmtpAccount[])
      : [];

    const proxyUrl =
      typeof body.proxyUrl === 'string' &&
      /^https?:\/\//i.test(body.proxyUrl)
        ? body.proxyUrl
        : undefined;

    const valid: SmtpAccount[] = [];

    const invalid: Array<
      SmtpAccount & {
        reason: string;
      }
    > = [];

    const temporaryTimeouts: Array<
      SmtpAccount & {
        reason: string;
      }
    > = [];

    for (const account of accounts) {
      /*
       * If proxyUrl exists, the SMTP verification
       * connection itself is routed through it.
       */

      const transporter =
        createTransport(
          account,
          proxyUrl
        );

      try {
        await transporter.verify();

        valid.push(account);
      } catch (error) {
        const classified =
          classifyError(error);

        if (
          classified.kind ===
          'timeout'
        ) {
          temporaryTimeouts.push({
            ...account,
            reason:
              classified.reason,
          });
        } else {
          invalid.push({
            ...account,
            reason:
              classified.reason,
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

        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
}
