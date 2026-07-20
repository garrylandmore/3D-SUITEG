import type { Browser, BrowserContext, Page } from 'playwright';

export type AdobeBrowserSession = {
  profileId: number;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  startedAt: string;
};

type AdobeBrowserStore = {
  session: AdobeBrowserSession | null;
};

declare global {
  var __threeDSuiteAdobeBrowserStore: AdobeBrowserStore | undefined;
}

export function getAdobeBrowserStore(): AdobeBrowserStore {
  if (!globalThis.__threeDSuiteAdobeBrowserStore) {
    globalThis.__threeDSuiteAdobeBrowserStore = { session: null };
  }
  return globalThis.__threeDSuiteAdobeBrowserStore;
}

export function clearAdobeBrowserSession(): void {
  getAdobeBrowserStore().session = null;
}
