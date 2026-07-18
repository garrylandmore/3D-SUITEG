import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  sendLeadViaWeTransfer,
  WeTransferExecutionStep,
} from '@/lib/wetransfer-engine';
import { generateWeTransferBusinessPdf } from '@/lib/pdf';
import {
  getWeTransferSessionLocal,
  setWeTransferSessionLocal,
  getBrowserProxyConfigLocal,
} from '@/lib/local-store';
import { getBrowserProxyDiagnostics } from '@/lib/browser-proxy';

type AttachmentDebugPayload = {
  name: string;
  source: 'uploaded' | 'generated';
  mimeType: string | null;
  sizeBytes: number;
  ready: boolean;
};

type WeTransferSendLeadResponse = {
  success?: boolean;
  confirmationStatus?: 'confirmed' | 'failed';
  leadEmail?: string;
  transferUrl?: string | null;
  detail?: string | null;
  fileSource?: 'upload' | 'generated';
  filename?: string;
  attachmentBytes?: number;
  attachment?: AttachmentDebugPayload | null;
  steps?: WeTransferExecutionStep[];
  logs?: string[];
  mailboxUsed?: string | null;
  mailboxMessageCount?: number | null;
  latestError?: string | null;
  error?: string;
};

/**
 * POST /api/wetransfer/send-lead
 *
 * Send a file to a single lead using an existing WeTransfer session.
 *
 * REAL: Uploads and sends using live WeTransfer browser automation with confirmation-based status.
 *
 * Body: {
 *   campaignId: string;
 *   leadEmail: string;
 *   fileSource: 'upload' | 'generated';
 *   tempMailApiKey?: string;
 * }
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? '';
  let body: Record<string, unknown>;
  let uploadedFile: File | null = null;

  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      body = Object.fromEntries(
        Array.from(formData.entries()).filter(([, value]) => typeof value === 'string')
      ) as Record<string, unknown>;
      const maybeFile = formData.get('uploadedFile');
      uploadedFile = maybeFile instanceof File ? maybeFile : null;
    } else {
      body = (await request.json()) as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const campaignId = body.campaignId ? String(body.campaignId).trim() : '';
  const leadEmail = body.leadEmail ? String(body.leadEmail).trim() : '';
  const leadName = body.leadName ? String(body.leadName).trim() : '';
  const fileSource = body.fileSource === 'upload' ? 'upload' : 'generated';
  const ctaLink = body.ctaLink ? String(body.ctaLink).trim() : '';
  const tempMailApiKey = body.tempMailApiKey ? String(body.tempMailApiKey).trim() : '';

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
  let attachmentPath: string | null = null;
  let attachmentDir: string | null = null;
  let attachmentDebug: AttachmentDebugPayload | null = null;

  try {
    if (fileSource === 'upload') {
      const uploadedName = body.uploadedFileName
        ? String(body.uploadedFileName).trim()
        : 'uploaded-document.pdf';
      const uploadedMimeType = body.uploadedFileMimeType
        ? String(body.uploadedFileMimeType).trim()
        : '';

      if (uploadedFile) {
        attachmentBuffer = Buffer.from(await uploadedFile.arrayBuffer());
        filename = uploadedFile.name || uploadedName || 'uploaded-document.pdf';
        attachmentDebug = {
          name: filename,
          source: 'uploaded',
          mimeType: uploadedFile.type || uploadedMimeType || null,
          sizeBytes: attachmentBuffer.length,
          ready: attachmentBuffer.length > 0,
        };
      } else {
        const uploadedBase64 = body.uploadedFileBase64
          ? String(body.uploadedFileBase64).trim()
          : '';

        if (!uploadedBase64) {
          return NextResponse.json(
            { error: 'No uploaded attachment was provided. Re-select the file and try again.' },
            { status: 400 }
          );
        }

        attachmentBuffer = Buffer.from(uploadedBase64, 'base64');
        filename = uploadedName || 'uploaded-document.pdf';
        attachmentDebug = {
          name: filename,
          source: 'uploaded',
          mimeType: uploadedMimeType || null,
          sizeBytes: attachmentBuffer.length,
          ready: attachmentBuffer.length > 0,
        };
      }

      if (!attachmentBuffer.length) {
        return NextResponse.json(
          { error: 'Uploaded file content is empty. Attach a valid file before sending.' },
          { status: 400 }
        );
      }

      logs.push(
        `[Attachment] READY: ${filename} | source=uploaded | size=${attachmentBuffer.length} bytes | mime=${attachmentDebug.mimeType ?? 'unknown'}`
      );
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
      attachmentDebug = {
        name: filename,
        source: 'generated',
        mimeType: 'application/pdf',
        sizeBytes: attachmentBuffer.length,
        ready: attachmentBuffer.length > 0,
      };

      if (!attachmentBuffer.length) {
        return NextResponse.json(
          { error: 'Generated PDF is empty and cannot be sent.' },
          { status: 500 }
        );
      }

      logs.push(
        `[Attachment] READY: ${filename} | source=generated | size=${attachmentBuffer.length} bytes | mime=application/pdf`
      );
    }

    const safeFilename = filename.replace(/[^a-z0-9._-]/gi, '_') || 'attachment.pdf';
    attachmentDir = await fs.mkdtemp(path.join(os.tmpdir(), '3d-suite-wetransfer-'));
    attachmentPath = path.join(attachmentDir, safeFilename);
    await fs.writeFile(attachmentPath, attachmentBuffer);
    logs.push(`[Attachment] ON_DISK: ${attachmentPath} | bytes=${attachmentBuffer.length}`);

    const proxyConfig = getBrowserProxyConfigLocal();
    console.log(
      `[wetransfer/send-lead] ${getBrowserProxyDiagnostics(
        proxyConfig,
        'launchWeTransferBrowser',
        'POST /api/wetransfer/send-lead'
      )}`
    );

    const result = await sendLeadViaWeTransfer(
      session,
      leadEmail,
      filename,
      {
        fileSource,
        attachmentBytes: attachmentBuffer.length,
        leadName: leadName || undefined,
        ctaLink: ctaLink || undefined,
        fileBuffer: attachmentBuffer,
        attachmentPath,
        tempMailApiKey: tempMailApiKey || undefined,
        proxyConfig,
      },
      (step, logLine) => {
        stepSnapshots.push({ ...step });
        logs.push(logLine);
      }
    );

    setWeTransferSessionLocal(campaignId, session);

    const response: WeTransferSendLeadResponse = {
      success: result.success,
      confirmationStatus: result.confirmationStatus,
      leadEmail: result.leadEmail,
      transferUrl: result.transferUrl ?? null,
      detail: result.detail ?? null,
      fileSource,
      filename,
      attachmentBytes: attachmentBuffer.length,
      attachment: attachmentDebug,
      steps: stepSnapshots,
      logs,
      mailboxUsed: session.tempMailbox?.email ?? null,
      mailboxMessageCount: session.mailboxMessageCount,
      latestError: session.latestError,
      error:
        result.confirmationStatus === 'failed'
          ? result.detail ?? 'WeTransfer send failed'
          : undefined,
    };

    return NextResponse.json(response, {
      status: result.confirmationStatus === 'failed' ? 500 : 200,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'WeTransfer send failed unexpectedly';
    session.latestError = message;
    setWeTransferSessionLocal(campaignId, session);
    return NextResponse.json(
      { error: message, latestError: message } satisfies WeTransferSendLeadResponse,
      {
        status: 500,
      }
    );
  } finally {
    if (attachmentDir) {
      await fs.rm(attachmentDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
