import { stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium, Page } from 'playwright';

const WETRANSFER_URL = (process.env.WETRANSFER_WEB_URL || 'https://wetransfer.com').trim();

type VerificationResolution = {
  verificationLink?: string;
  verificationCode?: string;
  mailboxMessageCount?: number;
  detail?: string;
};

export type WeTransferSendPhase =
  | 'opening_browser'
  | 'loading_wetransfer'
  | 'awaiting_sender_verification'
  | 'verification_received'
  | 'preparing_attachment'
  | 'upload_started'
  | 'upload_completed'
  | 'send_submitted'
  | 'send_confirmed'
  | 'failed';

export type WeTransferSendPhaseUpdate = {
  phase: WeTransferSendPhase;
  detail: string;
};

export type WeTransferSendOptions = {
  attachmentPath?: string;
  senderEmail?: string;
  onVerificationRequired?: () => Promise<VerificationResolution | null>;
};

const BUTTON_HINTS = [
  'Accept',
  'Accept all',
  'I agree',
  'I accept',
  'Continue',
  'Got it',
  'Agree',
  'Understood',
  'Allow all',
];

const SEND_BUTTON_HINTS = [
  'Transfer',
  'Send',
  'Get a link',
  'Continue',
  'Proceed',
  'Create transfer',
];

async function clickFirstVisibleByText(page: Page, hints: string[]): Promise<boolean> {
  for (const hint of hints) {
    const candidates = page
      .locator('button, [role="button"], input[type="button"], input[type="submit"], a')
      .filter({ hasText: hint });
    const count = await candidates.count();
    for (let i = 0; i < count; i += 1) {
      const candidate = candidates.nth(i);
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click({ timeout: 2000 }).catch(() => undefined);
        return true;
      }
    }
  }
  return false;
}

async function dismissConsentAndPopups(page: Page): Promise<void> {
  await clickFirstVisibleByText(page, BUTTON_HINTS);
}

async function waitForStableDom(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(600);
}

/**
 * Attempt to attach a file to the WeTransfer upload area using multiple selector strategies.
 *
 * Strategy order:
 *   A) hidden input path  — look for input[type="file"] directly
 *   B) file chooser path  — click an "Add files" trigger and intercept the file chooser
 *      B1: getByRole button with name "Add files"
 *      B2: [role="button"] containing "Add files" text
 *      B3: button element containing "Add files" text
 *      B4: button that contains img[src*="add-files"] (WeTransfer-specific SVG)
 *      B5: img[src*="add-files"] parent element (catches non-button wrappers)
 *      B6: getByText "Add files" (any visible element)
 *
 * Logs the winning strategy via `onLog`. On total failure, throws with the list of
 * attempted strategies so logs are diagnostic rather than generic.
 */
async function uploadAttachment(
  page: Page,
  attachmentPath: string,
  onLog?: (msg: string) => void
): Promise<void> {
  // Strategy A: direct hidden file input
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count()) {
    onLog?.('hidden input path: found input[type="file"] — setting files directly');
    await fileInput.setInputFiles(attachmentPath);
    return;
  }
  onLog?.('hidden input path: input[type="file"] absent — trying file chooser path');

  // Strategy B: trigger file chooser via "Add files" UI
  type LocatorDef = { label: string; locator: ReturnType<Page['locator']> };
  const addFilesTargets: LocatorDef[] = [
    {
      label: 'add-files text: getByRole(button, "Add files")',
      locator: page.getByRole('button', { name: /add files/i }),
    },
    {
      label: 'add-files text: [role="button"] hasText /add files/i',
      locator: page.locator('[role="button"]').filter({ hasText: /add files/i }),
    },
    {
      label: 'add-files text: button hasText /add files/i',
      locator: page.locator('button').filter({ hasText: /add files/i }),
    },
    {
      // WeTransfer-specific: button wrapping the add-files-v2.svg image
      label: 'add-files text: button:has(img[src*="add-files"])',
      locator: page.locator('button:has(img[src*="add-files"])'),
    },
    {
      // WeTransfer-specific: any ancestor of the add-files img that is clickable
      label: 'add-files text: img[src*="add-files"] parent element',
      locator: page.locator('img[src*="add-files"]').locator('xpath=..'),
    },
    {
      label: 'add-files text: getByText("Add files", exact)',
      locator: page.getByText('Add files', { exact: true }),
    },
  ];

  const attemptedLabels: string[] = [];

  for (const { label, locator } of addFilesTargets) {
    let count = 0;
    try { count = await locator.count(); } catch { /* skip */ }
    if (count === 0) {
      attemptedLabels.push(`${label} (DOM cue absent)`);
      continue;
    }

    const el = locator.first();
    const visible = await el.isVisible().catch(() => false);
    if (!visible) {
      attemptedLabels.push(`${label} (found but not visible)`);
      continue;
    }

    try {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 8000 }),
        el.click({ timeout: 3000 }),
      ]);
      onLog?.(`file chooser path: succeeded via ${label}`);
      await fileChooser.setFiles(attachmentPath);
      return;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      attemptedLabels.push(`${label} (click did not open file chooser: ${reason})`);
    }
  }

  throw new Error(
    `Could not find file input or upload trigger on WeTransfer page. ` +
      `Strategies attempted: ${attemptedLabels.join('; ')}`
  );
}

/**
 * Fill an email field on the WeTransfer page.
 *
 * Recipient mode strategy order:
 *   1) input#autosuggest  (WeTransfer current stable ID)
 *   2) input[name="autosuggest"]
 *   3) getByLabel(/email to/i)  (WeTransfer current label text)
 *   4) heuristic placeholder/name selectors
 *   5) first input[type="email"]
 *
 * Logs the winning strategy via `onLog`.
 */
async function fillEmailField(
  page: Page,
  targetEmail: string,
  mode: 'recipient' | 'sender',
  onLog?: (msg: string) => void
): Promise<boolean> {
  const normalized = targetEmail.trim();
  if (!normalized) return false;

  if (mode === 'recipient') {
    // Strategy 1 & 2: WeTransfer stable selectors observed in current DOM
    const stableSelectors = [
      { label: 'recipient field detection: input#autosuggest', selector: 'input#autosuggest' },
      { label: 'recipient field detection: input[name="autosuggest"]', selector: 'input[name="autosuggest"]' },
    ];
    for (const { label, selector } of stableSelectors) {
      const field = page.locator(selector).first();
      if (await field.isVisible().catch(() => false)) {
        onLog?.(label);
        await field.fill(normalized);
        // Confirm the autosuggest entry so WeTransfer registers the recipient
        await field.press('Enter').catch(() => undefined);
        await page.waitForTimeout(300);
        return true;
      }
    }

    // Strategy 3: getByLabel "Email to"
    const byLabel = page.getByLabel(/email to/i);
    if (await byLabel.isVisible().catch(() => false)) {
      onLog?.('recipient field detection: getByLabel("Email to")');
      await byLabel.fill(normalized);
      await byLabel.press('Enter').catch(() => undefined);
      await page.waitForTimeout(300);
      return true;
    }

    // Strategy 4: heuristic placeholder/name selectors
    const heuristicSelectors = [
      'input[placeholder*="email" i][name*="recipient" i]',
      'input[placeholder*="to" i][type="email"]',
      'input[name*="recipient" i][type="email"]',
    ];
    for (const selector of heuristicSelectors) {
      const field = page.locator(selector).first();
      if (await field.isVisible().catch(() => false)) {
        onLog?.(`recipient field detection: heuristic selector ${selector}`);
        await field.fill(normalized);
        return true;
      }
    }

    // Strategy 5: first visible email input
    const emailFields = page.locator('input[type="email"]');
    const count = await emailFields.count();
    if (count > 0) {
      onLog?.('recipient field detection: first input[type="email"] fallback');
      await emailFields.first().fill(normalized);
      return true;
    }

    onLog?.('recipient field detection: no matching field found');
    return false;
  }

  // sender mode
  const senderHints = [
    'input[placeholder*="your" i][type="email"]',
    'input[placeholder*="from" i][type="email"]',
    'input[name*="sender" i][type="email"]',
  ];
  for (const selector of senderHints) {
    const field = page.locator(selector).first();
    if (await field.isVisible().catch(() => false)) {
      await field.fill(normalized);
      return true;
    }
  }
  const emailFields = page.locator('input[type="email"]');
  const count = await emailFields.count();
  if (count === 0) return false;
  if (count > 1) {
    await emailFields.nth(1).fill(normalized);
    return true;
  }
  return false;
}

function extractTransferLinkFromHtml(html: string): string | undefined {
  const matches = html.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  const preferred = matches.find((value) => /wetransfer\.com\/(downloads|transfers)/i.test(value));
  return preferred || matches[0];
}

function getAntiBotHint(html: string): string | null {
  const text = html.toLowerCase();
  if (text.includes('captcha') || text.includes('cloudflare') || text.includes('verify you are human')) {
    return 'WeTransfer browser flow appears blocked by anti-bot verification (captcha/human check).';
  }
  return null;
}

async function handleVerificationIfPrompted(
  page: Page,
  options: WeTransferSendOptions,
  onPhase?: (update: WeTransferSendPhaseUpdate) => void
): Promise<void> {
  const html = await page.content();
  const verificationPromptDetected =
    /verify your email|check your inbox|verification code|confirm your email/i.test(html);

  if (!verificationPromptDetected) {
    return;
  }

  onPhase?.({
    phase: 'awaiting_sender_verification',
    detail: 'WeTransfer requested sender verification. Polling temp mailbox.',
  });

  if (!options.onVerificationRequired) {
    throw new Error('Sender verification is required but mailbox verification callback is unavailable.');
  }

  const resolution = await options.onVerificationRequired();
  if (!resolution?.verificationLink && !resolution?.verificationCode) {
    throw new Error(
      resolution?.detail || 'Sender verification requested but no verification link/code was found in mailbox.'
    );
  }

  onPhase?.({
    phase: 'verification_received',
    detail:
      resolution.detail ||
      `Verification received${resolution.mailboxMessageCount !== undefined ? ` (mailbox messages: ${resolution.mailboxMessageCount})` : ''}`,
  });

  if (resolution.verificationCode) {
    const codeInput = page
      .locator('input[name*="code" i], input[placeholder*="code" i], input[autocomplete="one-time-code"]')
      .first();
    if (await codeInput.isVisible().catch(() => false)) {
      await codeInput.fill(resolution.verificationCode);
      await clickFirstVisibleByText(page, ['Verify', 'Confirm', 'Continue']);
    }
  }

  if (resolution.verificationLink) {
    await page.goto(resolution.verificationLink, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForStableDom(page);
  }
}

async function confirmSend(page: Page): Promise<{ transferUrl?: string }> {
  const successTextChecks = [
    'Transfer sent',
    "You've sent",
    'Files are on their way',
    'Your transfer is ready',
    'Email sent',
  ];

  try {
    await page.waitForFunction(
      (texts) => {
        const bodyText = document.body?.innerText || '';
        return texts.some((text: string) => bodyText.toLowerCase().includes(text.toLowerCase()));
      },
      successTextChecks,
      { timeout: 45000 }
    );
  } catch {
    // Continue with HTML-based fallback below.
  }

  const html = await page.content();
  const antiBotHint = getAntiBotHint(html);
  if (antiBotHint) {
    throw new Error(antiBotHint);
  }

  const sentDetected =
    /transfer sent|files are on their way|your transfer is ready|email sent|download link/i.test(html);

  if (!sentDetected) {
    throw new Error('WeTransfer did not show a send confirmation page after submitting transfer.');
  }

  return { transferUrl: extractTransferLinkFromHtml(html) };
}

export async function probeWeTransferWebsite(
  onPhase?: (update: WeTransferSendPhaseUpdate) => void
): Promise<{ success: boolean; error?: string }> {
  let browser;
  try {
    onPhase?.({ phase: 'opening_browser', detail: 'Launching automation browser' });
    browser = await chromium.launch({
      headless: (process.env.WETRANSFER_HEADLESS || 'true').trim().toLowerCase() !== 'false',
    });

    const page = await browser.newPage();
    onPhase?.({ phase: 'loading_wetransfer', detail: `Loading ${WETRANSFER_URL}` });
    await page.goto(WETRANSFER_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForStableDom(page);
    await dismissConsentAndPopups(page);

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export async function createWeTransferTransfer(
  filename: string,
  fileBuffer: Buffer,
  recipientEmail: string,
  message?: string,
  onPhase?: (update: WeTransferSendPhaseUpdate) => void,
  options: WeTransferSendOptions = {}
): Promise<{ success: boolean; downloadUrl?: string; error?: string }> {
  let browser;
  try {
    const normalizedRecipient = recipientEmail.trim();
    if (!normalizedRecipient) {
      throw new Error('Recipient email is required for WeTransfer send');
    }

    const attachmentPath = options.attachmentPath?.trim();
    if (!attachmentPath) {
      throw new Error('Attachment path is required for browser upload');
    }

    const attachmentStats = await stat(attachmentPath).catch(() => null);
    if (!attachmentStats || !attachmentStats.isFile() || attachmentStats.size <= 0) {
      throw new Error(`Attachment file is missing or empty: ${attachmentPath}`);
    }

    const senderEmail = (options.senderEmail || '').trim();

    onPhase?.({ phase: 'opening_browser', detail: 'Launching automation browser' });
    browser = await chromium.launch({
      headless: (process.env.WETRANSFER_HEADLESS || 'true').trim().toLowerCase() !== 'false',
    });

    const page = await browser.newPage();

    onPhase?.({ phase: 'loading_wetransfer', detail: `Navigating to ${WETRANSFER_URL}` });
    await page.goto(WETRANSFER_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForStableDom(page);
    await dismissConsentAndPopups(page);

    onPhase?.({ phase: 'preparing_attachment', detail: `Using file ${path.basename(attachmentPath)}` });
    onPhase?.({ phase: 'upload_started', detail: `Uploading "${filename}" (${fileBuffer.length} bytes)` });

    const uploadStrategyLog: string[] = [];
    await uploadAttachment(page, attachmentPath, (msg) => {
      uploadStrategyLog.push(msg);
      onPhase?.({ phase: 'upload_started', detail: msg });
    });
    await page.waitForTimeout(1000);
    onPhase?.({
      phase: 'upload_completed',
      detail: `Upload completed for "${filename}"${uploadStrategyLog.length ? ` [${uploadStrategyLog.join(', ')}]` : ''}`,
    });

    const recipientStrategyLog: string[] = [];
    const recipientFilled = await fillEmailField(page, normalizedRecipient, 'recipient', (msg) => {
      recipientStrategyLog.push(msg);
      onPhase?.({ phase: 'send_submitted', detail: msg });
    });
    if (!recipientFilled) {
      throw new Error('Could not locate recipient email field in WeTransfer browser flow.');
    }

    if (senderEmail) {
      await fillEmailField(page, senderEmail, 'sender');
    }

    if (message?.trim()) {
      const messageField = page
        .locator('textarea[name*="message" i], textarea[placeholder*="message" i], textarea')
        .first();
      if (await messageField.isVisible().catch(() => false)) {
        await messageField.fill(message.trim());
      }
    }

    await clickFirstVisibleByText(page, ['I agree', 'Accept terms', 'Agree']);

    // Transfer button: prefer the stable data-testid attribute, fall back to text-based search
    let sendClicked = false;
    const transferByTestId = page.locator('[data-testid="uploaderForm-transfer-button"]');
    if (await transferByTestId.isVisible().catch(() => false)) {
      onPhase?.({ phase: 'send_submitted', detail: 'transfer button detection: data-testid="uploaderForm-transfer-button"' });
      await transferByTestId.click({ timeout: 5000 });
      sendClicked = true;
    } else {
      sendClicked = await clickFirstVisibleByText(page, SEND_BUTTON_HINTS);
      if (sendClicked) {
        onPhase?.({ phase: 'send_submitted', detail: 'transfer button detection: text-based selector (Transfer/Send/etc.)' });
      }
    }
    if (!sendClicked) {
      throw new Error('Could not find send/transfer submit button in WeTransfer browser flow.');
    }

    onPhase?.({ phase: 'send_submitted', detail: `Transfer submission clicked for ${normalizedRecipient}` });

    await handleVerificationIfPrompted(page, options, onPhase);
    const confirmation = await confirmSend(page);

    onPhase?.({ phase: 'send_confirmed', detail: `Transfer confirmed for ${normalizedRecipient}` });

    return {
      success: true,
      downloadUrl: confirmation.transferUrl,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    onPhase?.({ phase: 'failed', detail: message });
    return {
      success: false,
      error: message,
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
