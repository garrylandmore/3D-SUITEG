import { NextRequest, NextResponse } from 'next/server';
import { getSessionSettings, updateSessionSettings } from '@/lib/local-store';

/**
 * GET /api/session/settings - Retrieve local session settings
 */
export async function GET() {
  const settings = getSessionSettings();
  return NextResponse.json(
    { settings },
    { headers: { 'x-3d-suite-mode': 'local-memory' } }
  );
}

/**
 * POST /api/session/settings - Store local session settings
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const next = updateSessionSettings({
      proxyHost: String(body.proxyHost ?? ''),
      proxyPort: String(body.proxyPort ?? ''),
      proxyUser: String(body.proxyUser ?? ''),
      proxyPass: String(body.proxyPass ?? ''),
      weTransferApiKey: String(body.weTransferApiKey ?? ''),
      smtpHost: String(body.smtpHost ?? ''),
      smtpUser: String(body.smtpUser ?? ''),
      smtpPass: String(body.smtpPass ?? ''),
      maxRetries: String(body.maxRetries ?? '3'),
    });
    return NextResponse.json(
      { settings: next },
      { headers: { 'x-3d-suite-mode': 'local-memory' } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Invalid payload' }, { status: 400 });
  }
}
