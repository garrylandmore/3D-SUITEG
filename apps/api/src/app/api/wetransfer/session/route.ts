import { NextRequest, NextResponse } from 'next/server';
import {
  initWeTransferSession,
  WeTransferExecutionStep,
} from '@/lib/wetransfer-engine';
import {
  getWeTransferSessionLocal,
  setWeTransferSessionLocal,
} from '@/lib/local-store';

type WeTransferSessionResponse = {
  sessionId?: string;
  campaignId?: string;
  status?: string;
  mailbox?: { email: string; token?: string } | null;
  mailboxMessageCount?: number | null;
  latestError?: string | null;
  steps?: WeTransferExecutionStep[];
  logs?: string[];
  error?: string;
};

/**
 * POST /api/wetransfer/session
 *
 * Initialise a WeTransfer engine session for a campaign.
 *
 * REAL:       Creates a temp-mail.io mailbox, polls inbox for verification email.
 * SIMULATED:  Opens WeTransfer, creates account, handles verification click.
 *
 * Body: { campaignId: string; tempMailApiKey: string; filename?: string }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const campaignId = body.campaignId ? String(body.campaignId).trim() : '';
  const tempMailApiKey = body.tempMailApiKey ? String(body.tempMailApiKey).trim() : '';

  if (!tempMailApiKey) {
    return NextResponse.json(
      { error: 'tempMailApiKey is required to create a temp-mail.io mailbox' },
      { status: 400 }
    );
  }

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
  }

  const logs: string[] = [];
  const steps: WeTransferExecutionStep[] = [];

  try {
    const session = await initWeTransferSession(
      campaignId,
      tempMailApiKey,
      (step, logLine) => {
        steps.push({ ...step });
        logs.push(logLine);
      }
    );

    setWeTransferSessionLocal(campaignId, session);

    const response: WeTransferSessionResponse = {
      sessionId: session.id,
      campaignId,
      status: session.status,
      mailbox: session.tempMailbox,
      mailboxMessageCount: session.mailboxMessageCount,
      latestError: session.latestError,
      steps: session.steps,
      logs,
      error: session.status === 'failed' ? session.latestError ?? 'WeTransfer session initialisation failed' : undefined,
    };

    return NextResponse.json(response, { status: session.status === 'failed' ? 500 : 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'WeTransfer session initialisation failed';
    return NextResponse.json({ error: message } satisfies WeTransferSessionResponse, { status: 500 });
  }
}

/**
 * GET /api/wetransfer/session?campaignId=…
 *
 * Return the current WeTransfer session state for a campaign.
 */
export async function GET(request: NextRequest) {
  const campaignId = request.nextUrl.searchParams.get('campaignId') ?? '';
  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId query param is required' }, { status: 400 });
  }

  const session = getWeTransferSessionLocal(campaignId);
  if (!session) {
    return NextResponse.json({ error: 'No active WeTransfer session for this campaign' }, { status: 404 });
  }

  return NextResponse.json({
    sessionId: session.id,
    campaignId: session.campaignId,
    status: session.status,
    mailbox: session.tempMailbox,
    mailboxMessageCount: session.mailboxMessageCount,
    latestError: session.latestError,
    steps: session.steps,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });
}
