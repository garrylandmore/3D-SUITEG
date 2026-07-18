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

async function fillEmailField(page: Page, targetEmail: string, mode: 'recipient' | 'sender'): Promise<boolean> {
  const normalized = targetEmail.trim();
  if (!normalized) return false;

  const selectorHints = mode === 'recipient'
    ? [
        'input[placeholder*="email" i][name*="recipient" i]',
        'input[placeholder*="to" i][type="email"]',
        'input[name*="recipient" i][type="email"]',
      ]
    : [
        'input[placeholder*="your" i][type="email"]',
        'input[placeholder*="from" i][type="email"]',
        'input[name*="sender" i][type="email"]',
      ];

  for (const selector of selectorHints) {
    const field = page.locator(selector).first();
    if (await field.isVisible().catch(() => false)) {
      await field.fill(normalized);
      return true;
    }
  }

  const emailFields = page.locator('input[type="email"]');
  const count = await emailFields.count();
  if (count === 0) return false;

  if (mode === 'recipient') {
    await emailFields.first().fill(normalized);
    return true;
  }

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

async function uploadAttachment(page: Page, attachmentPath: string): Promise<void> {
  const input = page.locator('input[type="file"]').first();
  if (await input.count()) {
    await input.setInputFiles(attachmentPath);
    return;
  }

  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 8000 });
  const clicked = await clickFirstVisibleByText(page, ['Add files', 'Upload files', 'Select files', 'Add your files']);
  if (!clicked) {
    throw new Error('Could not find file input or upload trigger on WeTransfer page');
  }
  const chooser = await fileChooserPromise;
  await chooser.setFiles(attachmentPath);
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
    await uploadAttachment(page, attachmentPath);
    await page.waitForTimeout(1000);
    onPhase?.({ phase: 'upload_completed', detail: `Upload completed for "${filename}"` });

    const recipientFilled = await fillEmailField(page, normalizedRecipient, 'recipient');
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

    const sendClicked = await clickFirstVisibleByText(page, SEND_BUTTON_HINTS);
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
