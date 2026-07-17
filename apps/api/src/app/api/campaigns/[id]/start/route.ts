import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { campaignQueue } from '@/lib/queue';

interface StartResponse {
  success: boolean;
  message: string;
  queued: number;
  errors?: string[];
}

/**
 * POST /api/campaigns/[id]/start - Start sending campaign (with validation)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse<StartResponse>> {
  try {
    console.log(`[CAMPAIGN START] Received start request for campaign ${params.id}`);

    // First validate the campaign
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        leads: true,
      },
    });

    if (!campaign) {
      console.error(`[CAMPAIGN START ERROR] Campaign ${params.id} not found`);
      return NextResponse.json(
        {
          success: false,
          message: 'Campaign not found',
          queued: 0,
          errors: ['Campaign does not exist'],
        },
        { status: 404 }
      );
    }

    const errors: string[] = [];

    // Validation checks
    if (!campaign.templatePdfUrl) {
      errors.push('Template PDF is not configured');
    }

    if (!campaign.placeholders || campaign.placeholders.length === 0) {
      errors.push('No placeholders defined');
    }

    if (campaign.leads.length === 0) {
      errors.push('No leads imported. Please import leads first.');
    }

    const invalidLeads = campaign.leads.filter(
      (lead) => !lead.email || !lead.name
    );
    if (invalidLeads.length > 0) {
      errors.push(
        `${invalidLeads.length} leads have missing email or name`
      );
    }

    if (campaign.status === 'active') {
      errors.push('Campaign is already running');
    }

    // Check system configuration
    if (!process.env.WETRANSFER_API_KEY) {
      errors.push('WeTransfer API key not configured');
    }
    if (
      !process.env.SMTP_HOST ||
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASSWORD
    ) {
      errors.push('Email service not configured');
    }
    if (!process.env.TEMP_EMAIL_PROVIDER) {
      errors.push('Temporary email provider not configured');
    }

    // If there are validation errors, return them
    if (errors.length > 0) {
      console.error(
        `[CAMPAIGN START VALIDATION FAILED] Campaign ${params.id}:`,
        errors
      );

      await prisma.campaignLog.create({
        data: {
          campaignId: params.id,
          action: 'start_failed_validation',
          status: 'error',
          details: JSON.stringify({ errors }),
        },
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Campaign validation failed. See errors below:',
          queued: 0,
          errors,
        },
        { status: 400 }
      );
    }

    // Update campaign status to active
    await prisma.campaign.update({
      where: { id: params.id },
      data: { status: 'active' },
    });

    // Get pending leads
    const pendingLeads = campaign.leads.filter(
      (lead) => lead.status === 'pending'
    );

    console.log(
      `[CAMPAIGN START] Queueing ${pendingLeads.length} leads for campaign ${params.id}`
    );

    // Queue all pending leads for processing
    let queued = 0;
    for (const lead of pendingLeads) {
      try {
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
          {
            delay: Math.random() * 2000,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          }
        );
        queued++;
      } catch (error: any) {
        console.error(`[CAMPAIGN START] Failed to queue lead ${lead.id}:`, error);
      }
    }

    console.log(
      `[CAMPAIGN START SUCCESS] Campaign ${params.id} started with ${queued} leads queued`
    );

    // Log the action
    await prisma.campaignLog.create({
      data: {
        campaignId: params.id,
        action: 'campaign_started',
        status: 'success',
        details: JSON.stringify({ leadsQueued: queued }),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Campaign started successfully. ${queued} leads queued for processing.`,
      queued,
    });
  } catch (error: any) {
    console.error(`[CAMPAIGN START ERROR] Unexpected error:`, error);
    return NextResponse.json(
      {
        success: false,
        message: `Error starting campaign: ${error.message}`,
        queued: 0,
        errors: [error.message],
      },
      { status: 500 }
    );
  }
}
