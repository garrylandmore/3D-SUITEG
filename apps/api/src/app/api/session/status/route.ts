import { NextRequest, NextResponse } from 'next/server';
import { getSessionStats, setSessionStatus } from '@/lib/local-store';

/**
 * GET /api/session/status - Current session send status + stats
 */
export async function GET() {
  const stats = getSessionStats();
  return NextResponse.json(
    { status: stats.status, stats },
    { headers: { 'x-3d-suite-mode': 'local-memory' } }
  );
}

/**
 * POST /api/session/status - Update session send status
 * Body: { status: 'idle' | 'running' | 'stopped' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const status = body.status as 'idle' | 'running' | 'stopped';
    if (!['idle', 'running', 'stopped'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    setSessionStatus(status);
    return NextResponse.json(
      { ok: true, stats: getSessionStats() },
      { headers: { 'x-3d-suite-mode': 'local-memory' } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Invalid payload' }, { status: 400 });
  }
}
