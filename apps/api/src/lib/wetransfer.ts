import { stat } from 'node:fs/promises';
import path from 'node:path';
import { chromium, Page } from 'playwright';
import type { BrowserProxyConfig } from './browser-proxy-types';
import {
  buildPlaywrightProxyLaunchOptions,
  getBrowserProxyDiagnostics,
} from './browser-proxy';

const WETRANSFER_URL = (process.env.WETRANSFER_WEB_URL || 'https://wetransfer.com').trim();
const WETRANSFER_LOGIN_URL = `${WETRANSFER_URL.replace(/\/$/, '')}/log-in`;

// Timeouts (increased for slow proxy connections) - ALL configurable via environment
const ELEMENT_TIMEOUT = parseInt(process.env.ELEMENT_TIMEOUT || '180000', 10); // 180s default (3 minutes)
const CLICK_TIMEOUT = parseInt(process.env.CLICK_TIMEOUT || '60000', 10); // 60s default
const WAIT_TIMEOUT = parseInt(process.env.WAIT_TIMEOUT || '10000', 10); // 10s default
const PAGE_GOTO_TIMEOUT = parseInt(process.env.PAGE_GOTO_TIMEOUT || '120000', 10); // 120s
const FILE_CHOOSER_TIMEOUT = parseInt(process.env.FILE_CHOOSER_TIMEOUT || '30000', 10); // 30s
const CONFIRM_SEND_TIMEOUT = parseInt(process.env.CONFIRM_SEND_TIMEOUT || '90000', 10); // 90s

type VerificationResolution = {
  verificationLink?: string;
  verificationCode?: string;
  mailboxMessageCount?: number;
  detail?: string;
};

export type WeTransferSendPhase =
  | 'opening_browser'
  | 'loading_wetransfer'
  | 'navigating_to_login'
  | 'signup_clicked'
  | 'sender_email_entered'
  | 'verification_code_requested'
  | 'awaiting_sender_verification'
  | 'verification_received'
  | 'verification_submitted'
  | 'terms_accepted'
  | 'uploader_visible'
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
  proxyConfig?: BrowserProxyConfig | null;
};

function isHeadlessEnabled(): boolean {
  return (process.env.WETRANSFER_HEADLESS || 'true').trim().toLowerCase() !== 'false';
}

async function launchWeTransferBrowser(
  proxyConfig: BrowserProxyConfig | null | undefined,
  onPhase: ((update: WeTransferSendPhaseUpdate) => void) | undefined,
  launchPath: string
) {
  onPhase?.({
    phase: 'opening_browser',
    detail: getBrowserProxyDiagnostics(proxyConfig, 'launchWeTransferBrowser', launchPath),
  });
  onPhase?.({ phase: 'opening_browser', detail: 'Launching automation browser' });

  return chromium.launch({
    headless: isHeadlessEnabled(),
    ...buildPlaywrightProxyLaunchOptions(proxyConfig),
  });
}

async function openWeTransferLoginPage(
  page: Page,
  proxyConfig: BrowserProxyConfig | null | undefined,
  onPhase: ((update: WeTransferSendPhaseUpdate) => void) | undefined,
  launchPath: string
): Promise<void> {
  const maxAttempts = proxyConfig?.enabled ? 2 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      onPhase?.({
        phase: 'loading_wetransfer',
        detail: `Loading ${WETRANSFER_LOGIN_URL} | helper=launchWeTransferBrowser | path=${launchPath} | attempt=${attempt}/${maxAttempts}`,
      });
      await page.goto(WETRANSFER_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_GOTO_TIMEOUT });
      await waitForStableDom(page);
      await dismissConsentAndPopups(page);
      const finalUrl = page.url();
      onPhase?.({
        phase: 'navigating_to_login',
        detail: `Login page reachable (final URL: ${finalUrl}) | helper=launchWeTransferBrowser | path=${launchPath}`,
      });
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry =
        proxyConfig?.enabled &&
        attempt < maxAttempts &&
        /ERR_TUNNEL_CONNECTION_FAILED/i.test(message);

      if (!shouldRetry) {
        throw error;
      }

      onPhase?.({
        phase: 'loading_wetransfer',
        detail: `Proxy tunnel failed while loading WeTransfer (attempt ${attempt}/${maxAttempts}); retrying once`,
      });
      await page.waitForTimeout(2000);
    }
  }
}

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
        await candidate.click({ timeout: CLICK_TIMEOUT }).catch(() => undefined);
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
  await page.waitForTimeout(1500);
}

async function isUploaderVisible(page: Page): Promise<boolean> {
  const selectorChecks = [
    'input[type="file"]',
    'input#autosuggest',
    'input[name="autosuggest"]',
    'label[for="autosuggest"]',
    '[data-testid="uploaderForm-transfer-button"]',
  ];

  for (const selector of selectorChecks) {
    const visible = await page.locator(selector).first().isVisible().catch(() => false);
    if (visible) {
      return true;
    }
  }

  if (await page.getByRole('button', { name: /add files/i }).first().isVisible().catch(() => false)) {
    return true;
  }
  if (await page.getByText(/add files/i).first().isVisible().catch(() => false)) {
    return true;
  }

  return false;
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
        page.waitForEvent('filechooser', { timeout: FILE_CHOOSER_TIMEOUT }),
        el.click({ timeout: CLICK_TIMEOUT }),
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
        await page.waitForTimeout(1000);
        return true;
      }
    }

    // Strategy 3: getByLabel "Email to"
    const byLabel = page.getByLabel(/email to/i);
    if (await byLabel.isVisible().catch(() => false)) {
      onLog?.('recipient field detection: getByLabel("Email to")');
      await byLabel.fill(normalized);
      await byLabel.press('Enter').catch(() => undefined);
      await page.waitForTimeout(1000);
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

/**
 * Perform the explicit WeTransfer signup/login flow observed in live Playwright inspection:
 *   1. Navigate to /log-in
 *   2. Click "Sign up"
 *   3. Fill input#email with senderEmail
 *   4. Click "Continue"
 *   5. Poll temp mailbox for verification code (via onVerificationRequired)
 *   6. Fill input#verificationCode
 *   7. Click "Verify"
 *   8. If [data-testid="accept-terms"] appears, click "I agree"
 *   9. Wait for the uploader UI to become visible
 */
async function performSignupAndVerification(
  page: Page,
  senderEmail: string,
  options: WeTransferSendOptions,
  onPhase?: (update: WeTransferSendPhaseUpdate) => void
): Promise<void> {
  // Step 1: Navigate to the login page
  await openWeTransferLoginPage(page, options.proxyConfig, onPhase, 'send-signup');

  // Step 2: Click "Sign up"
  const signUpCandidates = [
    page.getByRole('link', { name: /sign up/i }).first(),
    page.getByRole('button', { name: /sign up/i }).first(),
    page.getByText('Sign up', { exact: true }).first(),
  ];
  let signUpClicked = false;
  for (const candidate of signUpCandidates) {
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click({ timeout: CLICK_TIMEOUT });
      signUpClicked = true;
      break;
    }
  }
  if (signUpClicked) {
    onPhase?.({ phase: 'signup_clicked', detail: 'Clicked Sign up on WeTransfer login page' });
    await page.waitForTimeout(3000);
    await waitForStableDom(page);
  } else {
    onPhase?.({ phase: 'signup_clicked', detail: 'Sign up link not found; proceeding with email entry directly' });
  }

  // Step 3: Fill input#email with senderEmail
  const emailInput = page.locator('input#email').first();
  await emailInput.waitFor({ state: 'visible', timeout: ELEMENT_TIMEOUT });
  await emailInput.fill(senderEmail);
  await page.waitForTimeout(WAIT_TIMEOUT);
  onPhase?.({ phase: 'sender_email_entered', detail: `Sender email entered: ${senderEmail}` });

  // Step 4: Click "Continue"
  const continueBtn = page.getByRole('button', { name: /continue/i }).first();
  if (await continueBtn.isVisible().catch(() => false)) {
    await continueBtn.click({ timeout: CLICK_TIMEOUT });
  } else {
    // Fallback: press Enter on the email input
    await emailInput.press('Enter');
  }
  onPhase?.({ phase: 'verification_code_requested', detail: 'Submitted email, polling temp mailbox for verification code' });
  await page.waitForTimeout(5000);

  // Step 5: Poll temp mailbox for verification code
  if (!options.onVerificationRequired) {
    throw new Error(
      'Signup verification required but no verification callback provided. ' +
        'Ensure the session was initialised with a temp-mail.io mailbox.'
    );
  }

  const resolution = await options.onVerificationRequired();
  if (!resolution?.verificationCode && !resolution?.verificationLink) {
    const currentUrl = page.url();
    throw new Error(
      `${resolution?.detail || 'No verification code received in temp mailbox after signup'} ` +
        `(last successful stage: verification_code_requested, current URL: ${currentUrl})`
    );
  }

  onPhase?.({
    phase: 'verification_received',
    detail:
      resolution.detail ||
      `Verification code received${resolution.mailboxMessageCount !== undefined ? ` (mailbox messages: ${resolution.mailboxMessageCount})` : ''}`,
  });

  // Step 6 & 7: Fill input#verificationCode and click "Verify"
  if (resolution.verificationCode) {
    const codeInput = page.locator('input#verificationCode').first();
    const codeInputFallback = page
      .locator('input[name*="code" i], input[placeholder*="code" i], input[autocomplete="one-time-code"]')
      .first();

    const primaryVisible = await codeInput.isVisible().catch(() => false);
    const activeCodeInput = primaryVisible ? codeInput : codeInputFallback;

    await activeCodeInput.waitFor({ state: 'visible', timeout: ELEMENT_TIMEOUT });
    await activeCodeInput.fill(resolution.verificationCode);
    await page.waitForTimeout(WAIT_TIMEOUT);

    const verifyBtn = page.getByRole('button', { name: /verify/i }).first();
    if (await verifyBtn.isVisible().catch(() => false)) {
      await verifyBtn.click({ timeout: CLICK_TIMEOUT });
    } else {
      await clickFirstVisibleByText(page, ['Verify', 'Confirm', 'Continue']);
    }
    onPhase?.({ phase: 'verification_submitted', detail: 'Verification code submitted, waiting for session' });
    await page.waitForTimeout(8000);
    await waitForStableDom(page);
  } else if (resolution.verificationLink) {
    // If a magic link was provided instead of a code, navigate directly
    await page.goto(resolution.verificationLink, { waitUntil: 'domcontentloaded', timeout: PAGE_GOTO_TIMEOUT });
    await waitForStableDom(page);
    onPhase?.({ phase: 'verification_submitted', detail: 'Followed verification link' });
  }

  // Step 8: Accept terms if shown
  const termsBtn = page.locator('[data-testid="accept-terms"]').first();
  if (await termsBtn.isVisible().catch(() => false)) {
    await termsBtn.click({ timeout: CLICK_TIMEOUT }).catch(() => undefined);
    onPhase?.({ phase: 'terms_accepted', detail: 'Accepted WeTransfer terms and conditions' });
    await page.waitForTimeout(3000);
    await waitForStableDom(page);
  }

  // Step 9: Wait for the uploader UI to become visible
  let uploaderVisible = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await isUploaderVisible(page)) {
      uploaderVisible = true;
      break;
    }
    await page.waitForTimeout(1000);
  }

  const postSignupUrl = page.url();
  if (!uploaderVisible) {
    throw new Error(
      `Uploader UI did not appear after signup/verification ` +
        `(last successful stage: verification_submitted, current URL: ${postSignupUrl})`
    );
  }

  onPhase?.({ phase: 'uploader_visible', detail: `Uploader UI is visible (URL: ${postSignupUrl})` });
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
      { timeout: CONFIRM_SEND_TIMEOUT }
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
  onPhase?: (update: WeTransferSendPhaseUpdate) => void,
  proxyConfig?: BrowserProxyConfig | null,
  launchPath = 'probe'
): Promise<{ success: boolean; error?: string }> {
  let browser;
  try {
    browser = await launchWeTransferBrowser(proxyConfig, onPhase, launchPath);

    const page = await browser.newPage();
    await openWeTransferLoginPage(page, proxyConfig, onPhase, launchPath);

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
    if (!senderEmail) {
      throw new Error(
        'Sender email (temp mailbox) is required for the WeTransfer signup/login flow'
      );
    }

    browser = await launchWeTransferBrowser(options.proxyConfig, onPhase, 'send-transfer');

    const page = await browser.newPage();

    // Perform signup + verification flow before touching the uploader
    await performSignupAndVerification(page, senderEmail, options, onPhase);

    onPhase?.({ phase: 'preparing_attachment', detail: `Using file ${path.basename(attachmentPath)}` });
    onPhase?.({ phase: 'upload_started', detail: `Uploading "${filename}" (${fileBuffer.length} bytes)` });

    const uploadStrategyLog: string[] = [];
    try {
      await uploadAttachment(page, attachmentPath, (msg) => {
        uploadStrategyLog.push(msg);
        onPhase?.({ phase: 'upload_started', detail: msg });
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const currentUrl = page.url();
      throw new Error(
        `${message} (last successful stage: uploader_visible, current URL: ${currentUrl})`
      );
    }
    await page.waitForTimeout(3000);
    onPhase?.({
      phase: 'upload_completed',
      detail: `Upload completed for "${filename}"${uploadStrategyLog.length ? ` [${uploadStrategyLog.join(', ')}]` : ''}`,
    });

    const recipientFilled = await fillEmailField(page, normalizedRecipient, 'recipient', (msg) => {
      onPhase?.({ phase: 'send_submitted', detail: msg });
    });
    if (!recipientFilled) {
      throw new Error('Could not locate recipient email field in WeTransfer browser flow.');
    }

    if (message?.trim()) {
      const messageField = page
        .locator('textarea[name*="message" i], textarea[placeholder*="message" i], textarea')
        .first();
      if (await messageField.isVisible().catch(() => false)) {
        await messageField.fill(message.trim());
      }
    }

    // Transfer button: prefer the stable data-testid attribute, fall back to text-based search
    let sendClicked = false;
    const transferByTestId = page.locator('[data-testid="uploaderForm-transfer-button"]');
    if (await transferByTestId.isVisible().catch(() => false)) {
      onPhase?.({ phase: 'send_submitted', detail: 'transfer button detection: data-testid="uploaderForm-transfer-button"' });
      await transferByTestId.click({ timeout: CLICK_TIMEOUT });
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
