import { NextRequest, NextResponse } from 'next/server';
import {
  sendLeadViaWeTransfer,
  WeTransferExecutionStep,
} from '@/lib/wetransfer-engine';
import { generateWeTransferBusinessPdf } from '@/lib/pdf';
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
  const leadName = body.leadName ? String(body.leadName).trim() : '';
  const fileSource = body.fileSource === 'upload' ? 'upload' : 'generated';
  const ctaLink = body.ctaLink ? String(body.ctaLink).trim() : '';

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
  let attachmentBuffer: Buffer;
  let filename = 'generated-proposal.pdf';

  if (fileSource === 'upload') {
    const uploadedBase64 = body.uploadedFileBase64
      ? String(body.uploadedFileBase64).trim()
      : '';
    const uploadedName = body.uploadedFileName
      ? String(body.uploadedFileName).trim()
      : 'uploaded-document.pdf';

    if (!uploadedBase64) {
      return NextResponse.json(
        { error: 'uploadedFileBase64 is required when fileSource is "upload"' },
        { status: 400 }
      );
    }

    try {
      attachmentBuffer = Buffer.from(uploadedBase64, 'base64');
    } catch {
      return NextResponse.json(
        { error: 'uploadedFileBase64 is not valid base64 content' },
        { status: 400 }
      );
    }
    if (!attachmentBuffer.length) {
      return NextResponse.json(
        { error: 'Uploaded file content is empty after base64 decode' },
        { status: 400 }
      );
    }

    filename = uploadedName || 'uploaded-document.pdf';
    logs.push(`[Attachment] REAL: Uploaded file accepted (${filename}, ${attachmentBuffer.length} bytes).`);
  } else {
    const generatedTitle = body.generatedTitle ? String(body.generatedTitle).trim() : '';
    const generatedSubtitle = body.generatedSubtitle ? String(body.generatedSubtitle).trim() : '';
    const generatedBodyText = body.generatedBodyText ? String(body.generatedBodyText).trim() : '';
    const generatedLayout =
      body.generatedLayout === 'highlight' ? 'highlight' : 'classic';

    attachmentBuffer = await generateWeTransferBusinessPdf({
      campaignName: campaignId,
      title: generatedTitle || undefined,
      subtitle: generatedSubtitle || undefined,
      bodyText: generatedBodyText || undefined,
      ctaLink: ctaLink || undefined,
      layoutMode: generatedLayout,
      leadName: leadName || undefined,
      leadEmail,
    });
    filename = `${leadEmail.replace(/[^a-z0-9._-]/gi, '_') || 'lead'}-proposal.pdf`;
    logs.push(
      '[Attachment] REAL: Generated per-lead PDF in-app (strategy: per-lead generation during send).'
    );
  }

  const result = await sendLeadViaWeTransfer(
    session,
    leadEmail,
    filename,
    {
      fileSource,
      attachmentBytes: attachmentBuffer.length,
      leadName: leadName || undefined,
      ctaLink: ctaLink || undefined,
    },
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
      confirmationStatus: result.confirmationStatus,
      leadEmail: result.leadEmail,
      transferUrl: result.transferUrl ?? null,
      detail: result.detail ?? null,
      fileSource,
      filename,
      attachmentBytes: attachmentBuffer.length,
      steps: stepSnapshots,
      logs,
      mailboxUsed: session.tempMailbox?.email ?? null,
    },
    { status: result.confirmationStatus === 'failed' ? 500 : 200 }
  );
}
