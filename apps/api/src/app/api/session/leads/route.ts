import { NextRequest, NextResponse } from 'next/server';
import {
  addSessionLeads,
  getSessionLeads,
  markSessionLeadsSent,
  getSessionStats,
} from '@/lib/local-store';

/**
 * GET /api/session/leads - List session-local leads and stats
 */
export async function GET() {
  const leads = getSessionLeads();
  const stats = getSessionStats();
  return NextResponse.json(
    { leads, stats },
    { headers: { 'x-3d-suite-mode': 'local-memory' } }
  );
}

/**
 * POST /api/session/leads - Add leads to the session
 * Body: { lines: string[] }  (one email per element)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const lines: string[] = Array.isArray(body.lines) ? body.lines : [];

    if (!lines.length) {
      return NextResponse.json({ error: 'No leads provided' }, { status: 400 });
    }

    const result = addSessionLeads(lines);
    return NextResponse.json(
      { added: result.added, total: result.total, stats: getSessionStats() },
      { status: 200, headers: { 'x-3d-suite-mode': 'local-memory' } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Invalid payload' }, { status: 400 });
  }
}

/**
 * PATCH /api/session/leads - Mark specific leads as sent
 * Body: { emails: string[] }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const emails: string[] = Array.isArray(body.emails) ? body.emails : [];
    markSessionLeadsSent(emails);
    return NextResponse.json(
      { ok: true, stats: getSessionStats() },
      { headers: { 'x-3d-suite-mode': 'local-memory' } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Invalid payload' }, { status: 400 });
  }
}
