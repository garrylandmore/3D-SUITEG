import { NextRequest, NextResponse } from 'next/server';

import { launchDolphinBrowser, stopDolphinProfile } from '@/lib/dolphin-browser';
import {
  clearAdobeBrowserSession,
  getAdobeBrowserStore,
} from '@/lib/adobe-browser-store';

export const dynamic = 'force-dynamic';

async function closeExistingSession(): Promise<void> {
  const store = getAdobeBrowserStore();
  const existing = store.session;
  if (!existing) return;

  try {
    await existing.browser.close();
  } catch {}

  try {
    await stopDolphinProfile(existing.profileId);
  } catch {}

  clearAdobeBrowserSession();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const profileId = Number(body.dolphinProfileId);

    if (!Number.isInteger(profileId) || profileId <= 0) {
      return NextResponse.json(
        { success: false, error: 'A valid Dolphin profile ID is required.' },
        { status: 400 }
      );
    }

    const store = getAdobeBrowserStore();

    if (
      store.session &&
      store.session.profileId === profileId &&
      !store.session.page.isClosed()
    ) {
      await store.session.page.bringToFront().catch(() => undefined);
      return NextResponse.json({
        success: true,
        connected: true,
        loggedIn: false,
        profileId: String(profileId),
        currentUrl: store.session.page.url(),
      });
    }

    await closeExistingSession();

    const { browser } = await launchDolphinBrowser(profileId);
    const context = browser.contexts()[0] || (await browser.newContext());
    const pages = context.pages();
    const page = pages.find((candidate) => !candidate.isClosed()) || (await context.newPage());

    await page.goto('https://acrobat.adobe.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    await page.bringToFront().catch(() => undefined);

    store.session = {
      profileId,
      browser,
      context,
      page,
      startedAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      connected: true,
      loggedIn: false,
      profileId: String(profileId),
      currentUrl: page.url(),
      message: 'Adobe opened in Dolphin. Log in manually in the browser.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        connected: false,
        loggedIn: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
