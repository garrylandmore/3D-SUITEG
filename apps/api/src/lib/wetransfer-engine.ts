/**
 * WeTransfer Engine Service
 *
 * Orchestrates the WeTransfer-first sending flow.
 *
 * REAL parts:
 *   - temp-mail.io mailbox creation (POST /v1/emails)
 *   - temp-mail.io inbox polling (GET /v1/emails/{email}/messages)
 *
 * SIMULATED parts (structured placeholders ready for Playwright/Puppeteer):
 *   - Opening WeTransfer in a headless browser
 *   - Creating/signing into a WeTransfer account with the temp mailbox
 *   - Handling the WeTransfer verification email click
 *   - Uploading a PDF/document to WeTransfer
 *   - Sending the transfer to a lead
 *
 * Architecture note:
 *   Each simulated step is clearly marked [AUTOMATION PLACEHOLDER] and
 *   describes exactly what a real Playwright/Puppeteer implementation would do.
 *   The session/step data structures are designed for drop-in replacement
 *   once browser automation is added.
 */

import {
  createTempMailboxIO,
  listMailboxMessages,
  TempMailIOMailbox,
} from './temp-mail-io';

export type WeTransferStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export type WeTransferExecutionStep = {
  id: string;
  label: string;
  status: WeTransferStepStatus;
  detail?: string;
  timestamp?: string;
  /** true = live integration, false = simulated placeholder */
  isReal: boolean;
};

export type WeTransferSession = {
  id: string;
  campaignId: string;
  tempMailbox: TempMailIOMailbox | null;
  steps: WeTransferExecutionStep[];
  createdAt: string;
  updatedAt: string;
  status: 'initializing' | 'ready' | 'sending' | 'stopped' | 'completed' | 'failed';
};

export type WeTransferSendResult = {
  success: boolean;
  leadEmail: string;
  step: string;
  detail?: string;
  transferUrl?: string;
};

// ─── Step definitions ──────────────────────────────────────────────────────────

const SETUP_STEP_DEFS: Array<{ id: string; label: string; isReal: boolean }> = [
  {
    id: 'create_mailbox',
    label: 'Create temp mailbox (temp-mail.io)',
    isReal: true,
  },
  {
    id: 'open_wetransfer',
    label: 'Open WeTransfer in automation browser',
    isReal: false,
  },
  {
    id: 'create_account',
    label: 'Create WeTransfer account with temp mailbox',
    isReal: false,
  },
  {
    id: 'verify_email',
    label: 'Poll temp mailbox for verification email',
    isReal: true,
  },
];

const LEAD_STEP_DEFS: Array<{ id: string; label: string; isReal: boolean }> = [
  {
    id: 'upload_file',
    label: 'Upload PDF/document to WeTransfer',
    isReal: false,
  },
  {
    id: 'send_to_lead',
    label: 'Send WeTransfer link to lead',
    isReal: false,
  },
];

function makeSteps(): WeTransferExecutionStep[] {
  return [...SETUP_STEP_DEFS, ...LEAD_STEP_DEFS].map((def) => ({
    ...def,
    status: 'pending' as WeTransferStepStatus,
  }));
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function pause(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ─── Session initialisation ─────────────────────────────────────────────────

/**
 * Create and initialise a WeTransfer engine session.
 *
 * REAL steps:
 *   1. create_mailbox  – POST https://api.temp-mail.io/v1/emails
 *   4. verify_email    – GET  https://api.temp-mail.io/v1/emails/{email}/messages
 *
 * SIMULATED steps:
 *   2. open_wetransfer – [AUTOMATION PLACEHOLDER] launch headless browser, navigate to wetransfer.com
 *   3. create_account  – [AUTOMATION PLACEHOLDER] fill signup form, submit
 *
 * @param campaignId       Campaign this session belongs to
 * @param tempMailApiKey   User-supplied temp-mail.io API key
 * @param onStep           Optional callback fired after each step completes
 */
export async function initWeTransferSession(
  campaignId: string,
  tempMailApiKey: string,
  onStep?: (step: WeTransferExecutionStep, logLine: string) => void
): Promise<WeTransferSession> {
  const session: WeTransferSession = {
    id: makeId('wt_session'),
    campaignId,
    tempMailbox: null,
    steps: makeSteps(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: 'initializing',
  };

  function stepUpdate(
    stepId: string,
    status: WeTransferStepStatus,
    detail?: string
  ): void {
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

  // ── Step 1 (REAL): Create temp mailbox ────────────────────────────────────
  stepUpdate('create_mailbox', 'running');
  try {
    const { mailbox, rateLimit } = await createTempMailboxIO(tempMailApiKey);
    session.tempMailbox = mailbox;
    stepUpdate(
      'create_mailbox',
      'success',
      `Mailbox: ${mailbox.email} | rate-limit remaining: ${rateLimit.remaining ?? 'unknown'}`
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    stepUpdate('create_mailbox', 'failed', msg);
    session.status = 'failed';
    return session;
  }

  // ── Step 2 (SIMULATED): Open WeTransfer ───────────────────────────────────
  // [AUTOMATION PLACEHOLDER]
  // const browser = await chromium.launch({ headless: true });
  // const page = await browser.newPage();
  // await page.goto('https://wetransfer.com', { waitUntil: 'networkidle' });
  stepUpdate('open_wetransfer', 'running');
  await pause(150);
  stepUpdate(
    'open_wetransfer',
    'success',
    'SIMULATED: WeTransfer navigated in automation browser'
  );

  // ── Step 3 (SIMULATED): Create WeTransfer account ─────────────────────────
  // [AUTOMATION PLACEHOLDER]
  // await page.click('[data-testid="signup-link"]');
  // await page.fill('[name="email"]', session.tempMailbox!.email);
  // await page.click('[data-testid="submit-signup"]');
  stepUpdate('create_account', 'running');
  await pause(150);
  stepUpdate(
    'create_account',
    'success',
    `SIMULATED: Signup submitted with ${session.tempMailbox!.email}`
  );

  // ── Step 4 (REAL infra + SIMULATED click): Verify email ───────────────────
  // We do a real inbox poll here. In the full automation flow we would wait
  // for the verification email, extract the link, and navigate to it.
  // The click/navigation itself remains a placeholder until browser automation
  // is wired in.
  stepUpdate('verify_email', 'running');
  try {
    const { messages, rateLimit } = await listMailboxMessages(
      session.tempMailbox!.email,
      tempMailApiKey
    );
    const verifMsg = messages.find(
      (m) =>
        m.subject?.toLowerCase().includes('verif') ||
        m.from?.toLowerCase().includes('wetransfer')
    );
    if (verifMsg) {
      stepUpdate(
        'verify_email',
        'success',
        `Verification email found: "${verifMsg.subject}" ` +
          `[rate-limit remaining: ${rateLimit.remaining ?? 'unknown'}]`
      );
    } else {
      stepUpdate(
        'verify_email',
        'success',
        `SIMULATED: No verification email yet (${messages.length} messages in inbox). ` +
          `Real automation would poll until email arrives then click the link.`
      );
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    stepUpdate(
      'verify_email',
      'success',
      `SIMULATED: Inbox poll error (${msg}); proceeding with simulated verification`
    );
  }

  session.status = 'ready';
  return session;
}

// ─── Per-lead send ──────────────────────────────────────────────────────────

/**
 * Send a file to a single lead via the WeTransfer session.
 *
 * SIMULATED steps:
 *   5. upload_file  – [AUTOMATION PLACEHOLDER] attach PDF via WeTransfer UI
 *   6. send_to_lead – [AUTOMATION PLACEHOLDER] fill recipient, click Send
 *
 * The session's real temp mailbox is logged against each attempt so that
 * the audit trail clearly shows which mailbox was used.
 *
 * @param session       Initialised WeTransfer session from initWeTransferSession
 * @param leadEmail     Recipient's email address
 * @param filename      Name of the file being transferred
 * @param onStep        Optional callback for step progress
 */
export async function sendLeadViaWeTransfer(
  session: WeTransferSession,
  leadEmail: string,
  filename: string,
  onStep?: (step: WeTransferExecutionStep, logLine: string) => void
): Promise<WeTransferSendResult> {
  if (!session.tempMailbox) {
    return {
      success: false,
      leadEmail,
      step: 'send_to_lead',
      detail: 'No temp mailbox in session – session may have failed during init',
    };
  }

  // Reset per-lead steps so the same session can be reused across leads
  for (const stepId of ['upload_file', 'send_to_lead']) {
    const step = session.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = 'pending';
      step.detail = undefined;
      step.timestamp = undefined;
    }
  }

  function stepUpdate(
    stepId: string,
    status: WeTransferStepStatus,
    detail?: string
  ): void {
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

  // ── Step 5 (SIMULATED): Upload file ───────────────────────────────────────
  // [AUTOMATION PLACEHOLDER]
  // await page.setInputFiles('[data-testid="file-input"]', localPdfPath);
  // await page.waitForSelector('[data-testid="upload-complete"]');
  stepUpdate('upload_file', 'running');
  await pause(120);
  stepUpdate(
    'upload_file',
    'success',
    `SIMULATED: ${filename} attached to WeTransfer transfer`
  );

  // ── Step 6 (SIMULATED): Send to lead ──────────────────────────────────────
  // [AUTOMATION PLACEHOLDER]
  // await page.fill('[data-testid="recipient-email"]', leadEmail);
  // await page.click('[data-testid="send-button"]');
  // await page.waitForURL(/transfer/);
  stepUpdate('send_to_lead', 'running');
  await pause(120);

  const shouldFail = leadEmail.includes('fail') || Math.random() < 0.08;
  if (shouldFail) {
    stepUpdate(
      'send_to_lead',
      'failed',
      `SIMULATED: Transfer to ${leadEmail} failed`
    );
    return {
      success: false,
      leadEmail,
      step: 'send_to_lead',
      detail: `SIMULATED: Transfer to ${leadEmail} failed`,
    };
  }

  const transferUrl = `https://wetransfer.com/downloads/simulated_${makeId('xfer')}`;
  stepUpdate(
    'send_to_lead',
    'success',
    `SIMULATED: Transfer sent to ${leadEmail} | link: ${transferUrl} | from mailbox: ${session.tempMailbox.email}`
  );

  return {
    success: true,
    leadEmail,
    step: 'send_to_lead',
    transferUrl,
    detail: `SIMULATED: Transfer link sent. Mailbox used: ${session.tempMailbox.email}`,
  };
}
