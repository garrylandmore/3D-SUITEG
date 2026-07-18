import {
  createTempMailboxIO,
  listMailboxMessages,
  TempMailIOMailbox,
} from './temp-mail-io';
import { createWeTransferTransfer, WeTransferSendPhase } from './wetransfer';

export type WeTransferStepStatus =
  | 'pending'
  | 'running'
  | 'waiting_for_verification'
  | 'verification_received'
  | 'upload_started'
  | 'upload_completed'
  | 'send_submitted'
  | 'send_confirmed'
  | 'success'
  | 'failed';

export type WeTransferExecutionStep = {
  id: string;
  label: string;
  status: WeTransferStepStatus;
  detail?: string;
  timestamp?: string;
  isReal: boolean;
};

export type WeTransferSession = {
  id: string;
  campaignId: string;
  tempMailbox: TempMailIOMailbox | null;
  mailboxMessageCount: number | null;
  latestError: string | null;
  steps: WeTransferExecutionStep[];
  createdAt: string;
  updatedAt: string;
  status:
    | 'initializing'
    | 'ready'
    | 'sending'
    | 'stopped'
    | 'completed'
    | 'completed_with_errors'
    | 'failed';
};

export type WeTransferSendResult = {
  success: boolean;
  leadEmail: string;
  step: string;
  detail?: string;
  transferUrl?: string;
  confirmationStatus: 'confirmed' | 'failed';
};

const SETUP_STEP_DEFS: Array<{ id: string; label: string }> = [
  {
    id: 'create_mailbox',
    label: 'Create temp mailbox (temp-mail.io)',
  },
  {
    id: 'open_wetransfer',
    label: 'Initialize WeTransfer API session',
  },
  {
    id: 'create_account',
    label: 'Validate WeTransfer API access',
  },
  {
    id: 'verify_email',
    label: 'Poll temp mailbox for verification email',
  },
];

const LEAD_STEP_DEFS: Array<{ id: string; label: string }> = [
  {
    id: 'upload_file',
    label: 'Upload PDF/document to WeTransfer',
  },
  {
    id: 'send_to_lead',
    label: 'Send WeTransfer link to lead',
  },
];

function makeSteps(): WeTransferExecutionStep[] {
  return [...SETUP_STEP_DEFS, ...LEAD_STEP_DEFS].map((def) => ({
    ...def,
    status: 'pending' as WeTransferStepStatus,
    isReal: true,
  }));
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function pause(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function extractFirstLink(messageText: string): string | null {
  const match = messageText.match(/https?:\/\/[^\s"'<>]+/i);
  return match?.[0] ?? null;
}

async function pollForVerificationEmail(
  mailboxEmail: string,
  tempMailApiKey: string,
  onProgress: (messageCount: number) => void
): Promise<{
  found: boolean;
  messageCount: number;
  subject?: string;
  verificationLink?: string;
}> {
  const maxAttempts = Number.parseInt(
    process.env.WETRANSFER_VERIFICATION_POLL_ATTEMPTS || '6',
    10
  );
  const delayMs = Number.parseInt(
    process.env.WETRANSFER_VERIFICATION_POLL_DELAY_MS || '5000',
    10
  );

  let latestCount = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { messages } = await listMailboxMessages(mailboxEmail, tempMailApiKey);
    latestCount = messages.length;
    onProgress(latestCount);
    const verificationMessage = messages.find((message) => {
      const subject = (message.subject || '').toLowerCase();
      const from = (message.from || '').toLowerCase();
      return subject.includes('verif') || from.includes('wetransfer');
    });
    if (verificationMessage) {
      const content = `${verificationMessage.body_text || ''}\n${verificationMessage.body_html || ''}`;
      return {
        found: true,
        messageCount: latestCount,
        subject: verificationMessage.subject || undefined,
        verificationLink: extractFirstLink(content) || undefined,
      };
    }
    if (attempt < maxAttempts) {
      await pause(delayMs);
    }
  }

  return { found: false, messageCount: latestCount };
}

function requireVerification() {
  return (process.env.WETRANSFER_REQUIRE_EMAIL_VERIFICATION || '').trim().toLowerCase() === 'true';
}

export async function initWeTransferSession(
  campaignId: string,
  tempMailApiKey: string,
  onStep?: (step: WeTransferExecutionStep, logLine: string) => void
): Promise<WeTransferSession> {
  const session: WeTransferSession = {
    id: makeId('wt_session'),
    campaignId,
    tempMailbox: null,
    mailboxMessageCount: null,
    latestError: null,
    steps: makeSteps(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: 'initializing',
  };

  function stepUpdate(stepId: string, status: WeTransferStepStatus, detail?: string): void {
    const step = session.steps.find((s) => s.id === stepId);
    if (!step) return;
    step.status = status;
    step.detail = detail;
    step.timestamp = nowIso();
    session.updatedAt = nowIso();
    if (onStep) {
      onStep(step, `[${step.label}] ${status}${detail ? ': ' + detail : ''}`);
    }
  }

  stepUpdate('create_mailbox', 'running');
  try {
    const { mailbox, rateLimit } = await createTempMailboxIO(tempMailApiKey);
    session.tempMailbox = mailbox;
    session.latestError = null;
    stepUpdate(
      'create_mailbox',
      'success',
      `Mailbox: ${mailbox.email} | rate-limit remaining: ${rateLimit.remaining ?? 'unknown'}`
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    stepUpdate('create_mailbox', 'failed', msg);
    session.latestError = msg;
    session.status = 'failed';
    return session;
  }

  stepUpdate('open_wetransfer', 'running', 'Using configured WeTransfer API endpoint');
  stepUpdate(
    'open_wetransfer',
    'success',
    `API endpoint ready: ${(process.env.WETRANSFER_API_URL || 'https://dev.wetransfer.com').trim()}`
  );

  stepUpdate('create_account', 'running', 'Checking WETRANSFER_API_KEY availability');
  if (!(process.env.WETRANSFER_API_KEY || '').trim()) {
    const error = 'WETRANSFER_API_KEY is missing. Cannot perform real WeTransfer uploads/sends.';
    stepUpdate('create_account', 'failed', error);
    session.latestError = error;
    session.status = 'failed';
    return session;
  }
  stepUpdate('create_account', 'success', 'API key detected. Real upload/send path enabled.');

  stepUpdate('verify_email', 'waiting_for_verification');
  try {
    const verificationResult = await pollForVerificationEmail(
      session.tempMailbox!.email,
      tempMailApiKey,
      (messageCount) => {
        session.mailboxMessageCount = messageCount;
      }
    );
    session.mailboxMessageCount = verificationResult.messageCount;

    if (verificationResult.found) {
      stepUpdate(
        'verify_email',
        'verification_received',
        `Verification email received${
          verificationResult.subject ? `: "${verificationResult.subject}"` : ''
        }${verificationResult.verificationLink ? ` | link: ${verificationResult.verificationLink}` : ''}`
      );
    } else if (requireVerification()) {
      const detail = `No verification email received (${verificationResult.messageCount} messages checked)`;
      stepUpdate('verify_email', 'failed', detail);
      session.latestError = detail;
      session.status = 'failed';
      return session;
    } else {
      stepUpdate(
        'verify_email',
        'success',
        `No verification email received (${verificationResult.messageCount} messages checked); continuing because verification is not required for token-based API flow.`
      );
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (requireVerification()) {
      stepUpdate('verify_email', 'failed', msg);
      session.latestError = `Verification inbox polling failed: ${msg}`;
      session.status = 'failed';
      return session;
    }
    stepUpdate('verify_email', 'success', `Mailbox poll error (non-blocking): ${msg}`);
  }

  session.status = 'ready';
  return session;
}

export async function sendLeadViaWeTransfer(
  session: WeTransferSession,
  leadEmail: string,
  filename: string,
  options?: {
    fileSource?: 'upload' | 'generated';
    attachmentBytes?: number;
    leadName?: string;
    ctaLink?: string;
    fileBuffer?: Buffer;
  },
  onStep?: (step: WeTransferExecutionStep, logLine: string) => void
): Promise<WeTransferSendResult> {
  if (!session.tempMailbox) {
    session.latestError = 'No temp mailbox in session – session may have failed during init';
    session.status = 'failed';
    return {
      success: false,
      leadEmail,
      step: 'send_to_lead',
      detail: session.latestError,
      confirmationStatus: 'failed',
    };
  }

  if (!options?.fileBuffer || options.fileBuffer.length <= 0) {
    const detail = 'No attachment bytes provided for WeTransfer upload';
    session.latestError = detail;
    session.status = 'failed';
    return {
      success: false,
      leadEmail,
      step: 'upload_file',
      detail,
      confirmationStatus: 'failed',
    };
  }

  session.status = 'sending';
  session.updatedAt = nowIso();

  for (const stepId of ['upload_file', 'send_to_lead']) {
    const step = session.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = 'pending';
      step.detail = undefined;
      step.timestamp = undefined;
    }
  }

  function stepUpdate(stepId: string, status: WeTransferStepStatus, detail?: string): void {
    const step = session.steps.find((s) => s.id === stepId);
    if (!step) return;
    step.status = status;
    step.detail = detail;
    step.timestamp = nowIso();
    session.updatedAt = nowIso();
    if (onStep) {
      onStep(step, `[${step.label}] ${status}${detail ? ': ' + detail : ''}`);
    }
  }

  stepUpdate(
    'upload_file',
    'upload_started',
    `upload_started | ${filename} | ${options.fileBuffer.length} bytes | source=${options.fileSource ?? 'unknown'}`
  );
  stepUpdate(
    'send_to_lead',
    'running',
    `Preparing send for ${leadEmail} (mailbox: ${session.tempMailbox.email})`
  );

  let transferUrl: string | undefined;
  const result = await createWeTransferTransfer(
    filename,
    options.fileBuffer,
    leadEmail,
    options?.ctaLink?.trim()
      ? `Secure link for ${options.leadName || leadEmail}: ${options.ctaLink}`
      : `Secure file package for ${options.leadName || leadEmail}`,
    (phaseUpdate) => {
      const phase = phaseUpdate.phase as WeTransferSendPhase;
      if (phase === 'upload_started') {
        stepUpdate('upload_file', 'upload_started', `upload_started | ${phaseUpdate.detail}`);
      } else if (phase === 'upload_completed') {
        stepUpdate('upload_file', 'upload_completed', `upload_completed | ${phaseUpdate.detail}`);
      } else if (phase === 'send_submitted') {
        stepUpdate('send_to_lead', 'send_submitted', `send_submitted | ${phaseUpdate.detail}`);
      } else if (phase === 'send_confirmed') {
        stepUpdate('send_to_lead', 'send_confirmed', `send_confirmed | ${phaseUpdate.detail}`);
      }
    }
  );

  if (!result.success) {
    const detail = result.error || `WeTransfer send failed for ${leadEmail}`;
    session.latestError = detail;
    if (session.steps.find((step) => step.id === 'upload_file')?.status === 'upload_started') {
      stepUpdate('upload_file', 'failed', `failed | ${detail}`);
    }
    stepUpdate('send_to_lead', 'failed', `failed | ${detail}`);
    session.status = 'ready';
    return {
      success: false,
      leadEmail,
      step: 'send_to_lead',
      detail,
      confirmationStatus: 'failed',
    };
  }

  transferUrl = result.downloadUrl;
  if (session.steps.find((step) => step.id === 'upload_file')?.status !== 'upload_completed') {
    stepUpdate('upload_file', 'upload_completed', `upload_completed | ${filename}`);
  }
  stepUpdate(
    'send_to_lead',
    'send_confirmed',
    `send_confirmed | ${leadEmail}${transferUrl ? ` | ${transferUrl}` : ''}`
  );
  session.latestError = null;
  session.status = 'ready';

  return {
    success: true,
    leadEmail,
    step: 'send_to_lead',
    transferUrl,
    detail: transferUrl
      ? `Confirmed WeTransfer send for ${leadEmail}: ${transferUrl}`
      : `Confirmed WeTransfer send for ${leadEmail}`,
    confirmationStatus: 'confirmed',
  };
}
