import { NextRequest, NextResponse } from 'next/server';
import { getSendJob, setSendJobAction } from '@/lib/send-job-control';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const job = getSendJob(params.jobId);
  if (!job) {
    return NextResponse.json({ error: 'Send job not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, job });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = body.action;

  if (action !== 'pause' && action !== 'resume' && action !== 'stop') {
    return NextResponse.json({ error: 'Action must be pause, resume, or stop' }, { status: 400 });
  }

  const job = setSendJobAction(params.jobId, action);
  if (!job) {
    return NextResponse.json({ error: 'Send job not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, job });
}
