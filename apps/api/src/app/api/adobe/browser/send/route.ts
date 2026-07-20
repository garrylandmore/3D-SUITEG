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

function withoutPdfExtension(filename: string): string {
  return filename.replace(/\.pdf$/i, '');
}

async function currentAdobeDocumentMatches(
  page: any,
  filename: string
): Promise<boolean> {
  const baseName = withoutPdfExtension(filename);

  const modernName = page.locator(
    '[data-testid="FileNameModern"] [title], [data-testid="FileNameModern"]'
  ).first();

  if (
    await modernName
      .waitFor({ state: 'visible', timeout: 1500 })
      .then(() => true)
      .catch(() => false)
  ) {
    const title =
      (await modernName.getAttribute('title').catch(() => null)) ||
      (await modernName.innerText().catch(() => ''));

    if (
      String(title || '')
        .trim()
        .toLowerCase() === baseName.trim().toLowerCase()
    ) {
      return true;
    }
  }

  const fileButton = page.locator('button[aria-label="File name"]').first();

  if (await fileButton.isVisible().catch(() => false)) {
    const buttonText = await fileButton.innerText().catch(() => '');

    if (
      buttonText
        .replace(/\s*PDF\s*$/i, '')
        .trim()
        .toLowerCase()
        .includes(baseName.trim().toLowerCase())
    ) {
      return true;
    }
  }

  return false;
}

async function waitForUploadedFile(page: any, filename: string): Promise<void> {
  const baseName = withoutPdfExtension(filename);

  // Adobe Acrobat viewer renders the base filename here and "PDF" separately.
  const modernFileName = page.locator(
    '[data-testid="FileNameModern"] [title], [data-testid="FileNameModern"]'
  ).first();

  const modernFound = await modernFileName
    .waitFor({ state: 'visible', timeout: 60000 })
    .then(() => true)
    .catch(() => false);

  if (modernFound) {
    const title =
      (await modernFileName.getAttribute('title').catch(() => null)) ||
      (await modernFileName.innerText().catch(() => ''));

    if (
      String(title || '')
        .trim()
        .toLowerCase()
        .includes(baseName.trim().toLowerCase())
    ) {
      return;
    }
  }

  // Fallback for file cards/lists that include the full filename or base filename.
  const fullName = page.getByText(filename, { exact: false }).first();
  if (
    await fullName
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false)
  ) {
    return;
  }

  const baseNameLocator = page.getByText(baseName, { exact: false }).first();
  if (
    await baseNameLocator
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false)
  ) {
    return;
  }

  throw new Error(
    `Adobe upload did not finish in time for "${filename}". Current URL: ${page.url()}`
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

async function prepareAdobeShareDialog(page: any): Promise<void> {
  // 1) Turn off "People can add comments" if Adobe has it enabled.
  const commentToggle = page.locator(
    'input.spectrum-ToggleSwitch-input[role="switch"][aria-label^="People can add comments"]'
  ).first();

  if (
    await commentToggle
      .waitFor({ state: 'attached', timeout: 10000 })
      .then(() => true)
      .catch(() => false)
  ) {
    const checkedAttr = await commentToggle.getAttribute('aria-checked');
    const isChecked =
      checkedAttr === 'true' ||
      (await commentToggle.isChecked().catch(() => false));

    if (isChecked) {
      await commentToggle.click({ force: true });
      await page.waitForFunction(
        () => {
          const el = document.querySelector(
            'input.spectrum-ToggleSwitch-input[role="switch"][aria-label^="People can add comments"]'
          ) as HTMLInputElement | null;

          if (!el) return true;

          return (
            el.getAttribute('aria-checked') === 'false' ||
            el.checked === false
          );
        },
        { timeout: 10000 }
      ).catch(() => undefined);

      console.log('ADOBE SHARE COMMENTS TOGGLE | disabled');
    }
  }

  // 2) Adobe initially renders a placeholder input. Clicking it causes
  // the dialog to switch into the real invite-entry mode.
  const placeholderInput = page.locator(
    'input[data-testid="invite-input-field-placeholder"], input[placeholder="Add name or email to invite"]'
  ).first();

  if (
    await placeholderInput
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await placeholderInput.click({ timeout: 10000 });

    console.log(
      'ADOBE SHARE INVITE PLACEHOLDER | clicked | waiting for real invite field'
    );
  }

  // 3) Wait for Adobe to replace the placeholder with the real TagField input.
  const realInviteInput = page.locator(
    'input[data-testid="invite-input-field"], input[aria-label="Add people to share Document with them"], input[placeholder="Add names or emails to invite"]'
  ).first();

  const realReady = await realInviteInput
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  if (!realReady) {
    throw new Error(
      'Adobe Share dialog did not switch to the real invite email field.'
    );
  }

  await realInviteInput.click({ timeout: 10000 });

  console.log('ADOBE SHARE INVITE FIELD | real invite field ready');
}

async function addRecipients(page: any, recipients: string[]): Promise<void> {
  const realInputSelectors = [
    'input[data-testid="invite-input-field"]',
    'input[aria-label="Add people to share Document with them"]',
    'input[placeholder="Add names or emails to invite"]',
    'input.react-spectrum-TagField-input',
  ];

  async function resolveRealInviteInput(timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      for (const selector of realInputSelectors) {
        const locator = page.locator(selector).first();

        if (await locator.isVisible().catch(() => false)) {
          return { locator, selector };
        }
      }

      await page.waitForTimeout(50);
    }

    return null;
  }

  async function inviteButtonEnabled(): Promise<boolean> {
    const button = page.locator(
      'button[data-test-id="inviteBtn"], button[aria-label="Share Document with Others"]'
    ).first();

    return button.isEnabled().catch(() => false);
  }

  async function commitOne(email: string, index: number): Promise<void> {
    const resolved = await resolveRealInviteInput(10000);

    if (!resolved) {
      throw new Error(
        `Adobe invite field disappeared while adding ${email}.`
      );
    }

    const input = resolved.locator;

    await input.click({ timeout: 5000 });

    // Make sure the React TagField is empty before entering the next address.
    const existingValue = await input.inputValue().catch(() => '');

    if (existingValue) {
      await input.press('Control+A').catch(() => undefined);
      await input.press('Backspace').catch(() => undefined);
    }

    // insertText is significantly faster than locator.type().
    await page.keyboard.insertText(email);

    // Adobe requires Enter to commit each individual recipient.
    await page.keyboard.press('Enter');

    // Wait only until Adobe clears/replaces the input after creating the tag.
    const commitDeadline = Date.now() + 4000;
    let committed = false;

    while (Date.now() < commitDeadline) {
      const current = await resolveRealInviteInput(300);

      if (current) {
        const value = await current.locator.inputValue().catch(() => '');

        if (!value || value.toLowerCase() !== email.toLowerCase()) {
          committed = true;
          break;
        }
      }

      await page.waitForTimeout(50);
    }

    // Some Adobe versions keep the DOM input value momentarily even though
    // the recipient chip has already been created. If Invite is enabled,
    // allow the flow to continue instead of waiting unnecessarily.
    if (!committed && !(await inviteButtonEnabled())) {
      throw new Error(
        `Adobe did not commit recipient ${email} after pressing Enter.`
      );
    }

    console.log(
      `ADOBE RECIPIENT ENTER COMMIT | ${index + 1}/${recipients.length} | ${email}`
    );
  }

  for (let index = 0; index < recipients.length; index += 1) {
    await commitOne(recipients[index], index);
  }

  if (!(await inviteButtonEnabled())) {
    throw new Error(
      'Adobe recipient entry finished, but the Invite button is still disabled.'
    );
  }

  console.log(
    `ADOBE RECIPIENT ENTRY COMPLETE | total=${recipients.length}`
  );
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

    let uploadMethod = 'existing Adobe document';

    if (await currentAdobeDocumentMatches(page, safeName)) {
      uploadMethod =
        'current Adobe viewer already shows matching uploaded document';
    } else {
      uploadMethod = await attachPdf(page, filePath, safeName);
      await waitForUploadedFile(page, safeName);
    }

    await openShareUi(page, safeName);
    await prepareAdobeShareDialog(page);
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
