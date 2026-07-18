import { NextResponse } from 'next/server';
import { getSessionStats, listRuntimeEventsLocal } from '@/lib/local-store';

/**
 * GET /api/session/analytics - Derived stats for the current runtime session
 */
export async function GET() {
  const stats = getSessionStats();
  const recentEvents = listRuntimeEventsLocal(10);
  return NextResponse.json(
    {
      stats,
      recentEvents,
      generatedAt: new Date().toISOString(),
    },
    { headers: { 'x-3d-suite-mode': 'local-memory' } }
  );
}
