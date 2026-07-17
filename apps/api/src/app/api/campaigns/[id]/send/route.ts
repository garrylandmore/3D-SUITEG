import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { campaignQueue } from '@/lib/queue';

/**
 * POST /api/campaigns/[id]/send - Start sending campaign
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: { leads: true },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    if (campaign.status === 'active') {
      return NextResponse.json(
        { error: 'Campaign is already running' },
        { status: 400 }
      );
    }

    // Update campaign status
    await prisma.campaign.update({
      where: { id: params.id },
      data: { status: 'active' },
    });

    // Queue all leads for processing
    for (const lead of campaign.leads) {
      if (lead.status === 'pending') {
        await campaignQueue.add(
          {
            campaignId: campaign.id,
            leadId: lead.id,
            email: lead.email,
            name: lead.name,
            company: lead.company,
            referenceNumber: lead.referenceNumber,
            customFields: lead.customFields,
            templatePdfUrl: campaign.templatePdfUrl,
            placeholders: campaign.placeholders,
          },
          { delay: Math.random() * 5000 } // Random delay to spread requests
        );
      }
    }

    // Log action
    await prisma.campaignLog.create({
      data: {
        campaignId: params.id,
        action: 'started_campaign',
        status: 'success',
        details: JSON.stringify({ leadCount: campaign.leads.length }),
      },
    });

    return NextResponse.json({
      message: 'Campaign started',
      queuedLeads: campaign.leads.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
