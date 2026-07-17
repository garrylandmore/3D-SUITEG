import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/health - Health check
 */
export async function GET() {
  try {
    await prisma.user.findFirst();
    return NextResponse.json({ status: 'ok', timestamp: new Date() });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: 'Database connection failed' },
      { status: 503 }
    );
  }
}
