import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { campaignQueue } from '@/lib/queue';

interface StopResponse {
  success: boolean;
  message: string;
  jobsStopped: number;
}

/**
 * POST /api/campaigns/[id]/stop - Stop sending campaign
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<StopResponse>> {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
    });

    if (!campaign) {
      return NextResponse.json(
        {
          success: false,
          message: 'Campaign not found',
          jobsStopped: 0,
        },
        { status: 404 }
      );
    }

    if (campaign.status !== 'active') {
      return NextResponse.json(
        {
          success: false,
          message: 'Campaign is not currently running',
          jobsStopped: 0,
        },
        { status: 400 }
      );
    }

    // Get all pending jobs for this campaign
    const jobs = await campaignQueue.getJobs(['waiting', 'active']);
    const campaignJobs = jobs.filter(
      (job) => job.data.campaignId === params.id
    );

    // Remove jobs from queue
    let removed = 0;
    for (const job of campaignJobs) {
      await job.remove();
      removed++;
    }

    // Update campaign status to paused
    await prisma.campaign.update({
      where: { id: params.id },
      data: { status: 'paused' },
    });

    // Log the action
    await prisma.campaignLog.create({
      data: {
        campaignId: params.id,
        action: 'campaign_stopped',
        status: 'info',
        details: JSON.stringify({ jobsRemoved: removed }),
      },
    });

    console.log(`[CAMPAIGN STOP] Campaign ${params.id} stopped. ${removed} jobs removed.`);

    return NextResponse.json({
      success: true,
      message: `Campaign stopped successfully. ${removed} pending jobs cancelled.`,
      jobsStopped: removed,
    });
  } catch (error: any) {
    console.error(`[CAMPAIGN STOP ERROR] ${error.message}`);
    return NextResponse.json(
      {
        success: false,
        message: error.message,
        jobsStopped: 0,
      },
      { status: 500 }
    );
  }
}
