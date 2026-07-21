import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

import {
  GmailConnection,
  readGmailConnections,
  upsertGmailConnection,
} from '@/lib/gmail-oauth-store';

export const dynamic = 'force-dynamic';

function base64Url(value: Buffer | string): string {
  const buffer =
    typeof value === 'string' ? Buffer.from(value, 'utf8') : value;

  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function randomDigits(length: number): string {
  let result = '';
  for (let index = 0; index < length; index += 1) {
    result += String(Math.floor(Math.random() * 10));
  }
  return result;
}

function placeholders(
  template: string,
  email: string,
  originalFilename = ''
): string {
  const at = email.lastIndexOf('@');
  const localPart = at > 0 ? email.slice(0, at) : email;
  const domain = at > 0 ? email.slice(at + 1) : '';
  const domainName = domain.split('.')[0] || domain;

  const dot = originalFilename.lastIndexOf('.');
  const originalName =
    dot > 0 ? originalFilename.slice(0, dot) : originalFilename;
  const ext =
    dot > 0 ? originalFilename.slice(dot + 1) : '';

  const values: Record<string, string> = {
    Email: email,
    LocalPart: localPart,
    Domain: domain,
    DomainName: domainName,
    Date: new Date().toISOString().slice(0, 10),
    Random6: randomDigits(6),
    Random8: randomDigits(8),
    OriginalName: originalName,
    Ext: ext,
  };

  return template.replace(
    /\{([A-Za-z0-9]+)\}/g,
    (match, key: string) => values[key] ?? match
  );
}

function sanitizeFilename(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

async function ensureAccessToken(
  connection: GmailConnection
): Promise<GmailConnection> {
  if (
    connection.accessToken &&
    connection.expiresAt > Date.now() + 60_000
  ) {
    return connection;
  }

  const clientId = String(
    connection.googleClientId || ''
  ).trim();
  const clientSecret = String(
    connection.googleClientSecret || ''
  ).trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      'This Gmail connection is missing its Google OAuth Client ID or Client Secret. Reconnect the account from the Gmail dashboard.'
    );
  }

  const response = await fetch(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: connection.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    }
  );

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        `Google token refresh failed: HTTP ${response.status}`
    );
  }

  const updated = {
    ...connection,
    accessToken: String(data.access_token),
    expiresAt:
      Date.now() + Number(data.expires_in || 3600) * 1000,
  };

  await upsertGmailConnection(updated);
  return updated;
}

function buildMimeMessage(args: {
  from: string;
  to: string;
  subject: string;
  body: string;
  attachment?: {
    filename: string;
    mimeType: string;
    bytes: Buffer;
  } | null;
}): string {
  const boundary = `3d-suite-${crypto.randomUUID()}`;

  const headers = [
    `From: ${args.from}`,
    `To: ${args.to}`,
    `Subject: ${args.subject}`,
    'MIME-Version: 1.0',
  ];

  if (!args.attachment) {
    return [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      args.body,
    ].join('\r\n');
  }

  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    args.body,
    '',
    `--${boundary}`,
    `Content-Type: ${args.attachment.mimeType || 'application/octet-stream'}; name="${args.attachment.filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${args.attachment.filename}"`,
    '',
    args.attachment.bytes.toString('base64'),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const accountEmail = String(
      formData.get('accountEmail') || ''
    ).trim();

    const recipients = Array.from(
      new Set(
        (JSON.parse(
          String(formData.get('recipients') || '[]')
        ) as unknown[])
          .map((item) => String(item || '').trim().toLowerCase())
          .filter(
            (email) =>
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          )
      )
    );

    const subjectTemplate = String(
      formData.get('subjectTemplate') || ''
    );
    const bodyTemplate = String(
      formData.get('bodyTemplate') || ''
    );
    const attachmentNameTemplate = String(
      formData.get('attachmentNameTemplate') ||
        '{OriginalName}.{Ext}'
    );
    const attachmentValue = formData.get('attachment');

    if (!accountEmail) {
      return NextResponse.json(
        { success: false, error: 'Connected Gmail account is required.' },
        { status: 400 }
      );
    }

    if (!recipients.length) {
      return NextResponse.json(
        { success: false, error: 'At least one recipient is required.' },
        { status: 400 }
      );
    }

    const connections = await readGmailConnections();
    const connection = connections.find(
      (item) =>
        item.email.toLowerCase() === accountEmail.toLowerCase()
    );

    if (!connection) {
      return NextResponse.json(
        {
          success: false,
          error: `Gmail account is not connected: ${accountEmail}`,
        },
        { status: 404 }
      );
    }

    const authorized = await ensureAccessToken(connection);

    let attachmentBytes: Buffer | null = null;
    let originalFilename = '';
    let attachmentMimeType = 'application/octet-stream';

    if (attachmentValue instanceof File) {
      attachmentBytes = Buffer.from(
        await attachmentValue.arrayBuffer()
      );
      originalFilename = attachmentValue.name || 'attachment';
      attachmentMimeType =
        attachmentValue.type || 'application/octet-stream';
    }

    const results: Array<{
      index: number;
      total: number;
      recipient: string;
      success: boolean;
      messageId?: string;
      error?: string;
    }> = [];

    for (let index = 0; index < recipients.length; index += 1) {
      const recipient = recipients[index];

      try {
        const subject = placeholders(
          subjectTemplate,
          recipient,
          originalFilename
        );
        const body = placeholders(
          bodyTemplate,
          recipient,
          originalFilename
        );

        const resolvedAttachment =
          attachmentBytes && originalFilename
            ? {
                filename: sanitizeFilename(
                  placeholders(
                    attachmentNameTemplate,
                    recipient,
                    originalFilename
                  )
                ),
                mimeType: attachmentMimeType,
                bytes: attachmentBytes,
              }
            : null;

        const mime = buildMimeMessage({
          from: authorized.email,
          to: recipient,
          subject,
          body,
          attachment: resolvedAttachment,
        });

        const response = await fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${authorized.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              raw: base64Url(mime),
            }),
          }
        );

        const text = await response.text();
        const data = text ? JSON.parse(text) : {};

        if (!response.ok) {
          throw new Error(
            data.error?.message ||
              `Gmail API send failed: HTTP ${response.status}`
          );
        }

        results.push({
          index: index + 1,
          total: recipients.length,
          recipient,
          success: true,
          messageId: String(data.id || ''),
        });
      } catch (error) {
        results.push({
          index: index + 1,
          total: recipients.length,
          recipient,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const sentCount = results.filter((item) => item.success).length;
    const failedCount = results.length - sentCount;

    return NextResponse.json({
      success: failedCount === 0,
      sentCount,
      failedCount,
      results,
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
