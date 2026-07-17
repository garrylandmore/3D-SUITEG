import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { campaignQueue } from '@/lib/queue';

/**
 * GET /api/campaigns/[id]/validate - Validate if campaign can be started
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        leads: true,
      },
    });

    if (!campaign) {
      return NextResponse.json(
        {
          valid: false,
          errors: ['Campaign not found'],
          warnings: [],
        },
        { status: 404 }
      );
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if template exists
    if (!campaign.templatePdfUrl) {
      errors.push('Template PDF is not configured');
    }

    // Check if placeholders are defined
    if (!campaign.placeholders || campaign.placeholders.length === 0) {
      errors.push('No placeholders defined');
    }

    // Check if leads exist
    if (campaign.leads.length === 0) {
      errors.push('No leads imported. Please import leads first.');
    }

    // Check for valid lead emails
    const invalidLeads = campaign.leads.filter(
      (lead) => !lead.email || !lead.name
    );
    if (invalidLeads.length > 0) {
      errors.push(
        `${invalidLeads.length} leads have missing email or name`
      );
    }

    // Check if campaign is already running
    if (campaign.status === 'active') {
      errors.push('Campaign is already running');
    }

    // Check for pending leads
    const pendingLeads = campaign.leads.filter(
      (lead) => lead.status === 'pending'
    );
    if (pendingLeads.length === 0 && campaign.leads.length > 0) {
      warnings.push('All leads have already been processed');
    }

    // Check system configuration
    const missingConfig: string[] = [];
    if (!process.env.WETRANSFER_API_KEY) {
      missingConfig.push('WeTransfer API key');
    }
    if (
      !process.env.SMTP_HOST ||
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASSWORD
    ) {
      missingConfig.push('Email configuration');
    }
    if (!process.env.TEMP_EMAIL_PROVIDER) {
      missingConfig.push('Temporary email provider');
    }

    if (missingConfig.length > 0) {
      errors.push(
        `Missing system configuration: ${missingConfig.join(', ')}`
      );
    }

    return NextResponse.json({
      valid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalLeads: campaign.leads.length,
        pendingLeads: pendingLeads.length,
        status: campaign.status,
        placeholders: campaign.placeholders,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        valid: false,
        errors: [error.message],
        warnings: [],
      },
      { status: 500 }
    );
  }
}
