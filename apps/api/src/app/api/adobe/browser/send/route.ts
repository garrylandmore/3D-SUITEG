import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getAdobeBrowserStore } from '@/lib/adobe-browser-store';

export const dynamic = 'force-dynamic';

function normalizeEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
    )
  );
}

async function firstVisible(page: any, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      return { locator, selector };
    }
  }
  return null;
}

async function attachPdf(page: any, filePath: string, filename: string): Promise<string> {
  const directInputs = page.locator('input[type="file"]');
  const count = await directInputs.count().catch(() => 0);

  for (let index = 0; index < count; index += 1) {
    const input = directInputs.nth(index);
    try {
      await input.setInputFiles(filePath);
      return `input[type=file] #${index + 1}`;
    } catch {}
  }

  const uploadButton = await firstVisible(page, [
    'button:has-text("Upload")',
    'button:has-text("Upload a file")',
    'button[aria-label*="Upload" i]',
    '[role="button"]:has-text("Upload")',
  ]);

  if (!uploadButton) {
    throw new Error(
      'Could not find Adobe upload control. Keep Acrobat open on the Documents/Home page and try again.'
    );
  }

  const chooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });
  await uploadButton.locator.click();
  const chooser = await chooserPromise;
  await chooser.setFiles(filePath);

  return `${uploadButton.selector} → file chooser (${filename})`;
}

async function waitForUploadedFile(page: any, filename: string): Promise<void> {
  const exact = page.getByText(filename, { exact: true }).first();

  if (
    await exact
      .waitFor({ state: 'visible', timeout: 60000 })
      .then(() => true)
      .catch(() => false)
  ) {
    return;
  }

  const partial = page.getByText(filename, { exact: false }).first();

  if (
    await partial
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false)
  ) {
    return;
  }

  throw new Error(
    `Adobe upload did not finish in time for "${filename}".`
  );
}

async function openShareUi(page: any, filename: string): Promise<void> {
  // Prefer Adobe's exact Share button from the document toolbar.
  const exactShare = page.locator(
    'button#shareButton[data-testid="shareButton"], button[data-testid="shareButton"]'
  ).first();

  if (
    await exactShare
      .waitFor({ state: 'visible', timeout: 30000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await exactShare.click();
    return;
  }

  // If the uploaded file is still shown in a document list/card, open it first.
  const fileLocator = page.getByText(filename, { exact: false }).first();

  if (await fileLocator.isVisible().catch(() => false)) {
    await fileLocator.click().catch(() => undefined);
  }

  const share = await firstVisible(page, [
    'button#shareButton',
    'button[data-testid="shareButton"]',
    'button[aria-label="Share"]',
    'button:has-text("Share")',
  ]);

  if (!share) {
    throw new Error(
      'Upload completed, but Adobe Share button was not found.'
    );
  }

  await share.locator.click();
}

async function addRecipients(page: any, recipients: string[]): Promise<void> {
  const inputSelectors = [
    'input[data-testid="invite-input-field"]',
    'input[data-testid="invite-input-field-placeholder"]',
    'input[placeholder="Add names or emails to invite"]',
    'input[placeholder="Add name or email to invite"]',
    'input[aria-label="Add people to share Document with them"]',
  ];

  let input = null;

  for (const selector of inputSelectors) {
    const locator = page.locator(selector).first();

    if (
      await locator
        .waitFor({ state: 'visible', timeout: 5000 })
        .then(() => true)
        .catch(() => false)
    ) {
      input = locator;
      break;
    }
  }

  if (!input) {
    throw new Error(
      'Adobe Share dialog opened, but the invite email field was not found.'
    );
  }

  for (const email of recipients) {
    await input.click();
    await input.fill(email);
    await page.keyboard.press('Enter');

    // Wait briefly for Adobe to convert the typed address into a recipient tag.
    await page.waitForTimeout(150);
  }
}

async function submitShare(page: any): Promise<void> {
  const inviteButton = page.locator(
    'button[data-test-id="inviteBtn"], button[aria-label="Share Document with Others"]'
  ).first();

  const foundInvite = await inviteButton
    .waitFor({ state: 'visible', timeout: 30000 })
    .then(() => true)
    .catch(() => false);

  if (!foundInvite) {
    throw new Error(
      'Recipient emails were entered, but Adobe Invite button was not found.'
    );
  }

  await page.waitForFunction(
    () => {
      const button =
        document.querySelector('button[data-test-id="inviteBtn"]') ||
        document.querySelector(
          'button[aria-label="Share Document with Others"]'
        );

      return Boolean(button && !(button as HTMLButtonElement).disabled);
    },
    { timeout: 30000 }
  );

  await inviteButton.click();

  // Wait for Adobe's dialog to close or success state to appear.
  await Promise.race([
    inviteButton
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => undefined),
    page.waitForTimeout(2500),
  ]);

  const body = await page.locator('body').innerText().catch(() => '');

  if (
    /something went wrong|failed|unable to share|error occurred/i.test(body)
  ) {
    throw new Error(
      'Adobe displayed an error after submitting the share.'
    );
  }
}

export async function POST(request: NextRequest) {
  const store = getAdobeBrowserStore();
  const session = store.session;

  if (!session || session.page.isClosed()) {
    return NextResponse.json(
      { success: false, error: 'Adobe is not connected. Open Adobe in Dolphin first.' },
      { status: 409 }
    );
  }

  let tempDir = '';

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const recipientsRaw = formData.get('recipients');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'A PDF file is required.' },
        { status: 400 }
      );
    }

    const recipients = normalizeEmails(
      JSON.parse(String(recipientsRaw || '[]'))
    );

    if (!recipients.length) {
      return NextResponse.json(
        { success: false, error: 'At least one valid recipient email is required.' },
        { status: 400 }
      );
    }

    const filename = file.name || 'document.pdf';

    if (
      file.type !== 'application/pdf' &&
      !filename.toLowerCase().endsWith('.pdf')
    ) {
      return NextResponse.json(
        { success: false, error: 'Adobe browser sender currently accepts PDF files only.' },
        { status: 400 }
      );
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), '3d-suite-adobe-'));
    const safeName = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    const filePath = path.join(tempDir, safeName);

    await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));

    const page = session.page;
    await page.bringToFront().catch(() => undefined);

    if (!/acrobat\.adobe\.com|documentcloud\.adobe\.com/i.test(page.url())) {
      await page.goto('https://acrobat.adobe.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 90000,
      });
    }

    const uploadMethod = await attachPdf(page, filePath, safeName);
    await waitForUploadedFile(page, safeName);
    await openShareUi(page, safeName);
    await addRecipients(page, recipients);
    await submitShare(page);

    return NextResponse.json({
      success: true,
      message: `Adobe share submitted for ${recipients.length} recipient(s).`,
      recipients,
      filename: safeName,
      uploadMethod,
      currentUrl: page.url(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        currentUrl: session.page.url(),
      },
      { status: 500 }
    );
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
