import { NextRequest, NextResponse } from 'next/server';
import { prisma, hasDatabaseUrl } from '@/lib/prisma';
import { listCampaignLogsLocal } from '@/lib/local-store';

/**
 * GET /api/campaigns/[id]/logs - Get campaign logs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '100');
  const offset = parseInt(searchParams.get('offset') || '0');

  if (!hasDatabaseUrl()) {
    const logs = listCampaignLogsLocal(params.id, limit, offset);
    return NextResponse.json(
      { logs, total: logs.length, limit, offset },
      { headers: { 'x-3d-suite-mode': 'local-memory' } }
    );
  }

  try {
    const logs = await prisma.campaignLog.findMany({
      where: { campaignId: params.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.campaignLog.count({
      where: { campaignId: params.id },
    });

    return NextResponse.json({ logs, total, limit, offset });
  } catch (error: any) {
    const logs = listCampaignLogsLocal(params.id, limit, offset);
    return NextResponse.json(
      { logs, total: logs.length, limit, offset },
      { headers: { 'x-3d-suite-mode': 'local-memory' } }
    );
  }
}
