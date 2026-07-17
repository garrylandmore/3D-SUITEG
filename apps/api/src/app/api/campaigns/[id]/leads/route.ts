import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/campaigns/[id]/leads - List leads for a campaign
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const leads = await prisma.lead.findMany({
      where: { campaignId: params.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(leads);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/campaigns/[id]/leads - Import leads
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { leads } = body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json(
        { error: 'Invalid leads data' },
        { status: 400 }
      );
    }

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Create leads
    const createdLeads = await prisma.lead.createMany({
      data: leads.map((lead: any) => ({
        campaignId: params.id,
        email: lead.email,
        name: lead.name,
        company: lead.company,
        referenceNumber: lead.referenceNumber,
        customFields: lead.customFields || {},
        status: 'pending',
      })),
      skipDuplicates: true,
    });

    // Update campaign lead count
    await prisma.campaign.update({
      where: { id: params.id },
      data: {
        totalLeads: { increment: createdLeads.count },
      },
    });

    // Log action
    await prisma.campaignLog.create({
      data: {
        campaignId: params.id,
        action: 'imported_leads',
        status: 'success',
        details: JSON.stringify({ count: createdLeads.count }),
      },
    });

    return NextResponse.json(
      { message: `Imported ${createdLeads.count} leads`, count: createdLeads.count },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
