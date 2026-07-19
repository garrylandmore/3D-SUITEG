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
      await page.goto(WETRANSFER_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
      await page.waitForTimeout(1200);
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
        await candidate.click({ timeout: 60000 }).catch(() => undefined);
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
        page.waitForEvent('filechooser', { timeout: 60000 }),
        el.click({ timeout: 60000 }),
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
  // Give every Playwright action/navigation in this flow at least 60 seconds.
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);

  // Step 1: Navigate to the login page
  await openWeTransferLoginPage(page, options.proxyConfig, onPhase, 'send-signup');

  // Step 2: Click "Sign up". WeTransfer currently renders this as an <a href="/signup?..."> link.
  // IMPORTANT: wait for the element to appear instead of using isVisible(), which is an immediate check.
  let signUpClicked = false;

  const signUpHrefLink = page.locator('a[href^="/signup"], a[href*="/signup?"]').first();

  try {
    await signUpHrefLink.waitFor({ state: 'visible', timeout: 60000 });

    const href = await signUpHrefLink.getAttribute('href').catch(() => null);

    try {
      await signUpHrefLink.click({ timeout: 60000 });
      signUpClicked = true;
    } catch (clickError) {
      // If a cookie banner/overlay intercepts the click, navigate directly to the real signup href.
      if (href) {
        await page.goto(new URL(href, page.url()).toString(), {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        signUpClicked = true;
      } else {
        throw clickError;
      }
    }
  } catch {
    // Accessibility/text fallbacks in case WeTransfer changes the signup URL structure.
    const signUpCandidates = [
      page.getByRole('link', { name: /^sign up$/i }).first(),
      page.getByRole('button', { name: /^sign up$/i }).first(),
      page.getByText('Sign up', { exact: true }).first(),
    ];

    for (const candidate of signUpCandidates) {
      try {
        await candidate.waitFor({ state: 'visible', timeout: 60000 });
        await candidate.click({ timeout: 60000 });
        signUpClicked = true;
        break;
      } catch {
        // Try the next fallback selector.
      }
    }
  }

  if (!signUpClicked) {
    throw new Error(
      `Could not find or open the WeTransfer Sign up link after waiting 60 seconds. Current URL: ${page.url()}`
    );
  }

  onPhase?.({ phase: 'signup_clicked', detail: 'Opened WeTransfer Sign up page' });
  await page.waitForTimeout(1500);
  await waitForStableDom(page);

  // Log only the auth requests that matter for OTP debugging.
  // Avoid flooding the console with CSS, JS, images, fonts, and hCaptcha assets.
  const authResponseLogger = async (response: any) => {
    const url = response.url();
    const status = response.status();
    const method = response.request().method();

    const isPasswordlessSignup =
      method === 'POST' && url.includes('/api/v1/signup/passwordless');
    const isPasswordlessVerify =
      method === 'POST' && /passwordless.*verify|verify.*passwordless/i.test(url);
    const isRelevantAuthError =
      method === 'POST' && /auth\.wetransfer\.com/i.test(url) && status >= 400;

    if (!isPasswordlessSignup && !isPasswordlessVerify && !isRelevantAuthError) return;

    let bodyPreview = '';
    try {
      const contentType = response.headers()['content-type'] || '';
      if (/json|text/i.test(contentType)) {
        bodyPreview = (await response.text()).replace(/\s+/g, ' ').slice(0, 500);
      }
    } catch {
      // Some responses cannot be read; status + URL are still useful.
    }

    const detail = `WeTransfer HTTP | ${status} ${method} ${url}${bodyPreview ? ` | ${bodyPreview}` : ''}`;
    console.log(detail);
    onPhase?.({ phase: 'verification_code_requested', detail });
  };

  page.on('response', authResponseLogger);

  // Step 3: Fill input#email with senderEmail
  const emailInput = page.locator('input#email').first();
  await emailInput.waitFor({ state: 'visible', timeout: 60000 });
  await emailInput.fill(senderEmail);
  console.log(`WETRANSFER EMAIL ENTERED | ${senderEmail}`);
  onPhase?.({ phase: 'sender_email_entered', detail: `Sender email entered: ${senderEmail}` });

  // Prepare both signals BEFORE submitting the email so we cannot miss the HTTP 201.
  const verificationCodeInput = page.locator(
    'input#verificationCode, input[name="verificationCode"]'
  ).first();
  const captchaWaitMs = Number.parseInt(
    process.env.WETRANSFER_CAPTCHA_WAIT_MS || '600000',
    10
  );

  const passwordless201Promise = page
    .waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/api/v1/signup/passwordless') &&
        response.status() === 201,
      { timeout: captchaWaitMs }
    )
    .then(() => 'http_201' as const)
    .catch(() => null);

  const otpFieldPromise = verificationCodeInput
    .waitFor({ state: 'visible', timeout: captchaWaitMs })
    .then(() => 'otp_field' as const)
    .catch(() => null);

  // Step 4: Click "Continue"
  const continueBtn = page.getByRole('button', { name: /continue/i }).first();
  if (await continueBtn.isVisible().catch(() => false)) {
    await continueBtn.click({ timeout: 60000 });
  } else {
    await emailInput.press('Enter');
  }

  console.log(
    `EMAIL SUBMITTED | ${senderEmail} | waiting for CAPTCHA completion / passwordless HTTP 201 / OTP field`
  );
  onPhase?.({
    phase: 'verification_code_requested',
    detail:
      'Submitted email. Waiting for successful passwordless signup or OTP field (complete any CAPTCHA manually if shown)',
  });

  onPhase?.({
    phase: 'awaiting_sender_verification',
    detail: `Waiting up to ${Math.round(
      captchaWaitMs / 1000
    )} seconds for WeTransfer to accept signup. Complete any CAPTCHA manually in the open browser.`,
  });

  // Start polling as soon as EITHER:
  //   A) WeTransfer confirms POST /api/v1/signup/passwordless with HTTP 201, OR
  //   B) the OTP input becomes visible.
  // This prevents the mailbox polling callback from being skipped after CAPTCHA.
  const trigger = await Promise.race([passwordless201Promise, otpFieldPromise]);

  if (!trigger) {
    page.off('response', authResponseLogger);
    throw new Error(
      `Timed out waiting for WeTransfer passwordless signup HTTP 201 or OTP field. Current URL: ${page.url()}`
    );
  }

  const triggerDetail =
    trigger === 'http_201'
      ? 'WeTransfer passwordless signup returned HTTP 201'
      : 'WeTransfer verification-code field detected';

  console.log(`OTP POLLING STARTED | trigger=${trigger} | mailbox=${senderEmail}`);
  onPhase?.({
    phase: 'verification_code_requested',
    detail: `${triggerDetail}. OTP POLLING STARTED for ${senderEmail}`,
  });

  // Step 5: Poll temp mailbox for verification code
  if (!options.onVerificationRequired) {
    throw new Error(
      'Signup verification required but no verification callback provided. ' +
        'Ensure the session was initialised with a temp-mail.io mailbox.'
    );
  }

  const resolution = await options.onVerificationRequired();
  page.off('response', authResponseLogger);
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
    const codeInput = page.locator('input#verificationCode, input[name="verificationCode"]').first();
    const codeInputFallback = page
      .locator('input[name*="code" i], input[placeholder*="code" i], input[autocomplete="one-time-code"]')
      .first();

    let activeCodeInput = codeInput;
    try {
      await codeInput.waitFor({ state: 'visible', timeout: 60000 });
    } catch {
      activeCodeInput = codeInputFallback;
      await activeCodeInput.waitFor({ state: 'visible', timeout: 60000 });
    }

    await activeCodeInput.fill('');
    await activeCodeInput.fill(resolution.verificationCode);

    const verifyBtn = page.getByRole('button', { name: /^verify$/i }).first();
    try {
      await verifyBtn.waitFor({ state: 'visible', timeout: 60000 });
      await verifyBtn.click({ timeout: 60000 });
    } catch {
      const clicked = await clickFirstVisibleByText(page, ['Verify', 'Confirm', 'Continue']);
      if (!clicked) {
        throw new Error(`Verification code was filled but the Verify button could not be found. Current URL: ${page.url()}`);
      }
    }
    onPhase?.({ phase: 'verification_submitted', detail: 'Verification code submitted, waiting for session' });
    await page.waitForTimeout(3000);
    await waitForStableDom(page);
  } else if (resolution.verificationLink) {
    // If a magic link was provided instead of a code, navigate directly
    await page.goto(resolution.verificationLink, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForStableDom(page);
    onPhase?.({ phase: 'verification_submitted', detail: 'Followed verification link' });
  }

  // Step 8: Accept terms if shown
  const termsBtn = page.locator('[data-testid="accept-terms"]').first();
  if (await termsBtn.isVisible().catch(() => false)) {
    await termsBtn.click({ timeout: 60000 }).catch(() => undefined);
    onPhase?.({ phase: 'terms_accepted', detail: 'Accepted WeTransfer terms and conditions' });
    await page.waitForTimeout(1500);
    await waitForStableDom(page);
  }

  // Step 9: Wait for the uploader UI to become visible
  let uploaderVisible = false;
  for (let attempt = 0; attempt < 15; attempt += 1) {
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
      { timeout: 60000 }
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
    await page.waitForTimeout(1000);
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
      await transferByTestId.click({ timeout: 60000 });
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
