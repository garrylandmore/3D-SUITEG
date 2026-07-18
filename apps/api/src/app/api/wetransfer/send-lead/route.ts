import { NextRequest, NextResponse } from 'next/server';
import {
  sendLeadViaWeTransfer,
  WeTransferExecutionStep,
} from '@/lib/wetransfer-engine';
import {
  getWeTransferSessionLocal,
  setWeTransferSessionLocal,
} from '@/lib/local-store';

/**
 * POST /api/wetransfer/send-lead
 *
 * Send a file to a single lead using an existing WeTransfer session.
 *
 * SIMULATED: file upload and send steps (structured placeholders for
 *             future Playwright/Puppeteer automation).
 * REAL:       Uses the temp mailbox created during session initialisation.
 *
 * Body: { campaignId: string; leadEmail: string; filename?: string }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const campaignId = body.campaignId ? String(body.campaignId).trim() : '';
  const leadEmail = body.leadEmail ? String(body.leadEmail).trim() : '';
  const filename = body.filename ? String(body.filename).trim() : 'document.pdf';

  if (!campaignId || !leadEmail) {
    return NextResponse.json(
      { error: 'campaignId and leadEmail are required' },
      { status: 400 }
    );
  }

  const session = getWeTransferSessionLocal(campaignId);
  if (!session) {
    return NextResponse.json(
      {
        error:
          'No active WeTransfer session for this campaign. ' +
          'Call POST /api/wetransfer/session first.',
      },
      { status: 404 }
    );
  }

  if (session.status === 'failed') {
    return NextResponse.json(
      { error: 'WeTransfer session is in a failed state. Re-initialise the session.' },
      { status: 400 }
    );
  }

  const logs: string[] = [];
  const stepSnapshots: WeTransferExecutionStep[] = [];

  const result = await sendLeadViaWeTransfer(
    session,
    leadEmail,
    filename,
    (step, logLine) => {
      stepSnapshots.push({ ...step });
      logs.push(logLine);
    }
  );

  // Persist the updated session (step statuses are mutated in-place by the engine)
  setWeTransferSessionLocal(campaignId, session);

  return NextResponse.json(
    {
      success: result.success,
      leadEmail: result.leadEmail,
      transferUrl: result.transferUrl ?? null,
      detail: result.detail ?? null,
      steps: stepSnapshots,
      logs,
      mailboxUsed: session.tempMailbox?.email ?? null,
    },
    { status: result.success ? 200 : 500 }
  );
}
