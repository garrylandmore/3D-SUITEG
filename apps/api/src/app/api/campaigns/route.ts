import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/campaigns - List all campaigns for a user
 */
export async function GET() {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { leads: true },
        },
      },
    });

    return NextResponse.json(campaigns);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/campaigns - Create a new campaign
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, templatePdfUrl, placeholders, userId } = body;

    if (!name || !templatePdfUrl || !placeholders) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify user exists or create default user
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userId || 'default@3dsuite.com',
          name: 'Default User',
        },
      });
    }

    const campaign = await prisma.campaign.create({
      data: {
        userId: user.id,
        name,
        description,
        templatePdfUrl,
        placeholders: Array.isArray(placeholders) ? placeholders : [placeholders],
        status: 'draft',
      },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
