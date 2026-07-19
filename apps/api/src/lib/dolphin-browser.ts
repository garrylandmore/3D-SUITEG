import { chromium, type Browser } from 'playwright';

export type DolphinLaunchResult = {
  browser: Browser;
  profileId: number;
  endpoint: string;
};

function getLocalApiBase(): string {
  return (process.env.DOLPHIN_LOCAL_API || 'http://localhost:3001').replace(/\/$/, '');
}

export function isDolphinEnabled(): boolean {
  return (process.env.DOLPHIN_ENABLED || 'false').trim().toLowerCase() === 'true';
}

function getProfileId(): number {
  const raw = (process.env.DOLPHIN_PROFILE_ID || '').trim();
  const id = Number(raw);
  if (!raw || !Number.isInteger(id) || id <= 0) {
    throw new Error('DOLPHIN_PROFILE_ID must be set to a valid positive browser profile ID');
  }
  return id;
}

function extractEndpoint(payload: any): string | null {
  const port =
    payload?.automation?.port ??
    payload?.automationPort ??
    payload?.port;

  const rawCandidates = [
    payload?.automation?.wsEndpoint,
    payload?.automation?.ws_endpoint,
    payload?.automation?.endpoint,
    payload?.wsEndpoint,
    payload?.ws_endpoint,
    payload?.endpoint,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  for (const raw of rawCandidates) {
    const value = raw.trim();

    if (
      value.startsWith('ws://') ||
      value.startsWith('wss://') ||
      value.startsWith('http://') ||
      value.startsWith('https://')
    ) {
      return value;
    }

    if (value.startsWith('/devtools/')) {
      if (typeof port === 'number' || (typeof port === 'string' && port.trim())) {
        return `ws://127.0.0.1:${port}${value}`;
      }
    }

    if (/^\d+$/.test(value)) {
      return `http://127.0.0.1:${value}`;
    }
  }

  if (typeof port === 'number' || (typeof port === 'string' && port.trim())) {
    return `http://127.0.0.1:${port}`;
  }

  return null;
}

export async function launchDolphinBrowser(): Promise<DolphinLaunchResult> {
  const profileId = getProfileId();
  const base = getLocalApiBase();
  const url = `${base}/v1.0/browser_profiles/${profileId}/start`;

  console.log(`DOLPHIN | starting profile ${profileId} via ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      automation: true,
      headless: false,
      noTabs: true,
    }),
  });

  const raw = await response.text();
  let payload: any = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }

  if (!response.ok) {
    throw new Error(
      `Dolphin profile start failed: HTTP ${response.status} ${raw || response.statusText}`
    );
  }

  console.log(
    `DOLPHIN | raw automation response=${JSON.stringify(payload?.automation ?? payload)}`
  );

  const endpoint = extractEndpoint(payload);
  if (!endpoint) {
    throw new Error(
      `Dolphin started profile ${profileId} but did not return an automation endpoint: ${raw}`
    );
  }

  console.log(`DOLPHIN | automation endpoint=${endpoint}`);

  const browser = await chromium.connectOverCDP(endpoint, { timeout: 60000 });
  console.log(`DOLPHIN | Playwright connected to profile ${profileId}`);

  return { browser, profileId, endpoint };
}

export async function stopDolphinProfile(profileId: number): Promise<void> {
  const base = getLocalApiBase();
  const url = `${base}/v1.0/browser_profiles/${profileId}/stop`;

  try {
    const response = await fetch(url, { method: 'GET' });
    const text = await response.text();
    console.log(`DOLPHIN | stop profile ${profileId} | HTTP ${response.status} | ${text}`);
  } catch (error) {
    console.error(
      `DOLPHIN | failed to stop profile ${profileId} |`,
      error instanceof Error ? error.message : String(error)
    );
  }
}
