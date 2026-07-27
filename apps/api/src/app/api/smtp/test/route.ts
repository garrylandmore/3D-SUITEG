import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SmtpSecurity = 'starttls' | 'ssl' | 'none';

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
  const message = String(
    value?.message || error || 'Unknown SMTP error'
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
      reason: `${code ? `${code}: ` : ''}${message}`,
    };
  }

  return {
    kind: 'invalid',
    reason: `${code ? `${code}: ` : ''}${message}`,
  };
}

function createTransport(account: SmtpAccount, proxyUrl?: string) {
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
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  });

  if (proxyUrl) {
    transporter.setupProxy(proxyUrl);
  }

  return transporter;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const accounts = Array.isArray(body.accounts)
      ? (body.accounts as SmtpAccount[])
      : [];
    const proxyUrl =
      typeof body.proxyUrl === 'string' &&
      /^https?:\/\//i.test(body.proxyUrl)
        ? body.proxyUrl
        : undefined;

    const valid: SmtpAccount[] = [];
    const invalid: Array<SmtpAccount & { reason: string }> = [];
    const temporaryTimeouts: Array<
      SmtpAccount & { reason: string }
    > = [];

    for (const account of accounts) {
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
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}
