'use client';

import React from 'react';
import {
  Activity,
  ArrowLeft,
  Copy,
  FileText,
  FolderOpen,
  Globe,
  LayoutDashboard,
  Link2,
  Mail,
  Menu,
  RefreshCw,
  Save,
  Send,
  Settings,
  Shield,
  Square,
  Upload,
  UserCog,
  Users,
  X,
  Zap,
} from 'lucide-react';

type SenderKey = 'wetransfer' | 'adobe' | 'gmail' | 'quickbooks' | 'docusign';
type LeadStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
type RunState = 'idle' | 'running' | 'stopped' | 'completed' | 'completed_with_errors' | 'failed';
type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'stopped' | 'system';
type ModalKey =
  | 'credentials'
  | 'leads'
  | 'settings'
  | 'logs'
  | 'attach-host'
  | 'rmm'
  | 'browser'
  | 'antired'
  | 'redirect-generator'
  | 'domains'
  | 'campaign-redirect'
  | 'payload'
  | 'b2b'
  | 'blast'
  | 'browser-proxy';

type Lead = {
  id: string;
  rawInput: string;
  normalized: string;
  email?: string;
  name?: string;
  status: LeadStatus;
  senderStatus: Partial<Record<SenderKey, LeadStatus>>;
  addedAt: string;
  sentAt?: string;
  failedAt?: string;
  metadata?: Record<string, string>;
};

type RuntimeLog = {
  id: string;
  timestamp: string;
  sender: SenderKey | 'system';
  level: LogLevel;
  message: string;
};

type SenderConfig = {
  connected: boolean;
  fileType: string;
  fileSource: 'upload' | 'generate';
  attachmentNameTemplate: string;
  convertHtmlToPdf: boolean;
  replaceBatchPlaceholdersInPdf: boolean;
  dolphinProfileIds: string[];
  randomizeDolphinProfiles: boolean;
  orientation: 'landscape' | 'portrait';
  design: string;
  generatedLayout: 'classic' | 'highlight';
  generatedTitle: string;
  generatedSubtitle: string;
  generatedBodyText: string;
  ctaLink: string;
  cta: 'button' | 'qr';
  useCustomMessage: boolean;
  rateLimitDelay: number;
  tempProvider: string;
  poolSize: number;
  autoRotate: boolean;
  notes: string;
};

type DashboardSettings = {
  proxy: string;
  defaultDelay: number;
  defaultFileType: string;
  defaultOrientation: 'landscape' | 'portrait';
  defaultCta: 'button' | 'qr';
  defaultTempProvider: string;
};

type BrowserProxyPanelState = {
  enabled: boolean;
  protocol: 'http' | 'socks5';
  host: string;
  port: string;
  username: string;
  /** Never loaded back from server; user must re-enter to change */
  password: string;
};

type BrowserProxyTestApiResponse = {
  success?: boolean;
  message?: string;
  diagnostics?: string;
  error?: string;
};

type BrowserProxyTestResult = {
  level: 'success' | 'error' | 'warning';
  message: string;
  diagnostics?: string;
};

type CloudflareRedirectConfig = {
  accountId: string;
  apiToken: string;
  namespaceId: string;
  publicBaseUrl: string;
};

type CloudflareRedirectItem = {
  alias: string;
  destination: string;
  statusCode: 301 | 302 | 307 | 308;
  createdAt?: string;
  updatedAt?: string;
  redirectUrl: string;
};


type CredentialsState = {
  wetransfer: {
    provider: 'mailslurp' | 'tempmailio';
    account: string;
    proxy: string;
    mailSlurpApiKey: string;
    tempMailIoApiKey: string;
  };
  adobe: { tenant: string };
  quickbooks: { companyId: string; environment: string };
  docusign: { accountId: string; integrationKey: string };
};

type AdobeConnectionStatus = {
  connected: boolean;
  loggedIn?: boolean;
  profileId?: string | null;
  currentUrl?: string | null;
  lastCheckedAt?: string | null;
  error?: string | null;
};

type Toast = { id: string; message: string; level: LogLevel };

type WeTransferStepStatus =
  | 'pending'
  | 'running'
  | 'opening_browser'
  | 'loading_wetransfer'
  | 'awaiting_sender_verification'
  | 'waiting_for_verification'
  | 'verification_received'
  | 'preparing_attachment'
  | 'upload_started'
  | 'upload_completed'
  | 'send_submitted'
  | 'send_confirmed'
  | 'success'
  | 'failed'
  | 'stopped';

type WeTransferStep = {
  id: string;
  label: string;
  status: WeTransferStepStatus;
  detail?: string;
  timestamp?: string;
  isReal: boolean;
};

type WeTransferSessionState = {
  sessionId: string | null;
  status:
    | 'idle'
    | 'initializing'
    | 'ready'
    | 'sending'
    | 'stopped'
    | 'completed'
    | 'completed_with_errors'
    | 'failed';
  mailbox: string | null;
  mailboxMessageCount: number | null;
  latestError: string | null;
  attachment: WeTransferAttachmentDebug | null;
  steps: WeTransferStep[];
};

type WeTransferAttachmentDebug = {
  name: string | null;
  source: 'uploaded' | 'generated';
  mimeType: string | null;
  sizeBytes: number | null;
  readiness: 'ready' | 'missing';
  detail: string;
};

type WeTransferSessionApiResponse = {
  sessionId?: string;
  status?: WeTransferSessionState['status'];
  mailbox?: { email?: string | null } | null;
  mailboxMessageCount?: number | null;
  latestError?: string | null;
  steps?: WeTransferStep[];
  logs?: string[];
  error?: string;
};

type WeTransferSendLeadApiResponse = {
  success?: boolean;
  confirmationStatus?: 'confirmed' | 'failed';
  detail?: string | null;
  error?: string;
  transferUrl?: string | null;
  logs?: string[];
  steps?: WeTransferStep[];
  mailboxUsed?: string | null;
  mailboxMessageCount?: number | null;
  latestError?: string | null;
  attachment?: {
    name: string;
    source: 'uploaded' | 'generated';
    mimeType: string | null;
    sizeBytes: number;
    ready: boolean;
  } | null;
};

const SENDER_KEYS: SenderKey[] = ['wetransfer', 'adobe', 'gmail', 'quickbooks', 'docusign'];

const SENDERS: Array<{ key: SenderKey; label: string }> = [
  { key: 'wetransfer', label: 'WeTransfer' },
  { key: 'adobe', label: 'Adobe Acrobat' },
  { key: 'gmail', label: 'Gmail' },
  { key: 'quickbooks', label: 'QuickBooks' },
  { key: 'docusign', label: 'DocuSign' },
];

const SIDEBAR_ITEMS: Array<{ id: 'crm-sender' | ModalKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'credentials', label: 'Credentials', icon: UserCog },
  { id: 'leads', label: 'Leads Management', icon: Users },
  { id: 'attach-host', label: 'Attach / Host', icon: FolderOpen },
  { id: 'rmm', label: '3D RMM', icon: LayoutDashboard },
  { id: 'browser', label: '3D Browser', icon: Globe },
  { id: 'crm-sender', label: 'CRM Sender', icon: Send },
  { id: 'antired', label: 'AntiRed + Landing', icon: Shield },
  { id: 'redirect-generator', label: 'Redirect Generator', icon: Link2 },
  { id: 'domains', label: 'Domains', icon: Globe },
  { id: 'campaign-redirect', label: 'Campaign Redirect', icon: RefreshCw },
  { id: 'payload', label: 'Payload', icon: FileText },
  { id: 'b2b', label: 'B2B Sender', icon: Mail },
  { id: 'blast', label: '3D Blast', icon: Zap },
  { id: 'browser-proxy', label: 'Browser Proxy', icon: Globe },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'logs', label: 'Logs', icon: Activity },
];

function nowIso() {
  return new Date().toISOString();
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString();
}

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatBytes(value: number | null | undefined) {
  if (!value || value <= 0) return 'unknown';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function getWeTransferAttachmentDebug(
  config: SenderConfig,
  uploadFile: File | null
): WeTransferAttachmentDebug {
  const ctaLink = safeTrim(config.ctaLink);
  if (config.fileSource === 'upload') {
    if (!uploadFile) {
      return {
        name: null,
        source: 'uploaded',
        mimeType: null,
        sizeBytes: null,
        readiness: 'missing',
        detail: 'Upload attachment mode is selected but no file is attached. Choose an attachment before sending.',
      };
    }

    return {
      name: uploadFile.name || null,
      source: 'uploaded',
      mimeType: uploadFile.type || null,
      sizeBytes: uploadFile.size || null,
      readiness: uploadFile.size > 0 ? 'ready' : 'missing',
      detail:
        uploadFile.size > 0
          ? 'Selected attachment is ready and will be uploaded to WeTransfer for each lead.'
          : 'Uploaded file is empty and cannot be sent.',
    };
  }

  return {
    name: 'per-lead-generated-proposal.pdf',
    source: 'generated',
    mimeType: 'application/pdf',
    sizeBytes: null,
    readiness: 'ready',
    detail: ctaLink
      ? 'PDF will be generated per lead at send time.'
      : 'PDF will be generated per lead at send time. CTA link is currently empty.',
  };
}

async function parseApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`Empty response from API (HTTP ${response.status})`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from API (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }
}

function normalizeLead(value: string) {
  return value.trim().toLowerCase();
}

function parseLeadIdentity(raw: string): { email?: string; name?: string } {
  const line = raw.trim();
  if (!line) return {};

  const angleMatch = line.match(/^"?([^"<]+?)"?\s*<\s*([^\s<>]+@[^\s<>]+)\s*>$/);
  if (angleMatch) {
    return {
      name: angleMatch[1].trim() || undefined,
      email: angleMatch[2].trim().toLowerCase(),
    };
  }

  const csvParts = line.split(/[,\t;|]/).map((part) => part.trim()).filter(Boolean);
  if (csvParts.length >= 2) {
    const firstIsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(csvParts[0]);
    const secondIsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(csvParts[1]);
    if (firstIsEmail) {
      return { email: csvParts[0].toLowerCase(), name: csvParts[1] || undefined };
    }
    if (secondIsEmail) {
      return { email: csvParts[1].toLowerCase(), name: csvParts[0] || undefined };
    }
  }

  const plainEmailMatch = line.match(/[^\s@<>,;|]+@[^\s@<>,;|]+\.[^\s@<>,;|]+/);
  if (plainEmailMatch) {
    return { email: plainEmailMatch[0].toLowerCase() };
  }

  return {};
}

function parseLeadLines(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function dedupeLeads(existing: Lead[], values: string[]) {
  const known = new Set(existing.map((lead) => lead.normalized));
  const added: Lead[] = [];

  values.forEach((raw) => {
    const identity = parseLeadIdentity(raw);
    const normalized = normalizeLead(identity.email || raw);
    if (!normalized || known.has(normalized)) return;
    known.add(normalized);
    added.push({
      id: makeId('lead'),
      rawInput: raw,
      normalized,
      email: identity.email,
      name: identity.name,
      status: 'pending',
      senderStatus: {},
      addedAt: nowIso(),
    });
  });

  return added;
}

function createDefaultSenderConfig(): SenderConfig {
  return {
    connected: true,
    fileType: 'PDF',
    fileSource: 'upload',
    attachmentNameTemplate: '{OriginalFile}',
    convertHtmlToPdf: false,
    replaceBatchPlaceholdersInPdf: false,
    dolphinProfileIds: [],
    randomizeDolphinProfiles: false,
    orientation: 'landscape',
    design: 'Modern',
    generatedLayout: 'classic',
    generatedTitle: 'Business Proposal Pack',
    generatedSubtitle: 'Tender-ready document set for review',
    generatedBodyText:
      'Please review this pack and use the secure call-to-action link to continue.',
    ctaLink: '',
    cta: 'button',
    useCustomMessage: true,
    rateLimitDelay: 2,
    tempProvider: 'TempMail',
    poolSize: 20,
    autoRotate: true,
    notes: '',
  };
}

function createDefaultSenderConfigs(): Record<SenderKey, SenderConfig> {
  return {
    wetransfer: createDefaultSenderConfig(),
    adobe: createDefaultSenderConfig(),
    gmail: createDefaultSenderConfig(),
    quickbooks: createDefaultSenderConfig(),
    docusign: createDefaultSenderConfig(),
  };
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function safeTrim(value: unknown): string {
  return normalizeString(value).trim();
}

function isSenderKey(value: unknown): value is SenderKey {
  return typeof value === 'string' && SENDER_KEYS.includes(value as SenderKey);
}

function normalizeSenderConfig(value: unknown): SenderConfig {
  const defaults = createDefaultSenderConfig();
  if (!value || typeof value !== 'object') return defaults;
  const config = value as Partial<SenderConfig>;

  return {
    ...defaults,
    connected: typeof config.connected === 'boolean' ? config.connected : defaults.connected,
    fileType: normalizeString(config.fileType, defaults.fileType),
    fileSource: config.fileSource === 'generate' ? 'generate' : 'upload',
    attachmentNameTemplate: normalizeString(config.attachmentNameTemplate, defaults.attachmentNameTemplate),
    convertHtmlToPdf: Boolean(config.convertHtmlToPdf),
    replaceBatchPlaceholdersInPdf: Boolean(config.replaceBatchPlaceholdersInPdf),
    dolphinProfileIds: Array.isArray(config.dolphinProfileIds)
      ? config.dolphinProfileIds.map((item) => String(item).trim()).filter(Boolean)
      : defaults.dolphinProfileIds,
    randomizeDolphinProfiles: Boolean(config.randomizeDolphinProfiles),
    orientation: config.orientation === 'portrait' ? 'portrait' : 'landscape',
    design: normalizeString(config.design, defaults.design),
    generatedLayout: config.generatedLayout === 'highlight' ? 'highlight' : 'classic',
    generatedTitle: normalizeString(config.generatedTitle, defaults.generatedTitle),
    generatedSubtitle: normalizeString(config.generatedSubtitle, defaults.generatedSubtitle),
    generatedBodyText: normalizeString(config.generatedBodyText, defaults.generatedBodyText),
    ctaLink: normalizeString(config.ctaLink),
    cta: config.cta === 'qr' ? 'qr' : 'button',
    useCustomMessage:
      typeof config.useCustomMessage === 'boolean' ? config.useCustomMessage : defaults.useCustomMessage,
    rateLimitDelay:
      typeof config.rateLimitDelay === 'number' && Number.isFinite(config.rateLimitDelay)
        ? config.rateLimitDelay
        : defaults.rateLimitDelay,
    tempProvider: normalizeString(config.tempProvider, defaults.tempProvider),
    poolSize: typeof config.poolSize === 'number' && Number.isFinite(config.poolSize) ? config.poolSize : defaults.poolSize,
    autoRotate: typeof config.autoRotate === 'boolean' ? config.autoRotate : defaults.autoRotate,
    notes: normalizeString(config.notes),
  };
}

function normalizeSenderConfigs(value: unknown): Record<SenderKey, SenderConfig> {
  const defaults = createDefaultSenderConfigs();
  if (!value || typeof value !== 'object') return defaults;
  const parsed = value as Partial<Record<SenderKey, unknown>>;

  return {
    wetransfer: normalizeSenderConfig(parsed.wetransfer),
    adobe: normalizeSenderConfig(parsed.adobe),
    quickbooks: normalizeSenderConfig(parsed.quickbooks),
    docusign: normalizeSenderConfig(parsed.docusign),
  };
}

function normalizeBrowserProxyPanelState(value: unknown): BrowserProxyPanelState {
  const defaults: BrowserProxyPanelState = {
    enabled: false,
    protocol: 'http',
    host: '',
    port: '8080',
    username: '',
    password: '',
  };
  if (!value || typeof value !== 'object') return defaults;
  const config = value as Partial<BrowserProxyPanelState>;
  return {
    ...defaults,
    enabled: Boolean(config.enabled),
    protocol: config.protocol === 'socks5' ? 'socks5' : 'http',
    host: normalizeString(config.host),
    port: normalizeString(config.port, defaults.port),
    username: normalizeString(config.username),
    password: '',
  };
}

const LOCAL_STORAGE_KEY = 'crm-console-session-v2';


const TEMP_MAIL_SESSION_KEYS = {
  mailslurp: '3d-suite-temp-mail-key-mailslurp',
  tempmailio: '3d-suite-temp-mail-key-tempmailio',
} as const;

function getSelectedTempMailApiKey(
  credentials: CredentialsState['wetransfer']
): string {
  return credentials.provider === 'tempmailio'
    ? credentials.tempMailIoApiKey
    : credentials.mailSlurpApiKey;
}

function getTempMailProviderLabel(
  provider: CredentialsState['wetransfer']['provider']
): string {
  return provider === 'tempmailio' ? 'Temp-Mail.io' : 'MailSlurp';
}


const CLOUDFLARE_REDIRECT_SESSION_KEY = '3d-suite-cloudflare-redirect-config';

function normalizeCloudflarePublicBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function createRandomRedirectAlias(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let index = 0; index < 8; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [campaignName, setCampaignName] = React.useState('Q3 Operations Campaign');
  const [activeSender, setActiveSender] = React.useState<SenderKey>('wetransfer');
  const [runState, setRunState] = React.useState<RunState>('idle');
  const [activeModal, setActiveModal] = React.useState<ModalKey | null>(null);
  const [showStopConfirm, setShowStopConfirm] = React.useState(false);
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [isPreparing, setIsPreparing] = React.useState(false);
  const [wetransferUploadFile, setWetransferUploadFile] = React.useState<File | null>(null);
  const [newDolphinProfileId, setNewDolphinProfileId] = React.useState('');

  const [cloudflareRedirectConfig, setCloudflareRedirectConfig] =
    React.useState<CloudflareRedirectConfig>({
      accountId: '',
      apiToken: '',
      namespaceId: '',
      publicBaseUrl: '',
    });
  const [redirectDestination, setRedirectDestination] = React.useState('');
  const [redirectAlias, setRedirectAlias] = React.useState('');
  const [redirectStatusCode, setRedirectStatusCode] =
    React.useState<301 | 302 | 307 | 308>(302);
  const [redirectItems, setRedirectItems] = React.useState<CloudflareRedirectItem[]>([]);
  const [redirectBusy, setRedirectBusy] = React.useState(false);
  const [redirectEditingAlias, setRedirectEditingAlias] = React.useState<string | null>(null);
  const [redirectError, setRedirectError] = React.useState<string | null>(null);

  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [logs, setLogs] = React.useState<RuntimeLog[]>([]);
  const [leadsInput, setLeadsInput] = React.useState('');
  const [dedupeEnabled, setDedupeEnabled] = React.useState(true);
  const [moduleNotes, setModuleNotes] = React.useState<Record<string, string>>({});

  const [settingsState, setSettingsState] = React.useState<DashboardSettings>({
    proxy: '',
    defaultDelay: 2,
    defaultFileType: 'PDF',
    defaultOrientation: 'landscape',
    defaultCta: 'button',
    defaultTempProvider: 'TempMail',
  });

  const [browserProxy, setBrowserProxy] = React.useState<BrowserProxyPanelState>({
    enabled: false,
    protocol: 'http',
    host: '',
    port: '8080',
    username: '',
    password: '',
  });
  const [browserProxyError, setBrowserProxyError] = React.useState<string | null>(null);
  const [browserProxySaving, setBrowserProxySaving] = React.useState(false);
  const [browserProxyTesting, setBrowserProxyTesting] = React.useState(false);
  const [browserProxyHasPassword, setBrowserProxyHasPassword] = React.useState(false);
  const [browserProxyTestResult, setBrowserProxyTestResult] = React.useState<BrowserProxyTestResult | null>(null);

  const [credentials, setCredentials] = React.useState<CredentialsState>({
    wetransfer: {
      provider: 'mailslurp',
      account: '',
      proxy: '',
      mailSlurpApiKey: '',
      tempMailIoApiKey: '',
    },
    adobe: { tenant: '' },
    quickbooks: { companyId: '', environment: 'sandbox' },
    docusign: { accountId: '', integrationKey: '' },
  });

  const [senderConfigs, setSenderConfigs] = React.useState<Record<SenderKey, SenderConfig>>(
    createDefaultSenderConfigs
  );


  React.useEffect(() => {
    try {
      const mailSlurpApiKey =
        window.sessionStorage.getItem(TEMP_MAIL_SESSION_KEYS.mailslurp) || '';
      const tempMailIoApiKey =
        window.sessionStorage.getItem(TEMP_MAIL_SESSION_KEYS.tempmailio) || '';

      setCredentials((prev) => ({
        ...prev,
        wetransfer: {
          ...prev.wetransfer,
          mailSlurpApiKey,
          tempMailIoApiKey,
        },
      }));
    } catch {
      // Ignore sessionStorage errors.
    }
  }, []);


  React.useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(CLOUDFLARE_REDIRECT_SESSION_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved) as Partial<CloudflareRedirectConfig>;
      setCloudflareRedirectConfig({
        accountId: String(parsed.accountId || ''),
        apiToken: String(parsed.apiToken || ''),
        namespaceId: String(parsed.namespaceId || ''),
        publicBaseUrl: String(parsed.publicBaseUrl || ''),
      });
    } catch {
      // Ignore malformed/unavailable session storage.
    }
  }, []);

  const stopRequestedRef = React.useRef(false);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const leadsRef = React.useRef<Lead[]>([]);
  const senderConfigsRef = React.useRef(senderConfigs);
  const wtCampaignId = React.useRef<string>(`dashboard_${Date.now()}`);

  const [weTransferSession, setWeTransferSession] = React.useState<WeTransferSessionState>({
    sessionId: null,
    status: 'idle',
    mailbox: null,
    mailboxMessageCount: null,
    latestError: null,
    attachment: null,
    steps: [],
  });

  const [adobeConnection, setAdobeConnection] =
    React.useState<AdobeConnectionStatus>({ connected: false });
  const [adobeConnecting, setAdobeConnecting] = React.useState(false);

  const wetransferAttachment = React.useMemo(
    () => getWeTransferAttachmentDebug(senderConfigs.wetransfer, wetransferUploadFile),
    [senderConfigs.wetransfer, wetransferUploadFile]
  );

  const updateLeads = React.useCallback(
    (updater: Lead[] | ((prev: Lead[]) => Lead[])) => {
      setLeads((prev) => {
        const next = typeof updater === 'function' ? (updater as (prev: Lead[]) => Lead[])(prev) : updater;
        leadsRef.current = next;
        return next;
      });
    },
    []
  );

  const addToast = React.useCallback((message: string, level: LogLevel = 'info') => {
    const id = makeId('toast');
    setToasts((prev) => [...prev, { id, message, level }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 2200);
  }, []);

  const appendLog = React.useCallback(
    (level: LogLevel, message: string, sender: SenderKey | 'system' = 'system') => {
      setLogs((prev) => [
        ...prev,
        {
          id: makeId('log'),
          timestamp: nowIso(),
          sender,
          level,
          message,
        },
      ]);
    },
    []
  );

  React.useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed.campaignName) setCampaignName(parsed.campaignName);
      if (isSenderKey(parsed.activeSender)) setActiveSender(parsed.activeSender);
      if (Array.isArray(parsed.leads)) {
        leadsRef.current = parsed.leads;
        setLeads(parsed.leads);
      }
      if (Array.isArray(parsed.logs)) setLogs(parsed.logs);
      if (parsed.settingsState) setSettingsState(parsed.settingsState);
      setSenderConfigs(normalizeSenderConfigs(parsed.senderConfigs));
      if (parsed.browserProxy) setBrowserProxy(normalizeBrowserProxyPanelState(parsed.browserProxy));
      if (parsed.credentials) setCredentials(parsed.credentials);
      if (parsed.moduleNotes) setModuleNotes(parsed.moduleNotes);
      appendLog('system', 'Restored local session cache', 'system');
    } catch {
      appendLog('warning', 'Could not restore local session cache', 'system');
    }
  }, [appendLog]);

  // Load browser proxy settings from server on mount
  React.useEffect(() => {
    fetch('/api/browser-proxy')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && typeof data === 'object') {
          setBrowserProxy((prev) => ({
            ...prev,
            enabled: Boolean(data.enabled),
            protocol: data.protocol === 'socks5' ? 'socks5' : 'http',
            host: String(data.host ?? ''),
            port: String(data.port ?? '8080'),
            username: String(data.username ?? ''),
            // password is never loaded back from server
            password: '',
          }));
          setBrowserProxyHasPassword(Boolean(data.hasPassword));
        }
      })
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  React.useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);

  React.useEffect(() => {
    senderConfigsRef.current = senderConfigs;
  }, [senderConfigs]);

  const totalUploaded = leads.length;
  const totalSent = leads.filter((lead) => lead.status === 'sent').length;
  const totalFailed = leads.filter((lead) => lead.status === 'failed').length;
  const totalRemaining = leads.filter((lead) => lead.status === 'pending' || lead.status === 'sending').length;
  const successRate = totalUploaded ? Math.round((totalSent / totalUploaded) * 100) : 0;

  const saveSession = React.useCallback(() => {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        campaignName,
        activeSender,
        leads,
        logs,
        settingsState,
        senderConfigs,
        browserProxy: { ...browserProxy, password: '' },
        credentials,
        moduleNotes,
      })
    );
    appendLog('success', 'Campaign saved to local session storage', 'system');
    addToast('Session saved', 'success');
  }, [campaignName, activeSender, leads, logs, settingsState, senderConfigs, browserProxy, credentials, moduleNotes, appendLog, addToast]);

  function openModule(item: 'crm-sender' | ModalKey) {
    if (item === 'crm-sender') {
      setActiveModal(null);
      return;
    }
    setActiveModal(item);
  }

  function syncStoredLogs(nextLogs: RuntimeLog[]) {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Record<string, unknown>;
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({
          ...parsed,
          logs: nextLogs,
        })
      );
    } catch {
      // Ignore local cache write failures while clearing logs.
    }
  }

  function clearVisibleLogs() {
    setLogs([]);
    syncStoredLogs([]);
    addToast('Logs cleared', 'success');
  }

  async function saveBrowserProxySettings() {
    setBrowserProxyError(null);
    setBrowserProxyTestResult(null);
    const portNum = parseInt(browserProxy.port, 10);
    if (browserProxy.enabled) {
      if (!browserProxy.host.trim()) {
        setBrowserProxyError('Host is required when proxy is enabled.');
        return;
      }
      if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
        setBrowserProxyError('Port must be a number between 1 and 65535.');
        return;
      }
    }
    setBrowserProxySaving(true);
    try {
      const body: Record<string, unknown> = {
        enabled: browserProxy.enabled,
        protocol: browserProxy.protocol,
        host: browserProxy.host.trim(),
        port: portNum || 8080,
        username: browserProxy.username.trim(),
      };
      if (browserProxy.password !== '' || !browserProxyHasPassword) {
        body.password = browserProxy.password;
      }
      const res = await fetch('/api/browser-proxy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        setBrowserProxyError(String(data.error ?? 'Failed to save proxy settings'));
      } else {
        setBrowserProxyHasPassword(Boolean(data.hasPassword));
        setBrowserProxy((p) => ({ ...p, password: '' }));
        appendLog(
          'success',
          browserProxy.enabled
            ? `Browser proxy enabled: ${browserProxy.protocol}://${browserProxy.host.trim()}:${portNum}`
            : 'Browser proxy disabled',
          'system'
        );
        addToast('Proxy settings saved', 'success');
      }
    } catch {
      setBrowserProxyError('Network error — could not save proxy settings');
    } finally {
      setBrowserProxySaving(false);
    }
  }

  async function testBrowserProxy() {
    setBrowserProxyError(null);
    setBrowserProxyTestResult(null);

    if (!browserProxy.enabled) {
      const message = 'Enable the browser proxy before testing it.';
      setBrowserProxyTestResult({ level: 'warning', message });
      addToast(message, 'warning');
      return;
    }

    const portNum = parseInt(browserProxy.port, 10);
    if (!browserProxy.host.trim()) {
      setBrowserProxyError('Host is required when proxy is enabled.');
      return;
    }
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
      setBrowserProxyError('Port must be a number between 1 and 65535.');
      return;
    }

    setBrowserProxyTesting(true);
    try {
      const body: Record<string, unknown> = {
        enabled: browserProxy.enabled,
        protocol: browserProxy.protocol,
        host: browserProxy.host.trim(),
        port: portNum,
        username: browserProxy.username.trim(),
      };
      if (browserProxy.password !== '' || !browserProxyHasPassword) {
        body.password = browserProxy.password;
      }

      const res = await fetch('/api/browser-proxy/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await parseApiJson<BrowserProxyTestApiResponse>(res);
      const success = Boolean(res.ok && data.success);
      const message =
        data.message ||
        data.error ||
        (success ? 'Proxy test succeeded.' : 'Proxy test failed.');

      setBrowserProxyTestResult({
        level: success ? 'success' : 'error',
        message,
        diagnostics: data.diagnostics,
      });
      addToast(message, success ? 'success' : 'error');
      appendLog(
        success ? 'success' : 'error',
        success
          ? `Proxy test passed: ${browserProxy.protocol}://${browserProxy.host.trim()}:${portNum}`
          : `Proxy test failed: ${message}`,
        'system'
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Proxy test failed unexpectedly';
      setBrowserProxyTestResult({ level: 'error', message });
      addToast(message, 'error');
      appendLog('error', `Proxy test failed: ${message}`, 'system');
    } finally {
      setBrowserProxyTesting(false);
    }
  }

  function importLeadLines(lines: string[]) {
    const toImport = dedupeEnabled ? dedupeLeads(leads, lines) : lines.map((raw) => {
      const identity = parseLeadIdentity(raw);
      return {
        id: makeId('lead'),
        rawInput: raw,
        normalized: normalizeLead(identity.email || raw),
        email: identity.email,
        name: identity.name,
        status: 'pending' as LeadStatus,
        senderStatus: {},
        addedAt: nowIso(),
      };
    }).filter((lead) => Boolean(lead.normalized));

    if (!toImport.length) {
      addToast('No new leads imported', 'warning');
      appendLog('warning', 'Leads import skipped (no unique lines)', 'system');
      return;
    }

    updateLeads((prev) => [...prev, ...toImport]);
    const withEmail = toImport.filter((lead) => Boolean(lead.email)).length;
    const withName = toImport.filter((lead) => Boolean(lead.name)).length;
    appendLog(
      'success',
      `Leads imported: ${toImport.length} (autograb email: ${withEmail}, name: ${withName})`,
      'system'
    );
    addToast(`Imported ${toImport.length} lead(s)`, 'success');
  }

  async function handleLeadFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    importLeadLines(parseLeadLines(text));
    appendLog('info', `File uploaded: ${file.name}`, 'system');
    event.target.value = '';
  }

  function clearAllLeads() {
    updateLeads([]);
    appendLog('warning', 'Lead pool cleared', 'system');
    addToast('Lead pool cleared', 'warning');
  }

  function finalizeRun(sender: SenderKey) {
    const statuses = leadsRef.current
      .map((lead) => lead.senderStatus[sender])
      .filter(Boolean) as LeadStatus[];
    const sentCount = statuses.filter((status) => status === 'sent').length;
    const failedCount = statuses.filter((status) => status === 'failed').length;
    const skippedCount = statuses.filter((status) => status === 'skipped').length;

    let nextState: RunState = 'completed';
    let level: LogLevel = 'success';
    let message = `Send completed for ${sender} (${sentCount} confirmed)`;

    if (failedCount > 0 && sentCount === 0 && skippedCount === 0) {
      nextState = 'failed';
      level = 'error';
      message = `Send failed for ${sender} (${failedCount} failed, 0 confirmed)`;
    } else if (failedCount > 0 || skippedCount > 0) {
      nextState = 'completed_with_errors';
      level = failedCount > 0 ? 'error' : 'warning';
      message =
        `Send completed with issues for ${sender} ` +
        `(confirmed: ${sentCount}, failed: ${failedCount}, unconfirmed: ${skippedCount})`;
    }

    setRunState(nextState);
    if (sender === 'wetransfer') {
      setWeTransferSession((prev) => ({ ...prev, status: nextState }));
    }
    appendLog(level, message, sender);
    addToast(nextState === 'completed' ? 'Run completed' : message, level);
  }

  function processNextLead(sender: SenderKey) {
    if (stopRequestedRef.current) {
      updateLeads((prev) => prev.map((lead) => (lead.status === 'sending' ? { ...lead, status: 'pending' } : lead)));
      setRunState('stopped');
      if (sender === 'wetransfer') {
        setWeTransferSession((prev) => ({ ...prev, status: 'stopped' }));
      }
      appendLog('stopped', `Send stopped for ${sender}`, sender);
      addToast('Send stopped', 'stopped');
      return;
    }

    const pendingLeadsForSender = leadsRef.current.filter(
      (lead) => lead.status === 'pending' && lead.senderStatus[sender] !== 'sent'
    );

    if (!pendingLeadsForSender.length) {
      finalizeRun(sender);
      return;
    }

    const nextLead = pendingLeadsForSender[0];

    if (sender === 'wetransfer') {
      const campaignId = wtCampaignId.current;
      const wtConfig = normalizeSenderConfig(senderConfigsRef.current.wetransfer);

      // Batch up to 10 recipients into a single WeTransfer transfer.
      // HTML-to-PDF personalization remains one lead per transfer because one
      // shared PDF cannot contain different per-recipient placeholder values.
      const batchLimit = wtConfig.convertHtmlToPdf ? 1 : 10;
      const batchLeads = pendingLeadsForSender.slice(0, batchLimit);
      const leadEmails = batchLeads.map((lead) => lead.email || lead.normalized);
      const leadNames = batchLeads.map((lead) => lead.name || '');
      const leadEmail = leadEmails[0];
      const leadName = leadNames[0] || '';

      updateLeads((prev) =>
        prev.map((lead) =>
          batchLeads.some((batchLead) => batchLead.id === lead.id)
            ? {
                ...lead,
                status: 'sending',
                senderStatus: { ...lead.senderStatus, [sender]: 'sending' },
              }
            : lead
        )
      );

      appendLog(
        'info',
        `Preparing WeTransfer recipient batch (${leadEmails.length}/10): ${leadEmails.join(', ')}`,
        'wetransfer'
      );
      const attachment = getWeTransferAttachmentDebug(wtConfig, wetransferUploadFile);

      const configuredDolphinProfileIds = wtConfig.dolphinProfileIds.filter(Boolean);
      const selectedDolphinProfileId =
        configuredDolphinProfileIds.length === 0
          ? ''
          : wtConfig.randomizeDolphinProfiles && configuredDolphinProfileIds.length > 1
            ? configuredDolphinProfileIds[
                Math.floor(Math.random() * configuredDolphinProfileIds.length)
              ]
            : configuredDolphinProfileIds[0];

      if (selectedDolphinProfileId) {
        appendLog(
          'info',
          `Dolphin profile selected for ${leadEmail}: ${selectedDolphinProfileId}${
            wtConfig.randomizeDolphinProfiles ? ' (randomized)' : ''
          }`,
          'wetransfer'
        );
      }

      setWeTransferSession((prev) => ({
        ...prev,
        status: 'sending',
        latestError: null,
        attachment,
      }));

      // Every recipient batch gets its own fresh temp-mail mailbox and
      // therefore its own fresh WeTransfer signup/account session.
      const tempMailProvider = credentials.wetransfer.provider || 'mailslurp';
      const tempMailApiKey =
        getSelectedTempMailApiKey(credentials.wetransfer) || '';

      const prepareFreshBatchSession = fetch('/api/wetransfer/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          tempMailProvider,
          tempMailApiKey,
          forceNewMailbox: true,
        }),
      })
        .then((res) => parseApiJson<WeTransferSessionApiResponse>(res))
        .then((sessionData) => {
          if (sessionData.error || sessionData.status === 'failed') {
            throw new Error(
              sessionData.error ||
                'Failed to create fresh WeTransfer mailbox for this batch.'
            );
          }

          if (Array.isArray(sessionData.logs)) {
            sessionData.logs.forEach((line: string) =>
              appendLog('info', line, 'wetransfer')
            );
          }

          setWeTransferSession((prev) => ({
            ...prev,
            sessionId: sessionData.sessionId ?? prev.sessionId,
            status: 'sending',
            mailbox: sessionData.mailbox?.email ?? null,
            mailboxMessageCount:
              sessionData.mailboxMessageCount ?? null,
            latestError: null,
            steps:
              (sessionData.steps as WeTransferStep[]) ??
              prev.steps,
          }));

          appendLog(
            'info',
            `Fresh WeTransfer account prepared for this batch | mailbox: ${
              sessionData.mailbox?.email ?? 'unknown'
            } | recipients: ${leadEmails.length}`,
            'wetransfer'
          );

          return sessionData;
        });

      const sendPayloadPromise = prepareFreshBatchSession.then(async () => {
        if (wtConfig.fileSource === 'upload') {
          const uploadFile = wetransferUploadFile;
          if (!uploadFile) {
            throw new Error('Upload file source is selected but no file is attached.');
          }
          const formData = new FormData();
          formData.append('campaignId', campaignId);
          formData.append('leadEmail', leadEmail);
          formData.append('leadName', leadName);
          formData.append('leadEmails', JSON.stringify(leadEmails));
          formData.append('leadNames', JSON.stringify(leadNames));
          formData.append('fileSource', 'upload');
          formData.append('ctaLink', wtConfig.ctaLink);
          formData.append('tempMailApiKey', getSelectedTempMailApiKey(credentials.wetransfer) || '');
          formData.append('uploadedFileName', uploadFile.name);
          formData.append('attachmentNameTemplate', wtConfig.attachmentNameTemplate || '{OriginalFile}');
          formData.append('convertHtmlToPdf', wtConfig.convertHtmlToPdf ? 'true' : 'false');
          formData.append(
            'replaceBatchPlaceholdersInPdf',
            wtConfig.replaceBatchPlaceholdersInPdf ? 'true' : 'false'
          );
          if (selectedDolphinProfileId) {
            formData.append('dolphinProfileId', selectedDolphinProfileId);
          }
          formData.append('uploadedFileMimeType', uploadFile.type || 'application/octet-stream');
          formData.append('uploadedFile', uploadFile);
          return { body: formData };
        }

        return {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignId,
            leadEmail,
            leadName,
            leadEmails,
            leadNames,
            fileSource: 'generated' as const,
            ctaLink: wtConfig.ctaLink,
            tempMailApiKey: getSelectedTempMailApiKey(credentials.wetransfer) || '',
            generatedTitle: wtConfig.generatedTitle,
            generatedSubtitle: wtConfig.generatedSubtitle,
            generatedBodyText: wtConfig.generatedBodyText,
            generatedLayout: wtConfig.generatedLayout,
            replaceBatchPlaceholdersInPdf: wtConfig.replaceBatchPlaceholdersInPdf,
            dolphinProfileId: selectedDolphinProfileId || undefined,
          }),
        };
      });

      sendPayloadPromise
        .then((requestInit) =>
          fetch('/api/wetransfer/send-lead', {
            method: 'POST',
            ...requestInit,
          })
        )
        .then((res) => parseApiJson<WeTransferSendLeadApiResponse>(res))
        .then((data) => {
          if (stopRequestedRef.current) {
            updateLeads((prev) =>
              prev.map((lead) => (lead.status === 'sending' ? { ...lead, status: 'pending' } : lead))
            );
            setRunState('stopped');
            setWeTransferSession((prev) => ({ ...prev, status: 'stopped' }));
            appendLog('stopped', `Send stopped for ${sender}`, sender);
            addToast('Send stopped', 'stopped');
            return;
          }
          // Log backend step lines
          if (Array.isArray(data.logs)) {
            data.logs.forEach((line: string) => appendLog('info', line, 'wetransfer'));
          }
          if (Array.isArray(data.steps)) {
            setWeTransferSession((prev) => ({ ...prev, steps: data.steps ?? prev.steps }));
          }
          const failureDetail = data.detail || data.error || 'WeTransfer send failed';
          const confirmationStatus = data.confirmationStatus || (data.success ? 'confirmed' : 'failed');
          setWeTransferSession((prev) => ({
            ...prev,
            mailbox: data.mailboxUsed ?? prev.mailbox,
            mailboxMessageCount: data.mailboxMessageCount ?? prev.mailboxMessageCount,
            latestError: confirmationStatus === 'failed' ? failureDetail : data.latestError ?? null,
            attachment: data.attachment
              ? {
                  name: data.attachment.name,
                  source: data.attachment.source,
                  mimeType: data.attachment.mimeType,
                  sizeBytes: data.attachment.sizeBytes,
                  readiness: data.attachment.ready ? 'ready' : 'missing',
                  detail: data.attachment.ready
                    ? 'Attachment is ready for the WeTransfer send flow.'
                    : 'Attachment is not ready for the WeTransfer send flow.',
                }
              : prev.attachment,
          }));
          updateLeads((prev) =>
            prev.map((lead) => {
              if (!batchLeads.some((batchLead) => batchLead.id === lead.id)) return lead;
              if (confirmationStatus === 'failed') {
                return {
                  ...lead,
                  status: 'failed',
                  failedAt: nowIso(),
                  senderStatus: { ...lead.senderStatus, [sender]: 'failed' },
                };
              }
              return {
                ...lead,
                status: 'sent',
                sentAt: nowIso(),
                senderStatus: { ...lead.senderStatus, [sender]: 'sent' },
              };
            })
          );
          appendLog(
            confirmationStatus === 'confirmed' ? 'success' : 'error',
            confirmationStatus === 'confirmed'
              ? `WeTransfer confirmed batch send (${leadEmails.length} recipients): ${leadEmails.join(', ')}${data.transferUrl ? ` | ${data.transferUrl}` : ''}`
              : `WeTransfer batch failed (${leadEmails.length} recipients): ${leadEmails.join(', ')}${failureDetail ? ` — ${failureDetail}` : ''}`,
            sender
          );
          // Dolphin may return HTTP 200 from /stop slightly before the profile is
          // fully released by the local synchronizer. Give it a settling window
          // before creating the next account/batch.
          const configuredDelayMs =
            senderConfigsRef.current[sender].rateLimitDelay * 1000;
          const delayMs = Math.max(3500, configuredDelayMs);

          appendLog(
            'info',
            `Batch complete. Waiting ${Math.round(
              delayMs / 1000
            )}s for Dolphin to fully stop before preparing the next WeTransfer account.`,
            'wetransfer'
          );

          timerRef.current = setTimeout(
            () => processNextLead(sender),
            delayMs
          );
        })
        .catch((err: Error) => {
          appendLog('error', `WeTransfer browser send error: ${err.message}`, 'wetransfer');
          setWeTransferSession((prev) => ({ ...prev, latestError: err.message }));
          updateLeads((prev) =>
            prev.map((lead) =>
              batchLeads.some((batchLead) => batchLead.id === lead.id)
                ? {
                    ...lead,
                    status: 'failed',
                    failedAt: nowIso(),
                    senderStatus: { ...lead.senderStatus, [sender]: 'failed' },
                  }
                : lead
            )
          );
          const delayMs = Math.max(300, senderConfigsRef.current[sender].rateLimitDelay * 1000);
          timerRef.current = setTimeout(() => processNextLead(sender), delayMs);
        });
      return;
    }

    // Non-WeTransfer senders: local simulation
    updateLeads((prev) =>
      prev.map((lead) =>
        lead.id === nextLead.id
          ? {
              ...lead,
              status: 'sending',
              senderStatus: { ...lead.senderStatus, [sender]: 'sending' },
            }
          : lead
      )
    );

    const delayMs = Math.max(300, senderConfigsRef.current[sender].rateLimitDelay * 1000);
    timerRef.current = setTimeout(() => {
      const shouldFail = nextLead.normalized.includes('fail') || Math.random() < 0.08;
      updateLeads((prev) =>
        prev.map((lead) => {
          if (lead.id !== nextLead.id) return lead;
          if (shouldFail) {
            return {
              ...lead,
              status: 'failed',
              failedAt: nowIso(),
              senderStatus: { ...lead.senderStatus, [sender]: 'failed' },
            };
          }
          return {
            ...lead,
            status: 'sent',
            sentAt: nowIso(),
            senderStatus: { ...lead.senderStatus, [sender]: 'sent' },
          };
        })
      );

      appendLog(
        shouldFail ? 'error' : 'success',
        shouldFail
          ? `Lead failed: ${nextLead.normalized}`
          : `Lead sent: ${nextLead.normalized}`,
        sender
      );

      processNextLead(sender);
    }, delayMs);
  }


  const refreshAdobeConnection = React.useCallback(async () => {
    try {
      const response = await fetch('/api/adobe/browser/status', {
        method: 'GET',
        cache: 'no-store',
      });
      const data = await parseApiJson<AdobeConnectionStatus>(response);
      setAdobeConnection(data);
      setSenderConfigs((prev) => ({
        ...prev,
        adobe: { ...prev.adobe, connected: Boolean(data.connected && data.loggedIn) },
      }));
    } catch (error) {
      setAdobeConnection((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, []);

  React.useEffect(() => {
    void refreshAdobeConnection();
    const timer = window.setInterval(() => void refreshAdobeConnection(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshAdobeConnection]);

  async function connectAdobeInBrowser() {
    setAdobeConnecting(true);

    try {
      const response = await fetch('/api/adobe/browser/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await parseApiJson<AdobeConnectionStatus & {
        success?: boolean;
      }>(response);

      if (!response.ok || data.success === false) {
        throw new Error(
          data.error || `Adobe browser connect failed (HTTP ${response.status})`
        );
      }

      setAdobeConnection(data);
      appendLog(
        'info',
        'Adobe opened in the normal browser. Log in manually, then return to 3D Suite.',
        'adobe'
      );
      addToast('Adobe opened in browser — log in manually', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAdobeConnection((prev) => ({ ...prev, error: message }));
      appendLog('error', `Adobe browser connection failed: ${message}`, 'adobe');
      addToast(message, 'error');
    } finally {
      setAdobeConnecting(false);
    }
  }

  async function disconnectAdobe() {
    try {
      const response = await fetch('/api/adobe/browser/status', {
        method: 'DELETE',
      });
      const data = await parseApiJson<{ success?: boolean; error?: string }>(response);

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Adobe disconnect failed');
      }

      setAdobeConnection({ connected: false, loggedIn: false });
      setSenderConfigs((prev) => ({
        ...prev,
        adobe: { ...prev.adobe, connected: false },
      }));
      appendLog('info', 'Adobe browser session disconnected and closed', 'adobe');
      addToast('Adobe disconnected', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog('error', `Adobe disconnect failed: ${message}`, 'adobe');
      addToast(message, 'error');
    }
  }

  function startSend() {
    if (runState === 'running') return;
    const pendingForSender = leads.filter(
      (lead) => lead.status === 'pending' && lead.senderStatus[activeSender] !== 'sent'
    );

    if (!pendingForSender.length) {
      appendLog('warning', 'No pending leads to send. Resume skipped.', activeSender);
      addToast('No pending leads', 'warning');
      return;
    }

    if (activeSender === 'wetransfer') {
      const tempMailProvider = credentials.wetransfer.provider;
      const apiKey = safeTrim(getSelectedTempMailApiKey(credentials.wetransfer));
      const attachment = getWeTransferAttachmentDebug(
        senderConfigsRef.current.wetransfer,
        wetransferUploadFile
      );
      if (!apiKey) {
        const providerLabel = getTempMailProviderLabel(tempMailProvider);
        appendLog('error', `${providerLabel} API key is required for WeTransfer mode.`, 'wetransfer');
        addToast(`Set ${providerLabel} API key`, 'error');
        return;
      }
      if (attachment.readiness !== 'ready') {
        appendLog('error', attachment.detail, 'wetransfer');
        addToast('Attachment is not ready', 'error');
        return;
      }
      if (!safeTrim(senderConfigsRef.current.wetransfer.ctaLink)) {
        appendLog('warning', 'CTA link is empty. Generated PDFs will render a missing-link warning block.', 'wetransfer');
      }

      setIsPreparing(true);
      setWeTransferSession({
        sessionId: null,
        status: 'initializing',
        mailbox: null,
        mailboxMessageCount: null,
        latestError: null,
        attachment,
        steps: [],
      });
      appendLog('info', `Initialising WeTransfer session — creating ${getTempMailProviderLabel(tempMailProvider)} mailbox…`, 'wetransfer');
      appendLog(
        'info',
        senderConfigsRef.current.wetransfer.fileSource === 'generate'
          ? `Attachment strategy: generate a per-lead PDF in-app using parsed lead fields (${attachment.name}, ${attachment.mimeType ?? 'application/pdf'}, ${attachment.detail}).`
          : `Attachment strategy: reuse uploaded file "${attachment.name ?? 'missing'}" (${formatBytes(attachment.sizeBytes)}, ${attachment.mimeType ?? 'unknown'}) for each lead.`,
        'wetransfer'
      );
      appendLog(
        'info',
        `Attachment readiness: ${attachment.readiness} | source: ${attachment.source} | detail: ${attachment.detail}`,
        'wetransfer'
      );

      // Do not create one mailbox for the entire campaign.
      // processNextLead('wetransfer') creates a fresh mailbox/session for every
      // recipient batch (maximum 10 recipients per WeTransfer account).
      setIsPreparing(false);
      setRunState('running');
      stopRequestedRef.current = false;
      setWeTransferSession((prev) => ({
        ...prev,
        status: 'sending',
        latestError: null,
      }));

      appendLog(
        'info',
        `WeTransfer run started (${pendingForSender.length} pending). Each batch of up to 10 recipients will use a fresh temp-mail account and a fresh WeTransfer signup.`,
        'wetransfer'
      );

      processNextLead('wetransfer');
      return;
    }

    setIsPreparing(true);
    setTimeout(() => {
      setIsPreparing(false);
      setRunState('running');
      stopRequestedRef.current = false;
      appendLog('info', `Send started (${pendingForSender.length} pending)`, activeSender);
      addToast(`Started ${activeSender} run`, 'info');
      processNextLead(activeSender);
    }, 280);
  }

  function requestStop() {
    setShowStopConfirm(true);
  }

  function confirmStop() {
    stopRequestedRef.current = true;
    setShowStopConfirm(false);
  }

  const activeConfig = senderConfigs[activeSender];


  const cloudflareRedirectHeaders = React.useCallback(() => {
    return {
      'Content-Type': 'application/json',
      'x-cf-account-id': cloudflareRedirectConfig.accountId.trim(),
      'x-cf-api-token': cloudflareRedirectConfig.apiToken.trim(),
      'x-cf-kv-namespace-id': cloudflareRedirectConfig.namespaceId.trim(),
      'x-cf-public-base-url': normalizeCloudflarePublicBaseUrl(
        cloudflareRedirectConfig.publicBaseUrl
      ),
    };
  }, [cloudflareRedirectConfig]);

  const refreshCloudflareRedirects = React.useCallback(async () => {
    const { accountId, apiToken, namespaceId, publicBaseUrl } =
      cloudflareRedirectConfig;

    if (!accountId.trim() || !apiToken.trim() || !namespaceId.trim() || !publicBaseUrl.trim()) {
      setRedirectItems([]);
      return;
    }

    setRedirectBusy(true);
    setRedirectError(null);

    try {
      const response = await fetch('/api/cloudflare-redirects', {
        method: 'GET',
        headers: cloudflareRedirectHeaders(),
      });

      const data = await parseApiJson<{
        success?: boolean;
        redirects?: CloudflareRedirectItem[];
        error?: string;
      }>(response);

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Could not load redirects (HTTP ${response.status})`);
      }

      setRedirectItems(Array.isArray(data.redirects) ? data.redirects : []);
    } catch (error) {
      setRedirectError(error instanceof Error ? error.message : String(error));
    } finally {
      setRedirectBusy(false);
    }
  }, [cloudflareRedirectConfig, cloudflareRedirectHeaders]);

  const saveCloudflareRedirectConfigToSession = React.useCallback(() => {
    const normalized = {
      ...cloudflareRedirectConfig,
      publicBaseUrl: normalizeCloudflarePublicBaseUrl(
        cloudflareRedirectConfig.publicBaseUrl
      ),
    };

    window.sessionStorage.setItem(
      CLOUDFLARE_REDIRECT_SESSION_KEY,
      JSON.stringify(normalized)
    );
    setCloudflareRedirectConfig(normalized);
    addToast('Cloudflare redirect configuration saved to session', 'success');
  }, [cloudflareRedirectConfig, addToast]);

  const clearCloudflareRedirectConfig = React.useCallback(() => {
    window.sessionStorage.removeItem(CLOUDFLARE_REDIRECT_SESSION_KEY);
    setCloudflareRedirectConfig({
      accountId: '',
      apiToken: '',
      namespaceId: '',
      publicBaseUrl: '',
    });
    setRedirectItems([]);
    setRedirectError(null);
    addToast('Cloudflare redirect configuration cleared', 'success');
  }, [addToast]);

  const createOrUpdateCloudflareRedirect = React.useCallback(async () => {
    const destination = redirectDestination.trim();

    if (!destination) {
      setRedirectError('Destination URL is required.');
      return;
    }

    try {
      const parsed = new URL(destination);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Destination URL must use http or https.');
      }
    } catch {
      setRedirectError('Enter a valid http:// or https:// destination URL.');
      return;
    }

    const alias = (redirectAlias.trim() || createRandomRedirectAlias())
      .replace(/^\/+|\/+$/g, '');

    if (!/^[A-Za-z0-9_-]{1,80}$/.test(alias)) {
      setRedirectError(
        'Alias may contain only letters, numbers, hyphens, and underscores.'
      );
      return;
    }

    setRedirectBusy(true);
    setRedirectError(null);

    try {
      const method = redirectEditingAlias ? 'PUT' : 'POST';
      const response = await fetch('/api/cloudflare-redirects', {
        method,
        headers: cloudflareRedirectHeaders(),
        body: JSON.stringify({
          alias: redirectEditingAlias || alias,
          newAlias: redirectEditingAlias ? alias : undefined,
          destination,
          statusCode: redirectStatusCode,
        }),
      });

      const data = await parseApiJson<{
        success?: boolean;
        redirect?: CloudflareRedirectItem;
        error?: string;
      }>(response);

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Redirect operation failed (HTTP ${response.status})`);
      }

      setRedirectDestination('');
      setRedirectAlias('');
      setRedirectStatusCode(302);
      setRedirectEditingAlias(null);

      addToast(
        redirectEditingAlias ? 'Redirect updated' : 'Redirect created',
        'success'
      );

      await refreshCloudflareRedirects();
    } catch (error) {
      setRedirectError(error instanceof Error ? error.message : String(error));
    } finally {
      setRedirectBusy(false);
    }
  }, [
    redirectDestination,
    redirectAlias,
    redirectStatusCode,
    redirectEditingAlias,
    cloudflareRedirectHeaders,
    refreshCloudflareRedirects,
    addToast,
  ]);

  const deleteCloudflareRedirect = React.useCallback(
    async (alias: string) => {
      setRedirectBusy(true);
      setRedirectError(null);

      try {
        const response = await fetch(
          `/api/cloudflare-redirects?alias=${encodeURIComponent(alias)}`,
          {
            method: 'DELETE',
            headers: cloudflareRedirectHeaders(),
          }
        );

        const data = await parseApiJson<{ success?: boolean; error?: string }>(
          response
        );

        if (!response.ok || !data.success) {
          throw new Error(
            data.error || `Could not delete redirect (HTTP ${response.status})`
          );
        }

        addToast(`Redirect /${alias} deleted`, 'success');
        await refreshCloudflareRedirects();
      } catch (error) {
        setRedirectError(error instanceof Error ? error.message : String(error));
      } finally {
        setRedirectBusy(false);
      }
    },
    [cloudflareRedirectHeaders, refreshCloudflareRedirects, addToast]
  );


  React.useEffect(() => {
    if (activeModal === 'redirect-generator') {
      void refreshCloudflareRedirects();
    }
  }, [activeModal, refreshCloudflareRedirects]);

  return (
    <div className="min-h-screen flex bg-[#F8F9FC] text-slate-900">
      <aside
        className={`bg-[#1E1E2E] text-[#E0E0E0] ${sidebarOpen ? 'w-[260px]' : 'w-16'} transition-all duration-200 border-r border-[#2D2D44] flex flex-col`}
      >
        <div className="h-14 px-3 flex items-center justify-between border-b border-[#2D2D44]">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-7 h-7 rounded bg-[#6C63FF] text-white text-xs font-bold flex items-center justify-center">3D</div>
            {sidebarOpen && <span className="font-semibold">Campaign Console</span>}
          </div>
          <button onClick={() => setSidebarOpen((prev) => !prev)} title="Toggle sidebar">
            <Menu className="w-4 h-4 text-[#9F9FF8]" />
          </button>
        </div>

        <nav className="p-2 space-y-1 overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === 'crm-sender' && activeModal === null;
            return (
              <button
                key={item.id}
                onClick={() => openModule(item.id)}
                className="w-full text-left flex items-center gap-2 px-3 py-2 rounded transition-colors text-sm"
                style={
                  isActive
                    ? { background: '#2D2D44', borderLeft: '3px solid #6C63FF', color: '#FFFFFF' }
                    : { color: '#E0E0E0' }
                }
                title={item.label}
              >
                <Icon className="w-4 h-4 text-[#6C63FF]" />
                {sidebarOpen && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center gap-3 sticky top-0 z-20">
          <button className="p-2 rounded hover:bg-slate-100" title="Back">
            <ArrowLeft className="w-4 h-4" />
          </button>

          <input
            value={campaignName}
            onChange={(event) => setCampaignName(event.target.value)}
            className="h-9 px-3 rounded border border-slate-300 text-sm min-w-0 w-[280px]"
            placeholder="Campaign name"
          />

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={saveSession}
              className="h-9 px-3 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm flex items-center gap-2"
              title="Save session"
            >
              <Save className="w-4 h-4" /> Save
            </button>
            <button
              onClick={startSend}
              disabled={runState === 'running' || isPreparing}
              className="h-9 px-3 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm flex items-center gap-2"
              title="Start send"
            >
              <Send className="w-4 h-4" /> {isPreparing ? 'Preparing...' : 'Send'}
            </button>
            <button
              onClick={requestStop}
              disabled={runState !== 'running'}
              className="h-9 px-3 rounded bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm flex items-center gap-2"
              title="Stop send"
            >
              <Square className="w-4 h-4" /> Stop
            </button>
          </div>
        </header>

        <section className="px-4 py-3 border-b border-slate-200 bg-white">
          <div className="flex flex-wrap gap-2">
            {SENDERS.map((sender) => (
              <button
                key={sender.key}
                onClick={() => {
                  setActiveSender(sender.key);
                  appendLog('info', `Provider changed to ${sender.label}`, 'system');
                }}
                className="px-3 py-1.5 rounded text-sm border"
                style={
                  activeSender === sender.key
                    ? { background: '#6C63FF', color: '#fff', borderColor: '#6C63FF' }
                    : { background: '#fff', color: '#4B5563', borderColor: '#D1D5DB' }
                }
              >
                {sender.label}
              </button>
            ))}
            <button className="px-3 py-1.5 rounded text-sm border border-dashed border-[#6C63FF] text-[#6C63FF]">
              + Add Sender
            </button>
          </div>
        </section>

        <section className="p-4 grid md:grid-cols-6 gap-3">
          <StatCard label="Uploaded" value={totalUploaded} />
          <StatCard label="Sent" value={totalSent} tone="success" />
          <StatCard label="Remaining" value={totalRemaining} tone="warning" />
          <StatCard label="Failed" value={totalFailed} tone="danger" />
          <StatCard label="Run" value={runState} />
          <StatCard label="Success" value={`${successRate}%`} />
        </section>

        <section className="px-4 pb-4 flex-1 overflow-auto space-y-4">
          {activeSender === 'wetransfer' ? (
            <div className="space-y-4">
              <div className="grid lg:grid-cols-2 gap-4">
                <Panel title="Connection & Account">
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <Field label="Status">
                      <span className={`px-2 py-1 rounded ${activeConfig.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {activeConfig.connected ? 'Connected' : 'Disconnected'}
                      </span>
                    </Field>
                    <Field label="Temp Provider">
                      <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 text-xs font-mono">temp-mail.io</span>
                    </Field>
                    <Field label="Pool Size">
                      <input
                        type="number"
                        className="input"
                        value={activeConfig.poolSize}
                        onChange={(event) =>
                          setSenderConfigs((prev) => ({
                            ...prev,
                            wetransfer: { ...prev.wetransfer, poolSize: Number(event.target.value || 0) },
                          }))
                        }
                      />
                    </Field>
                    <Field label="Rate Delay (sec)">
                      <input
                        type="number"
                        className="input"
                        value={activeConfig.rateLimitDelay}
                        onChange={(event) =>
                          setSenderConfigs((prev) => ({
                            ...prev,
                            wetransfer: { ...prev.wetransfer, rateLimitDelay: Number(event.target.value || 1) },
                          }))
                        }
                      />
                    </Field>
                  </div>
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                    <div className="text-sm font-semibold text-slate-800">Temporary email provider</div>

                    <div className="flex flex-wrap gap-2">
                      {(['mailslurp', 'tempmailio'] as const).map((provider) => (
                        <button
                          key={provider}
                          type="button"
                          className={`px-3 py-2 rounded text-xs font-semibold border ${
                            credentials.wetransfer.provider === provider
                              ? 'bg-[#6C63FF] text-white border-[#6C63FF]'
                              : 'bg-white text-slate-700 border-slate-300'
                          }`}
                          onClick={() =>
                            setCredentials((prev) => ({
                              ...prev,
                              wetransfer: { ...prev.wetransfer, provider },
                            }))
                          }
                        >
                          {getTempMailProviderLabel(provider)}
                        </button>
                      ))}
                    </div>

                    <Field label={`${getTempMailProviderLabel(credentials.wetransfer.provider)} API Key`}>
                      <div className="space-y-2">
                        <input
                          type="password"
                          className="input w-full"
                          value={getSelectedTempMailApiKey(credentials.wetransfer)}
                          onChange={(event) =>
                            setCredentials((prev) => ({
                              ...prev,
                              wetransfer: {
                                ...prev.wetransfer,
                                ...(prev.wetransfer.provider === 'tempmailio'
                                  ? { tempMailIoApiKey: event.target.value }
                                  : { mailSlurpApiKey: event.target.value }),
                              },
                            }))
                          }
                          placeholder={`Paste ${getTempMailProviderLabel(credentials.wetransfer.provider)} API key`}
                        />

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="px-3 py-2 rounded bg-emerald-600 text-white text-xs font-semibold"
                            onClick={() => {
                              const provider = credentials.wetransfer.provider;
                              const apiKey = getSelectedTempMailApiKey(credentials.wetransfer).trim();

                              if (!apiKey) {
                                addToast('Enter an API key first', 'warning');
                                return;
                              }

                              window.sessionStorage.setItem(
                                TEMP_MAIL_SESSION_KEYS[provider],
                                apiKey
                              );
                              addToast(
                                `${getTempMailProviderLabel(provider)} API key saved for this browser session`,
                                'success'
                              );
                            }}
                          >
                            Save to session
                          </button>

                          <button
                            type="button"
                            className="px-3 py-2 rounded border border-red-300 bg-white text-red-600 text-xs font-semibold"
                            onClick={() => {
                              const provider = credentials.wetransfer.provider;
                              window.sessionStorage.removeItem(
                                TEMP_MAIL_SESSION_KEYS[provider]
                              );

                              setCredentials((prev) => ({
                                ...prev,
                                wetransfer: {
                                  ...prev.wetransfer,
                                  ...(provider === 'tempmailio'
                                    ? { tempMailIoApiKey: '' }
                                    : { mailSlurpApiKey: '' }),
                                },
                              }));

                              addToast(
                                `${getTempMailProviderLabel(provider)} API key cleared`,
                                'success'
                              );
                            }}
                          >
                            Clear
                          </button>

                          <span
                            className={`px-2 py-1 rounded text-xs flex items-center ${
                              getSelectedTempMailApiKey(credentials.wetransfer)
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {getSelectedTempMailApiKey(credentials.wetransfer)
                              ? '✓ Set'
                              : '! Required'}
                          </span>
                        </div>
                      </div>
                    </Field>
                  </div>
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Dolphin profile IDs</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Add one or more existing Dolphin browser profile IDs. The selected profile is used for the WeTransfer run.
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <input
                        className="input flex-1"
                        value={newDolphinProfileId}
                        onChange={(event) => setNewDolphinProfileId(event.target.value)}
                        placeholder="Example: 826665603"
                      />
                      <button
                        type="button"
                        className="px-3 py-2 rounded bg-[#6C63FF] text-white text-xs font-semibold"
                        onClick={() => {
                          const profileId = newDolphinProfileId.trim();
                          if (!profileId) return;

                          setSenderConfigs((prev) => {
                            const existing = prev.wetransfer.dolphinProfileIds || [];
                            if (existing.includes(profileId)) return prev;

                            return {
                              ...prev,
                              wetransfer: {
                                ...prev.wetransfer,
                                dolphinProfileIds: [...existing, profileId],
                              },
                            };
                          });

                          setNewDolphinProfileId('');
                        }}
                      >
                        Add
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {activeConfig.dolphinProfileIds.length > 0 ? (
                        activeConfig.dolphinProfileIds.map((profileId) => (
                          <span
                            key={profileId}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                          >
                            {profileId}
                            <button
                              type="button"
                              className="text-red-500 font-bold"
                              onClick={() =>
                                setSenderConfigs((prev) => ({
                                  ...prev,
                                  wetransfer: {
                                    ...prev.wetransfer,
                                    dolphinProfileIds: prev.wetransfer.dolphinProfileIds.filter(
                                      (id) => id !== profileId
                                    ),
                                  },
                                }))
                              }
                              aria-label={`Delete Dolphin profile ${profileId}`}
                            >
                              ×
                            </button>
                          </span>
                        ))
                      ) : (
                        <div className="text-xs text-amber-700">No Dolphin profile ID added yet.</div>
                      )}
                    </div>

                    {activeConfig.dolphinProfileIds.length > 1 && (
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={activeConfig.randomizeDolphinProfiles}
                          onChange={(event) =>
                            setSenderConfigs((prev) => ({
                              ...prev,
                              wetransfer: {
                                ...prev.wetransfer,
                                randomizeDolphinProfiles: event.target.checked,
                              },
                            }))
                          }
                        />
                        Randomize Dolphin profile for each lead
                      </label>
                    )}

                    {!activeConfig.randomizeDolphinProfiles &&
                      activeConfig.dolphinProfileIds.length > 0 && (
                        <div className="text-[11px] text-slate-500">
                          Using first profile: <code>{activeConfig.dolphinProfileIds[0]}</code>
                        </div>
                      )}
                  </div>

                  <div className="mt-3 flex items-center gap-3 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={activeConfig.autoRotate}
                        onChange={(event) =>
                          setSenderConfigs((prev) => ({
                            ...prev,
                            wetransfer: { ...prev.wetransfer, autoRotate: event.target.checked },
                          }))
                        }
                      />
                      Auto-rotate
                    </label>
                  </div>
                </Panel>

                <Panel title="File / Message / CTA">
                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <Field label="File Source">
                      <select
                        className="input"
                        value={activeConfig.fileSource}
                        onChange={(event) =>
                          setSenderConfigs((prev) => ({
                            ...prev,
                            wetransfer: { ...prev.wetransfer, fileSource: event.target.value as 'upload' | 'generate' },
                          }))
                        }
                      >
                        <option value="upload">Upload attachment</option>
                        <option value="generate">Generate PDF in app</option>
                      </select>
                    </Field>
                    <Field label="CTA Link (used in generated PDF)">
                      <input
                        className="input"
                        placeholder="https://example.com/secure-link"
                        value={activeConfig.ctaLink}
                        onChange={(event) =>
                          setSenderConfigs((prev) => ({
                            ...prev,
                            wetransfer: { ...prev.wetransfer, ctaLink: event.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="PDF Orientation">
                      <select
                        className="input"
                        value={activeConfig.orientation}
                        onChange={(event) =>
                          setSenderConfigs((prev) => ({
                            ...prev,
                            wetransfer: { ...prev.wetransfer, orientation: event.target.value as 'landscape' | 'portrait' },
                          }))
                        }
                      >
                        <option value="landscape">Horizontal / Landscape</option>
                        <option value="portrait">Vertical / Portrait</option>
                      </select>
                    </Field>
                    <Field label="Design">
                      <input
                        className="input"
                        value={activeConfig.design}
                        onChange={(event) =>
                          setSenderConfigs((prev) => ({
                            ...prev,
                            wetransfer: { ...prev.wetransfer, design: event.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="CTA Style">
                      <select
                        className="input"
                        value={activeConfig.cta}
                        onChange={(event) =>
                          setSenderConfigs((prev) => ({
                            ...prev,
                            wetransfer: { ...prev.wetransfer, cta: event.target.value as 'button' | 'qr' },
                          }))
                        }
                      >
                        <option value="button">Button</option>
                        <option value="qr">QR code</option>
                      </select>
                    </Field>
                    <Field label="File Type">
                      <select
                        className="input"
                        value={activeConfig.fileType}
                        onChange={(event) =>
                          setSenderConfigs((prev) => ({
                            ...prev,
                            wetransfer: { ...prev.wetransfer, fileType: event.target.value },
                          }))
                        }
                      >
                        {['PDF', 'PPTX', 'DOCX', 'ZIP'].map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {activeConfig.fileSource === 'upload' && (
                    <div className="mt-3 space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">WeTransfer attachment</div>
                        <div className="text-xs text-slate-500 mt-1">
                          Select the exact file to upload to WeTransfer. The same selected attachment is reused for each lead in this run.
                          PDF, HTML, ZIP, SVG, Office documents, images, text files, and other file types are supported.
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-2 px-3 py-2 rounded bg-[#6C63FF] text-white text-xs font-semibold cursor-pointer">
                          <Upload className="w-4 h-4" />
                          Choose attachment
                          <input
                            type="file"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0] || null;
                              setWetransferUploadFile(file);

                              if (file) {
                                setSenderConfigs((prev) => ({
                                  ...prev,
                                  wetransfer: {
                                    ...prev.wetransfer,
                                    fileSource: 'upload',
                                    fileType:
                                      file.name.includes('.')
                                        ? file.name.split('.').pop()?.toUpperCase() || prev.wetransfer.fileType
                                        : prev.wetransfer.fileType,
                                  },
                                }));

                                appendLog(
                                  'success',
                                  `WeTransfer attachment selected: ${file.name} (${formatBytes(file.size)})`,
                                  'wetransfer'
                                );
                              }
                            }}
                          />
                        </label>

                        {wetransferUploadFile && (
                          <button
                            type="button"
                            className="px-3 py-2 rounded border border-slate-300 bg-white text-xs text-slate-700"
                            onClick={() => {
                              setWetransferUploadFile(null);
                              appendLog('warning', 'WeTransfer attachment cleared', 'wetransfer');
                            }}
                          >
                            Clear attachment
                          </button>
                        )}
                      </div>

                      <div className="text-xs">
                        {wetransferUploadFile ? (
                          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                            <div className="font-semibold">Ready to upload</div>
                            <div className="mt-1 break-all">{wetransferUploadFile.name}</div>
                            <div className="mt-1 text-emerald-700">
                              {formatBytes(wetransferUploadFile.size)} · {wetransferUploadFile.type || 'application/octet-stream'}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                            No attachment selected. Choose a file before starting the WeTransfer run.
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-700">
                          Attachment name template
                        </label>
                        <input
                          className="input"
                          value={activeConfig.attachmentNameTemplate}
                          onChange={(event) =>
                            setSenderConfigs((prev) => ({
                              ...prev,
                              wetransfer: {
                                ...prev.wetransfer,
                                attachmentNameTemplate: event.target.value,
                              },
                            }))
                          }
                          placeholder="{Email}-{OriginalName}.{Ext}"
                        />
                        <div className="text-[11px] leading-5 text-slate-500">
                          Auto-grab placeholders:
                          {' '}
                          <code>{'{Email}'}</code> = full lead email,
                          {' '}
                          <code>{'{LocalPart}'}</code> = text before @,
                          {' '}
                          <code>{'{Domain}'}</code> = example.com,
                          {' '}
                          <code>{'{DomainName}'}</code> = example,
                          {' '}
                          <code>{'{TLD}'}</code> = com,
                          {' '}
                          <code>{'{Name}'}</code> = lead name,
                          {' '}
                          <code>{'{OriginalName}'}</code> = original filename without extension,
                          {' '}
                          <code>{'{OriginalFile}'}</code> = original full filename,
                          {' '}
                          <code>{'{Ext}'}</code> = original extension.
                        </div>
                        <div className="text-[11px] text-slate-600">
                          Example:
                          {' '}
                          <code>{'{DomainName}-Tender-{Email}.{Ext}'}</code>
                          {' '}
                          → example-Tender-user@example.com.pdf
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                          <input
                            type="checkbox"
                            checked={activeConfig.convertHtmlToPdf}
                            onChange={(event) =>
                              setSenderConfigs((prev) => ({
                                ...prev,
                                wetransfer: {
                                  ...prev.wetransfer,
                                  convertHtmlToPdf: event.target.checked,
                                },
                              }))
                            }
                          />
                          Convert uploaded HTML to PDF per lead
                        </label>
                        <div className="text-[11px] leading-5 text-slate-500">
                          When enabled, an uploaded .html/.htm file is personalized for each lead, rendered as PDF,
                          and the generated PDF is sent through WeTransfer.
                        </div>
                        <div className="text-[11px] leading-5 text-slate-500">
                          Placeholders supported inside the HTML:
                          {' '}<code>{'{Email}'}</code>,
                          {' '}<code>{'{LocalPart}'}</code>,
                          {' '}<code>{'{Domain}'}</code>,
                          {' '}<code>{'{DomainName}'}</code>,
                          {' '}<code>{'{TLD}'}</code>,
                          {' '}<code>{'{Name}'}</code>.
                          Double braces such as <code>{'{{Email}}'}</code> also work.
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                          <input
                            type="checkbox"
                            checked={activeConfig.replaceBatchPlaceholdersInPdf}
                            onChange={(event) =>
                              setSenderConfigs((prev) => ({
                                ...prev,
                                wetransfer: {
                                  ...prev.wetransfer,
                                  replaceBatchPlaceholdersInPdf: event.target.checked,
                                },
                              }))
                            }
                          />
                          Replace batch placeholders in uploaded PDF form fields
                        </label>

                        <div className="text-[11px] leading-5 text-slate-500">
                          Generates one shared set of values for the whole recipient batch (up to 10 recipients).
                          Supported placeholders:
                          {' '}<code>{'{Date}'}</code>,
                          {' '}<code>{'{Time}'}</code>,
                          {' '}<code>{'{DateTime}'}</code>,
                          {' '}<code>{'{Reference}'}</code>,
                          {' '}<code>{'{Random6}'}</code>,
                          {' '}<code>{'{Random8}'}</code>,
                          {' '}<code>{'{UUID}'}</code>,
                          {' '}<code>{'{BatchId}'}</code>.
                        </div>

                        <div className="text-[11px] leading-5 text-amber-700">
                          For uploaded PDFs, reliable replacement works with PDF text/form fields whose field name
                          or current value is one of these placeholders. Ordinary text already baked into a PDF page
                          is left unchanged. HTML-to-PDF and attachment filenames support direct placeholder replacement.
                        </div>
                      </div>

                    </div>
                  )}
                  {activeConfig.fileSource === 'generate' && (
                    <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
                      <Field label="Generated PDF Title">
                        <input
                          className="input"
                          value={activeConfig.generatedTitle}
                          onChange={(event) =>
                            setSenderConfigs((prev) => ({
                              ...prev,
                              wetransfer: { ...prev.wetransfer, generatedTitle: event.target.value },
                            }))
                          }
                        />
                      </Field>
                      <Field label="Layout Mode">
                        <select
                          className="input"
                          value={activeConfig.generatedLayout}
                          onChange={(event) =>
                            setSenderConfigs((prev) => ({
                              ...prev,
                              wetransfer: {
                                ...prev.wetransfer,
                                generatedLayout: event.target.value as 'classic' | 'highlight',
                              },
                            }))
                          }
                        >
                          <option value="classic">Classic</option>
                          <option value="highlight">Highlight</option>
                        </select>
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Generated Subtitle">
                          <input
                            className="input"
                            value={activeConfig.generatedSubtitle}
                            onChange={(event) =>
                              setSenderConfigs((prev) => ({
                                ...prev,
                                wetransfer: { ...prev.wetransfer, generatedSubtitle: event.target.value },
                              }))
                            }
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Field label="Generated Body Text">
                          <textarea
                            rows={3}
                            className="input"
                            value={activeConfig.generatedBodyText}
                            onChange={(event) =>
                              setSenderConfigs((prev) => ({
                                ...prev,
                                wetransfer: { ...prev.wetransfer, generatedBodyText: event.target.value },
                              }))
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  )}
                  <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
                    <div className="font-semibold text-slate-800">WeTransfer attachment debug</div>
                    <div>
                      Readiness:{' '}
                      <span
                        className={
                          wetransferAttachment.readiness === 'ready'
                            ? 'text-emerald-600 font-semibold'
                            : 'text-red-600 font-semibold'
                        }
                      >
                        {wetransferAttachment.readiness}
                      </span>
                    </div>
                    <div>Name: {wetransferAttachment.name ?? 'none selected'}</div>
                    <div>Source: {wetransferAttachment.source}</div>
                    <div>MIME: {wetransferAttachment.mimeType ?? 'unknown'}</div>
                    <div>Size: {formatBytes(wetransferAttachment.sizeBytes)}</div>
                    <div className="text-slate-500">{wetransferAttachment.detail}</div>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={activeConfig.useCustomMessage}
                      onChange={(event) =>
                        setSenderConfigs((prev) => ({
                          ...prev,
                          wetransfer: { ...prev.wetransfer, useCustomMessage: event.target.checked },
                        }))
                      }
                    />
                    Custom transfer message
                  </label>
                    <p className="mt-2 text-xs text-slate-500">
                      Lead autograb supports plain emails and <span className="font-mono">Name &lt;email&gt;</span>. In Generate mode, PDFs are created per lead before each send attempt.
                    </p>
                </Panel>

                <Panel title="Chromium / Browser Proxy Settings">
                  <div className="space-y-4 text-sm">
                    <p className="text-slate-500 text-xs">
                      Dedicated proxy configuration for Chromium/Playwright browser automation.
                    </p>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer font-medium">
                        <input
                          type="checkbox"
                          checked={browserProxy.enabled}
                          onChange={(e) => setBrowserProxy((p) => ({ ...p, enabled: e.target.checked }))}
                        />
                        Enable browser proxy
                      </label>
                      <span className={`px-2 py-0.5 rounded text-xs font-mono ${browserProxy.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {browserProxy.enabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <fieldset
                      disabled={!browserProxy.enabled}
                      className={`grid sm:grid-cols-2 gap-3 rounded border border-slate-200 p-3 transition-opacity ${browserProxy.enabled ? 'bg-white opacity-100' : 'bg-slate-50 opacity-60'}`}
                    >
                      <Field label="Protocol">
                        <select
                          className="input"
                          value={browserProxy.protocol}
                          onChange={(e) => setBrowserProxy((p) => ({ ...p, protocol: e.target.value as 'http' | 'socks5' }))}
                          disabled={!browserProxy.enabled}
                        >
                          <option value="http">http</option>
                          <option value="socks5">socks5</option>
                        </select>
                      </Field>
                      <Field label="Host">
                        <input
                          className="input"
                          value={browserProxy.host}
                          onChange={(e) => setBrowserProxy((p) => ({ ...p, host: e.target.value }))}
                          placeholder="e.g. gate.nodemaven.com"
                          disabled={!browserProxy.enabled}
                        />
                      </Field>
                      <Field label="Port">
                        <input
                          type="number"
                          className="input"
                          value={browserProxy.port}
                          onChange={(e) => setBrowserProxy((p) => ({ ...p, port: e.target.value }))}
                          placeholder="8080"
                          min={1}
                          max={65535}
                          disabled={!browserProxy.enabled}
                        />
                      </Field>
                      <Field label="Username">
                        <input
                          className="input"
                          value={browserProxy.username}
                          onChange={(e) => setBrowserProxy((p) => ({ ...p, username: e.target.value }))}
                          placeholder="Proxy username"
                          autoComplete="off"
                          disabled={!browserProxy.enabled}
                        />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Password">
                          <div className="flex gap-2 items-center">
                            <input
                              type="password"
                              className="input flex-1"
                              value={browserProxy.password}
                              onChange={(e) => setBrowserProxy((p) => ({ ...p, password: e.target.value }))}
                              placeholder={browserProxyHasPassword ? '••••••• (set — re-enter to change)' : 'Leave blank if no auth'}
                              autoComplete="new-password"
                              disabled={!browserProxy.enabled}
                            />
                            {browserProxyHasPassword && (
                              <button
                                className="px-2 py-1 rounded border text-xs text-red-600 border-red-300 hover:bg-red-50 disabled:opacity-50"
                                onClick={() => { setBrowserProxy((p) => ({ ...p, password: '' })); setBrowserProxyHasPassword(false); }}
                                title="Clear stored password"
                                type="button"
                                disabled={!browserProxy.enabled}
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </Field>
                      </div>
                    </fieldset>
                    {browserProxyError && (
                      <p className="text-red-600 text-xs mt-1">{browserProxyError}</p>
                    )}
                    {browserProxyTestResult && (
                      <div className={`rounded border px-3 py-2 text-xs ${
                        browserProxyTestResult.level === 'success'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : browserProxyTestResult.level === 'warning'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-red-200 bg-red-50 text-red-700'
                      }`}>
                        <div>{browserProxyTestResult.message}</div>
                        {browserProxyTestResult.diagnostics && (
                          <div className="mt-1 font-mono text-[11px] opacity-80">
                            {browserProxyTestResult.diagnostics}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2 mt-2">
                      <button
                        className="px-3 py-2 rounded border border-slate-300 text-slate-700 disabled:opacity-50"
                        disabled={!browserProxy.enabled || browserProxySaving || browserProxyTesting}
                        onClick={testBrowserProxy}
                        type="button"
                        title={browserProxy.enabled ? 'Validate the configured proxy using the browser automation path' : 'Enable proxy to test it'}
                      >
                        {browserProxyTesting ? 'Testing…' : 'Test Proxy'}
                      </button>
                      <button
                        className="px-3 py-2 rounded bg-[#6C63FF] text-white disabled:opacity-50"
                        disabled={browserProxySaving || browserProxyTesting}
                        onClick={saveBrowserProxySettings}
                        type="button"
                      >
                        {browserProxySaving ? 'Saving…' : 'Save Proxy Settings'}
                      </button>
                    </div>
                  </div>
                </Panel>
              </div>

              {/* WeTransfer execution steps panel */}
              <WeTransferStepsPanel session={weTransferSession} />
            </div>
          ) : activeSender === 'adobe' ? (
            <AdobeSenderPanel
              connection={adobeConnection}
              connecting={adobeConnecting}
              leadEmails={leads
                .map((lead) => lead.email || lead.normalized)
                .filter((email): email is string => Boolean(email))}
              onConnect={() => void connectAdobeInBrowser()}
              onDisconnect={() => void disconnectAdobe()}
              onRefresh={() => void refreshAdobeConnection()}
              onLog={(level, message) => appendLog(level, message, 'adobe')}
              onToast={addToast}
            />
          ) : activeSender === 'gmail' ? (
            <GmailSenderPanel
              leadEmails={leads
                .map((lead) => lead.email || lead.normalized)
                .filter((email): email is string => Boolean(email))}
              onLog={(level, message) => appendLog(level, message, 'gmail')}
              onToast={addToast}
            />
          ) : (
            <MockSenderPanel
              sender={activeSender}
              config={activeConfig}
              onConfigChange={(next) =>
                setSenderConfigs((prev) => ({ ...prev, [activeSender]: { ...prev[activeSender], ...next } }))
              }
              onLog={(msg) => appendLog('info', msg, activeSender)}
            />
          )}
        </section>

        <section className="bg-[#1A1A2E] text-white px-4 py-3 border-t border-[#2D2D44] h-56 overflow-auto font-mono text-xs">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-slate-300 uppercase tracking-wide">Runtime Logs</span>
            <button
              type="button"
              className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
              onClick={clearVisibleLogs}
            >
              Clear Logs
            </button>
          </div>
          <div className="space-y-1">
            {logs.length === 0 && <div className="text-slate-400">No runtime actions yet.</div>}
            {logs.map((log) => (
              <div key={log.id} className="flex gap-2">
                <span className="text-[#A78BFA]">{formatTime(log.timestamp)}</span>
                <span className="uppercase min-w-[88px]" style={{ color: senderColor(log.sender) }}>
                  [{log.sender}]
                </span>
                <span style={{ color: levelColor(log.level) }}>{log.level}</span>
                <span style={{ color: '#E2E8F0' }}>{log.message}</span>
              </div>
            ))}
            <div className="text-slate-500">— end of log —</div>
          </div>
        </section>
      </main>

      <div className="fixed right-4 bottom-4 bg-white shadow-lg rounded-lg border border-slate-200 p-3 w-64">
        <p className="text-xs text-slate-500">Quick URL</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="text-xs truncate flex-1">https://local.3d-suite/session/current</code>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText('https://local.3d-suite/session/current');
              addToast('Quick URL copied', 'success');
            }}
            title="Copy URL"
          >
            <Copy className="w-4 h-4 text-[#6C63FF]" />
          </button>
        </div>
      </div>

      {activeModal && (
        <ModalShell title={modalTitle(activeModal)} onClose={() => setActiveModal(null)}>
          {activeModal === 'leads' && (
            <div className="space-y-3 text-sm">
              <textarea
                rows={7}
                value={leadsInput}
                onChange={(event) => setLeadsInput(event.target.value)}
                placeholder={`Paste one lead per line\nalice@example.com\nAlice Smith <alice@example.com>`}
                className="w-full border rounded px-3 py-2 font-mono"
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={dedupeEnabled} onChange={(event) => setDedupeEnabled(event.target.checked)} />
                  Dedupe exact duplicates
                </label>
                <label className="text-xs cursor-pointer text-[#6C63FF] inline-flex items-center gap-1">
                  <Upload className="w-3 h-3" /> Upload text file
                  <input type="file" className="hidden" accept=".txt,.csv,.log,.text" onChange={handleLeadFileUpload} />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <MiniStat label="Uploaded" value={totalUploaded} />
                <MiniStat label="Sent" value={totalSent} />
                <MiniStat label="Remaining" value={totalRemaining} />
              </div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-2 rounded bg-[#6C63FF] text-white"
                  onClick={() => {
                    importLeadLines(parseLeadLines(leadsInput));
                    setLeadsInput('');
                  }}
                >
                  Parse & Add Leads
                </button>
                <button className="px-3 py-2 rounded border" onClick={clearAllLeads}>Clear All</button>
              </div>
            </div>
          )}

          {activeModal === 'credentials' && (
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  WeTransfer / Temporary Email
                </p>

                <div className="space-y-3">
                  <div className="flex gap-2">
                    {(['mailslurp', 'tempmailio'] as const).map((provider) => (
                      <button
                        key={provider}
                        type="button"
                        className={`px-3 py-2 rounded text-xs font-semibold border ${
                          credentials.wetransfer.provider === provider
                            ? 'bg-[#6C63FF] text-white border-[#6C63FF]'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                        onClick={() =>
                          setCredentials((prev) => ({
                            ...prev,
                            wetransfer: { ...prev.wetransfer, provider },
                          }))
                        }
                      >
                        {getTempMailProviderLabel(provider)}
                      </button>
                    ))}
                  </div>

                  <Field label={`${getTempMailProviderLabel(credentials.wetransfer.provider)} API Key`}>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="password"
                        className="input flex-1 min-w-[240px]"
                        value={getSelectedTempMailApiKey(credentials.wetransfer)}
                        onChange={(event) =>
                          setCredentials((prev) => ({
                            ...prev,
                            wetransfer: {
                              ...prev.wetransfer,
                              ...(prev.wetransfer.provider === 'tempmailio'
                                ? { tempMailIoApiKey: event.target.value }
                                : { mailSlurpApiKey: event.target.value }),
                            },
                          }))
                        }
                      />

                      <button
                        type="button"
                        className="px-3 py-2 rounded bg-emerald-600 text-white text-xs"
                        onClick={() => {
                          const provider = credentials.wetransfer.provider;
                          const key = getSelectedTempMailApiKey(credentials.wetransfer).trim();

                          if (!key) {
                            addToast('Enter an API key first', 'warning');
                            return;
                          }

                          window.sessionStorage.setItem(
                            TEMP_MAIL_SESSION_KEYS[provider],
                            key
                          );
                          addToast(
                            `${getTempMailProviderLabel(provider)} API key saved to session`,
                            'success'
                          );
                        }}
                      >
                        Save to session
                      </button>

                      <button
                        type="button"
                        className="px-3 py-2 rounded border border-red-300 text-red-600 text-xs"
                        onClick={() => {
                          const provider = credentials.wetransfer.provider;
                          window.sessionStorage.removeItem(
                            TEMP_MAIL_SESSION_KEYS[provider]
                          );

                          setCredentials((prev) => ({
                            ...prev,
                            wetransfer: {
                              ...prev.wetransfer,
                              ...(provider === 'tempmailio'
                                ? { tempMailIoApiKey: '' }
                                : { mailSlurpApiKey: '' }),
                            },
                          }));
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </Field>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="WeTransfer Account (optional)">
                      <input
                        className="input"
                        value={credentials.wetransfer.account}
                        onChange={(e) =>
                          setCredentials((p) => ({
                            ...p,
                            wetransfer: {
                              ...p.wetransfer,
                              account: e.target.value,
                            },
                          }))
                        }
                      />
                    </Field>

                    <Field label="Proxy (optional)">
                      <input
                        className="input"
                        value={credentials.wetransfer.proxy}
                        onChange={(e) =>
                          setCredentials((p) => ({
                            ...p,
                            wetransfer: {
                              ...p.wetransfer,
                              proxy: e.target.value,
                            },
                          }))
                        }
                      />
                    </Field>
                  </div>
                </div>
              </div>
              <hr className="border-slate-200" />
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Other Senders</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Adobe browser mode does not require a Client ID, Client Secret, or OAuth Redirect URI.
                    Click Open Adobe & Connect and log in manually in the normal Chrome browser window.
                  </div>
                  <Field label="QuickBooks Company ID"><input className="input" value={credentials.quickbooks.companyId} onChange={(e) => setCredentials((p) => ({ ...p, quickbooks: { ...p.quickbooks, companyId: e.target.value } }))} /></Field>
                  <Field label="DocuSign Account ID"><input className="input" value={credentials.docusign.accountId} onChange={(e) => setCredentials((p) => ({ ...p, docusign: { ...p.docusign, accountId: e.target.value } }))} /></Field>
                </div>
              </div>
            </div>
          )}

          {activeModal === 'settings' && (
            <div className="space-y-4 text-sm">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Proxy"><input className="input" value={settingsState.proxy} onChange={(e) => setSettingsState((p) => ({ ...p, proxy: e.target.value }))} /></Field>
                <Field label="Default Rate Limit (sec)"><input type="number" className="input" value={settingsState.defaultDelay} onChange={(e) => setSettingsState((p) => ({ ...p, defaultDelay: Number(e.target.value || 1) }))} /></Field>
                <Field label="Default File Type"><input className="input" value={settingsState.defaultFileType} onChange={(e) => setSettingsState((p) => ({ ...p, defaultFileType: e.target.value }))} /></Field>
                <Field label="Default Temp Provider"><input className="input" value={settingsState.defaultTempProvider} onChange={(e) => setSettingsState((p) => ({ ...p, defaultTempProvider: e.target.value }))} /></Field>
              </div>
              <div className="rounded border border-slate-200 p-3 space-y-3">
                <div>
                  <h3 className="font-semibold text-slate-800">Chromium Proxy</h3>
                  <p className="text-xs text-slate-500">Controls outbound browser traffic for Chromium / Playwright automation.</p>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={browserProxy.enabled}
                      onChange={(e) => setBrowserProxy((p) => ({ ...p, enabled: e.target.checked }))}
                    />
                    Enable proxy
                  </label>
                  <span className={`px-2 py-0.5 rounded text-xs font-mono ${browserProxy.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {browserProxy.enabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                <fieldset
                  disabled={!browserProxy.enabled}
                  className={`grid sm:grid-cols-2 gap-3 rounded border border-slate-200 p-3 transition-opacity ${browserProxy.enabled ? 'bg-white opacity-100' : 'bg-slate-50 opacity-60'}`}
                >
                  <Field label="Protocol">
                    <select
                      className="input"
                      value={browserProxy.protocol}
                      onChange={(e) => setBrowserProxy((p) => ({ ...p, protocol: e.target.value as 'http' | 'socks5' }))}
                      disabled={!browserProxy.enabled}
                    >
                      <option value="http">http</option>
                      <option value="socks5">socks5</option>
                    </select>
                  </Field>
                  <Field label="Host">
                    <input
                      className="input"
                      value={browserProxy.host}
                      onChange={(e) => setBrowserProxy((p) => ({ ...p, host: e.target.value }))}
                      placeholder="e.g. gate.nodemaven.com"
                      disabled={!browserProxy.enabled}
                    />
                  </Field>
                  <Field label="Port">
                    <input
                      type="number"
                      className="input"
                      value={browserProxy.port}
                      onChange={(e) => setBrowserProxy((p) => ({ ...p, port: e.target.value }))}
                      placeholder="8080"
                      min={1}
                      max={65535}
                      disabled={!browserProxy.enabled}
                    />
                  </Field>
                  <Field label="Username">
                    <input
                      className="input"
                      value={browserProxy.username}
                      onChange={(e) => setBrowserProxy((p) => ({ ...p, username: e.target.value }))}
                      placeholder="Proxy username"
                      autoComplete="off"
                      disabled={!browserProxy.enabled}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Password">
                      <div className="flex gap-2 items-center">
                        <input
                          type="password"
                          className="input flex-1"
                          value={browserProxy.password}
                          onChange={(e) => setBrowserProxy((p) => ({ ...p, password: e.target.value }))}
                          placeholder={browserProxyHasPassword ? '••••••• (set — re-enter to change)' : 'Leave blank if no auth'}
                          autoComplete="new-password"
                          disabled={!browserProxy.enabled}
                        />
                        {browserProxyHasPassword && (
                          <button
                            className="px-2 py-1 rounded border text-xs text-red-600 border-red-300 hover:bg-red-50 disabled:opacity-50"
                            onClick={() => { setBrowserProxy((p) => ({ ...p, password: '' })); setBrowserProxyHasPassword(false); }}
                            title="Clear stored password"
                            type="button"
                            disabled={!browserProxy.enabled}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </Field>
                  </div>
                </fieldset>
                {browserProxyError && (
                  <p className="text-red-600 text-xs mt-1">{browserProxyError}</p>
                )}
                {browserProxyTestResult && (
                  <div className={`rounded border px-3 py-2 text-xs ${
                    browserProxyTestResult.level === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : browserProxyTestResult.level === 'warning'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-red-200 bg-red-50 text-red-700'
                  }`}>
                    <div>{browserProxyTestResult.message}</div>
                    {browserProxyTestResult.diagnostics && (
                      <div className="mt-1 font-mono text-[11px] opacity-80">
                        {browserProxyTestResult.diagnostics}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    className="px-3 py-2 rounded border border-slate-300 text-slate-700 disabled:opacity-50"
                    disabled={!browserProxy.enabled || browserProxySaving || browserProxyTesting}
                    onClick={testBrowserProxy}
                    type="button"
                    title={browserProxy.enabled ? 'Validate the configured proxy using the browser automation path' : 'Enable proxy to test it'}
                  >
                    {browserProxyTesting ? 'Testing…' : 'Test Proxy'}
                  </button>
                  <button
                    className="px-3 py-2 rounded bg-[#6C63FF] text-white disabled:opacity-50"
                    disabled={browserProxySaving || browserProxyTesting}
                    onClick={saveBrowserProxySettings}
                    type="button"
                  >
                    {browserProxySaving ? 'Saving…' : 'Save Proxy Settings'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeModal === 'logs' && <LogsModal logs={logs} onClear={clearVisibleLogs} />}

          {activeModal === 'browser-proxy' && (
            <div className="space-y-4 text-sm">
              <p className="text-slate-500 text-xs">
                Configure outbound proxy for Chromium/Playwright browser automation. Applied to all browser launches when enabled.
              </p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={browserProxy.enabled}
                    onChange={(e) => setBrowserProxy((p) => ({ ...p, enabled: e.target.checked }))}
                  />
                  Enable proxy
                </label>
                <span className={`px-2 py-0.5 rounded text-xs font-mono ${browserProxy.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {browserProxy.enabled ? 'ON' : 'OFF'}
                </span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Protocol">
                  <select
                    className="input"
                    value={browserProxy.protocol}
                    onChange={(e) => setBrowserProxy((p) => ({ ...p, protocol: e.target.value as 'http' | 'socks5' }))}
                    disabled={!browserProxy.enabled}
                  >
                    <option value="http">http</option>
                    <option value="socks5">socks5</option>
                  </select>
                </Field>
                <Field label="Host">
                  <input
                    className="input"
                    value={browserProxy.host}
                    onChange={(e) => setBrowserProxy((p) => ({ ...p, host: e.target.value }))}
                    placeholder="e.g. 127.0.0.1 or proxy.example.com"
                    disabled={!browserProxy.enabled}
                  />
                </Field>
                <Field label="Port">
                  <input
                    type="number"
                    className="input"
                    value={browserProxy.port}
                    onChange={(e) => setBrowserProxy((p) => ({ ...p, port: e.target.value }))}
                    placeholder="8080"
                    min={1}
                    max={65535}
                    disabled={!browserProxy.enabled}
                  />
                </Field>
                <Field label="Username (optional)">
                  <input
                    className="input"
                    value={browserProxy.username}
                    onChange={(e) => setBrowserProxy((p) => ({ ...p, username: e.target.value }))}
                    placeholder="Leave blank if no auth"
                    autoComplete="off"
                    disabled={!browserProxy.enabled}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Password (optional)">
                    <div className="flex gap-2 items-center">
                      <input
                        type="password"
                        className="input flex-1"
                        value={browserProxy.password}
                        onChange={(e) => setBrowserProxy((p) => ({ ...p, password: e.target.value }))}
                        placeholder={browserProxyHasPassword ? '••••••• (set — re-enter to change)' : 'Leave blank if no auth'}
                        autoComplete="new-password"
                        disabled={!browserProxy.enabled}
                      />
                      {browserProxyHasPassword && (
                        <button
                          className="px-2 py-1 rounded border text-xs text-red-600 border-red-300 hover:bg-red-50"
                          onClick={() => { setBrowserProxy((p) => ({ ...p, password: '' })); setBrowserProxyHasPassword(false); }}
                          title="Clear stored password"
                          type="button"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </Field>
                </div>
              </div>
              {browserProxyError && (
                <p className="text-red-600 text-xs mt-1">{browserProxyError}</p>
              )}
              {browserProxyTestResult && (
                <div className={`rounded border px-3 py-2 text-xs ${
                  browserProxyTestResult.level === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : browserProxyTestResult.level === 'warning'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                }`}>
                  <div>{browserProxyTestResult.message}</div>
                  {browserProxyTestResult.diagnostics && (
                    <div className="mt-1 font-mono text-[11px] opacity-80">
                      {browserProxyTestResult.diagnostics}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 mt-2">
                <button
                  className="px-3 py-2 rounded border border-slate-300 text-slate-700 disabled:opacity-50"
                  disabled={!browserProxy.enabled || browserProxySaving || browserProxyTesting}
                  onClick={testBrowserProxy}
                  type="button"
                  title={browserProxy.enabled ? 'Validate the configured proxy using the browser automation path' : 'Enable proxy to test it'}
                >
                  {browserProxyTesting ? 'Testing…' : 'Test Proxy'}
                </button>
                <button
                  className="px-3 py-2 rounded bg-[#6C63FF] text-white disabled:opacity-50"
                  disabled={browserProxySaving || browserProxyTesting}
                  onClick={saveBrowserProxySettings}
                  type="button"
                >
                  {browserProxySaving ? 'Saving…' : 'Save Proxy Settings'}
                </button>
              </div>
            </div>
          )}


          {activeModal === 'redirect-generator' && (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                <div>
                  <h4 className="font-semibold text-slate-800">Cloudflare Configuration</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    These values are stored only in this browser session when you click Save to session.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Account ID">
                    <input
                      className="input"
                      value={cloudflareRedirectConfig.accountId}
                      onChange={(event) =>
                        setCloudflareRedirectConfig((prev) => ({
                          ...prev,
                          accountId: event.target.value,
                        }))
                      }
                      placeholder="Cloudflare Account ID"
                    />
                  </Field>

                  <Field label="KV Namespace ID">
                    <input
                      className="input"
                      value={cloudflareRedirectConfig.namespaceId}
                      onChange={(event) =>
                        setCloudflareRedirectConfig((prev) => ({
                          ...prev,
                          namespaceId: event.target.value,
                        }))
                      }
                      placeholder="Workers KV Namespace ID"
                    />
                  </Field>

                  <div className="sm:col-span-2">
                    <Field label="Cloudflare API Token">
                      <input
                        type="password"
                        className="input"
                        value={cloudflareRedirectConfig.apiToken}
                        onChange={(event) =>
                          setCloudflareRedirectConfig((prev) => ({
                            ...prev,
                            apiToken: event.target.value,
                          }))
                        }
                        placeholder="API token with Workers KV read/write permission"
                      />
                    </Field>
                  </div>

                  <div className="sm:col-span-2">
                    <Field label="Public Worker URL">
                      <input
                        className="input"
                        value={cloudflareRedirectConfig.publicBaseUrl}
                        onChange={(event) =>
                          setCloudflareRedirectConfig((prev) => ({
                            ...prev,
                            publicBaseUrl: event.target.value,
                          }))
                        }
                        placeholder="https://redirector.your-subdomain.workers.dev"
                      />
                    </Field>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="px-3 py-2 rounded bg-[#6C63FF] text-white text-xs font-semibold"
                    onClick={saveCloudflareRedirectConfigToSession}
                  >
                    Save to session
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 rounded border border-red-300 text-red-600 text-xs font-semibold"
                    onClick={clearCloudflareRedirectConfig}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 rounded border border-slate-300 text-slate-700 text-xs font-semibold disabled:opacity-50"
                    disabled={redirectBusy}
                    onClick={() => void refreshCloudflareRedirects()}
                  >
                    {redirectBusy ? 'Loading…' : 'Refresh redirects'}
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                <h4 className="font-semibold text-slate-800">
                  {redirectEditingAlias ? 'Edit Redirect' : 'Generate Redirect'}
                </h4>

                <Field label="Destination URL">
                  <input
                    className="input"
                    value={redirectDestination}
                    onChange={(event) => setRedirectDestination(event.target.value)}
                    placeholder="https://example.com/document"
                  />
                </Field>

                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Custom alias (optional)">
                    <input
                      className="input"
                      value={redirectAlias}
                      onChange={(event) => setRedirectAlias(event.target.value)}
                      placeholder="tender-2026"
                    />
                  </Field>

                  <Field label="Redirect type">
                    <select
                      className="input"
                      value={redirectStatusCode}
                      onChange={(event) =>
                        setRedirectStatusCode(
                          Number(event.target.value) as 301 | 302 | 307 | 308
                        )
                      }
                    >
                      <option value={302}>302 Temporary</option>
                      <option value={301}>301 Permanent</option>
                      <option value={307}>307 Temporary (preserve method)</option>
                      <option value={308}>308 Permanent (preserve method)</option>
                    </select>
                  </Field>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-2 rounded bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
                    disabled={redirectBusy}
                    onClick={() => void createOrUpdateCloudflareRedirect()}
                  >
                    {redirectEditingAlias ? 'Save changes' : 'Generate Redirect'}
                  </button>

                  {redirectEditingAlias && (
                    <button
                      type="button"
                      className="px-3 py-2 rounded border border-slate-300 text-xs"
                      onClick={() => {
                        setRedirectEditingAlias(null);
                        setRedirectDestination('');
                        setRedirectAlias('');
                        setRedirectStatusCode(302);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {redirectError && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {redirectError}
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-slate-800">Redirect History</h4>
                  <span className="text-xs text-slate-500">{redirectItems.length} redirect(s)</span>
                </div>

                <div className="max-h-72 overflow-auto space-y-2">
                  {redirectItems.length === 0 && (
                    <div className="text-xs text-slate-400 py-4 text-center">
                      No redirects loaded yet.
                    </div>
                  )}

                  {redirectItems.map((item) => (
                    <div
                      key={item.alias}
                      className="rounded border border-slate-200 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-xs text-[#6C63FF] break-all">
                            {item.redirectUrl}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 break-all">
                            → {item.destination}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            HTTP {item.statusCode}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1 shrink-0">
                          <button
                            type="button"
                            className="px-2 py-1 rounded border text-[11px]"
                            onClick={() => {
                              void navigator.clipboard.writeText(item.redirectUrl);
                              addToast('Redirect URL copied', 'success');
                            }}
                          >
                            Copy
                          </button>

                          <button
                            type="button"
                            className="px-2 py-1 rounded border text-[11px]"
                            onClick={() =>
                              window.open(item.redirectUrl, '_blank', 'noopener,noreferrer')
                            }
                          >
                            Test
                          </button>

                          <button
                            type="button"
                            className="px-2 py-1 rounded border text-[11px]"
                            onClick={() => {
                              setRedirectEditingAlias(item.alias);
                              setRedirectAlias(item.alias);
                              setRedirectDestination(item.destination);
                              setRedirectStatusCode(item.statusCode);
                            }}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="px-2 py-1 rounded border border-red-300 text-red-600 text-[11px]"
                            onClick={() => void deleteCloudflareRedirect(item.alias)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!['leads', 'credentials', 'settings', 'logs', 'browser-proxy', 'redirect-generator'].includes(activeModal as string) && (
            <div className="space-y-2 text-sm">
              <p className="text-slate-600">Local editable workspace for {modalTitle(activeModal)}.</p>
              <textarea
                value={moduleNotes[activeModal] || ''}
                onChange={(event) =>
                  setModuleNotes((prev) => ({
                    ...prev,
                    [activeModal]: event.target.value,
                  }))
                }
                rows={6}
                placeholder="Store local notes and config for this module..."
                className="w-full border rounded px-3 py-2"
              />
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              className="px-3 py-2 rounded border"
              onClick={() => {
                setActiveModal(null);
                appendLog('info', `${modalTitle(activeModal)} settings updated`, 'system');
              }}
            >
              Close
            </button>
            <button className="px-3 py-2 rounded bg-[#6C63FF] text-white" onClick={saveSession}>Save in Session</button>
          </div>
        </ModalShell>
      )}

      {showStopConfirm && (
        <ModalShell title="Stop campaign?" onClose={() => setShowStopConfirm(false)}>
          <p className="text-sm text-slate-600">This will stop the current run. Sent leads stay sent, unsent leads remain pending for resume.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button className="px-3 py-2 rounded border" onClick={() => setShowStopConfirm(false)}>Cancel</button>
            <button className="px-3 py-2 rounded bg-red-600 text-white" onClick={confirmStop}>Confirm Stop</button>
          </div>
        </ModalShell>
      )}

      <div className="fixed top-3 right-3 space-y-2 z-50">
        {toasts.map((toast) => (
          <div key={toast.id} className="px-3 py-2 rounded shadow text-xs text-white" style={{ background: levelColor(toast.level) }}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone = 'default' }: { label: string; value: React.ReactNode; tone?: 'default' | 'success' | 'warning' | 'danger' }) {
  const toneClass =
    tone === 'success' ? 'text-emerald-600' : tone === 'warning' ? 'text-amber-600' : tone === 'danger' ? 'text-red-600' : 'text-slate-900';

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${toneClass}`}>{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
      <h3 className="font-semibold text-sm mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border border-slate-200 px-2 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/45 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl border border-slate-200">
        <div className="h-12 px-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-sm">{title}</h3>
          <button onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function LogsModal({ logs, onClear }: { logs: RuntimeLog[]; onClear: () => void }) {
  const [senderFilter, setSenderFilter] = React.useState<'all' | SenderKey | 'system'>('all');
  const [levelFilter, setLevelFilter] = React.useState<'all' | LogLevel>('all');

  const filtered = logs.filter((log) => {
    const senderOk = senderFilter === 'all' || log.sender === senderFilter;
    const levelOk = levelFilter === 'all' || log.level === levelFilter;
    return senderOk && levelOk;
  });

  return (
    <div className="space-y-3 text-sm">
      <div className="grid sm:grid-cols-2 gap-2">
        <select className="input" value={senderFilter} onChange={(e) => setSenderFilter(e.target.value as 'all' | SenderKey | 'system')}>
          {['all', 'system', 'wetransfer', 'adobe', 'quickbooks', 'docusign'].map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <select className="input" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as 'all' | LogLevel)}>
          {['all', 'info', 'success', 'warning', 'error', 'stopped', 'system'].map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          className="px-2 py-1 rounded border text-xs"
          onClick={() => navigator.clipboard.writeText(JSON.stringify(filtered, null, 2))}
          type="button"
        >
          Copy filtered logs
        </button>
        <button
          className="px-2 py-1 rounded border text-xs"
          onClick={onClear}
          type="button"
        >
          Clear Logs
        </button>
      </div>
      <div className="max-h-72 overflow-auto rounded border border-slate-200 p-2 font-mono text-xs space-y-1 bg-slate-50">
        {filtered.length === 0 && <div className="text-slate-400">No logs for the current filters.</div>}
        {filtered.map((log) => (
          <div key={log.id}>[{formatTime(log.timestamp)}] [{log.sender}] {log.level}: {log.message}</div>
        ))}
      </div>
    </div>
  );
}


function AdobeSenderPanel({
  connection,
  connecting,
  leadEmails,
  onConnect,
  onDisconnect,
  onRefresh,
  onLog,
  onToast,
}: {
  connection: AdobeConnectionStatus;
  connecting: boolean;
  leadEmails: string[];
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  onLog: (level: LogLevel, message: string) => void;
  onToast: (message: string, level?: LogLevel) => void;
}) {
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [attachmentNameTemplate, setAttachmentNameTemplate] = React.useState(
    '{OriginalName}-{EmailUser}-{Random6}.{Ext}'
  );
  const [recipientsText, setRecipientsText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!recipientsText.trim() && leadEmails.length) {
      setRecipientsText(leadEmails.join('\n'));
    }
  }, [leadEmails, recipientsText]);

  const parsedRecipients = React.useMemo(
    () =>
      Array.from(
        new Set(
          recipientsText
            .split(/[\n,;\s]+/)
            .map((value) => value.trim().toLowerCase())
            .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        )
      ),
    [recipientsText]
  );

  async function sendAdobeShare() {
    if (!connection.connected || !connection.loggedIn) {
      onToast('Log into Adobe in the connected Dolphin browser first', 'error');
      return;
    }

    if (!uploadFile) {
      onToast('Choose a PDF to upload to Adobe', 'error');
      return;
    }

    if (!parsedRecipients.length) {
      onToast('Add at least one valid recipient email', 'error');
      return;
    }

    setSending(true);
    setLastResult(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('recipients', JSON.stringify(parsedRecipients));
      formData.append('attachmentNameTemplate', attachmentNameTemplate);

      onLog(
        'info',
        `Starting Adobe share: ${uploadFile.name} → ${parsedRecipients.length} recipient(s)`
      );

      const response = await fetch('/api/adobe/browser/send', {
        method: 'POST',
        body: formData,
      });

      const data = await parseApiJson<{
        success?: boolean;
        partial?: boolean;
        message?: string;
        totalCount?: number;
        processedCount?: number;
        sentCount?: number;
        failedCount?: number;
        currentUrl?: string;
        error?: string;
        results?: Array<{
          index: number;
          total: number;
          recipient: string;
          filename: string;
          success: boolean;
          message: string;
          errorCode?: string;
          error?: string;
        }>;
      }>(response);

      if (!response.ok) {
        throw new Error(
          data.error || `Adobe share failed (HTTP ${response.status})`
        );
      }

      const results = data.results || [];

      for (const result of results) {
        if (result.success) {
          onLog(
            'success',
            `${result.index}/${result.total} ✅ SENT — ${result.recipient} — ${result.filename}`
          );
        } else {
          onLog(
            'error',
            `${result.index}/${result.total} ❌ FAILED — ${result.recipient} — ${result.errorCode || 'ADOBE_SHARE_FAILED'} — ${result.error || result.message}`
          );
        }
      }

      const total = data.totalCount ?? parsedRecipients.length;
      const sent = data.sentCount ?? results.filter((item) => item.success).length;
      const failed =
        data.failedCount ?? results.filter((item) => !item.success).length;
      const processed = data.processedCount ?? results.length;

      const summary =
        `Adobe complete — ${sent} sent, ${failed} failed, ${processed}/${total} processed`;

      setLastResult(summary);
      onLog(failed > 0 ? 'warning' : 'success', summary);

      if (failed > 0) {
        onToast(summary, 'warning');
      } else {
        onToast('Adobe sharing completed successfully', 'success');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastResult(message);
      onLog('error', `Adobe share failed: ${message}`);
      onToast(message, 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel title="Adobe Document Cloud">
        <div className="space-y-3 text-sm">
          <div
            className={`rounded border px-3 py-2 ${
              connection.connected && connection.loggedIn
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : connection.connected
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}
          >
            <div className="font-semibold">
              {connection.connected && connection.loggedIn
                ? '● Connected — Adobe login detected'
                : connection.connected
                  ? '◐ Dolphin open — waiting for Adobe login'
                  : '○ Not connected'}
            </div>

            {connection.profileId && (
              <div className="mt-1 text-xs">Browser session: {connection.profileId}</div>
            )}
            {connection.currentUrl && (
              <div className="mt-1 text-xs break-all">URL: {connection.currentUrl}</div>
            )}
          </div>

          {!connection.connected ? (
            <button
              type="button"
              disabled={connecting}
              className="px-3 py-2 rounded bg-[#6C63FF] text-white disabled:opacity-50"
              onClick={onConnect}
            >
              {connecting ? 'Opening Adobe…' : 'Open Adobe & Connect'}
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="px-3 py-2 rounded border" onClick={onRefresh}>
                Check login
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded border border-red-300 text-red-600"
                onClick={onDisconnect}
              >
                Disconnect & Close Browser
              </button>
            </div>
          )}

          {connection.error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {connection.error}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Upload & Share PDF">
        <div className="space-y-3 text-sm">
          <Field label="PDF attachment">
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="input"
              onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
            />
          </Field>


          <Field label="Attachment name template">
            <input
              className="input"
              value={attachmentNameTemplate}
              onChange={(event) => setAttachmentNameTemplate(event.target.value)}
              placeholder="{OriginalName}-{EmailUser}-{Random6}.{Ext}"
            />
          </Field>

          <div className="text-xs text-slate-500 leading-5">
            Each recipient gets a separate Adobe upload with a unique filename.
            Supported placeholders:
            {' '}<code>{'{Email}'}</code>,
            {' '}<code>{'{EmailUser}'}</code>,
            {' '}<code>{'{Domain}'}</code>,
            {' '}<code>{'{DomainName}'}</code>,
            {' '}<code>{'{OriginalName}'}</code>,
            {' '}<code>{'{Ext}'}</code>,
            {' '}<code>{'{Date}'}</code>,
            {' '}<code>{'{Time}'}</code>,
            {' '}<code>{'{Random6}'}</code>,
            {' '}<code>{'{Random8}'}</code>,
            {' '}<code>{'{UUID}'}</code>.
          </div>

          <Field label={`Recipients (${parsedRecipients.length})`}>
            <textarea
              className="input min-h-40"
              value={recipientsText}
              onChange={(event) => setRecipientsText(event.target.value)}
              placeholder="employee1@company.com&#10;employee2@company.com"
            />
          </Field>

          <div className="text-xs text-slate-500">
            Imported lead emails are prefilled automatically. Adobe remains open in the same normal browser session.
            The PDF is uploaded separately for each recipient using the resolved attachment filename, then shared to that recipient.
          </div>

          <button
            type="button"
            disabled={
              sending ||
              !connection.connected ||
              !connection.loggedIn ||
              !uploadFile ||
              parsedRecipients.length === 0
            }
            className="px-3 py-2 rounded bg-[#6C63FF] text-white disabled:opacity-50"
            onClick={() => void sendAdobeShare()}
          >
            {sending ? 'Uploading & Sharing…' : 'Upload PDF & Share'}
          </button>

          {lastResult && (
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              {lastResult}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}


type GmailChromiumProfile = {
  directory: string;
  name: string;
  userDataDir: string;
};

type GmailConnectedAccount = {
  email: string;
  connectedAt: string;
  profileDirectory?: string | null;
};

function GmailSenderPanel({
  leadEmails,
  onLog,
  onToast,
}: {
  leadEmails: string[];
  onLog: (level: LogLevel, message: string) => void;
  onToast: (message: string, level?: LogLevel) => void;
}) {
  const [profiles, setProfiles] = React.useState<GmailChromiumProfile[]>([]);
  const [connections, setConnections] = React.useState<GmailConnectedAccount[]>([]);
  const [selectedProfile, setSelectedProfile] = React.useState('');
  const [selectedAccount, setSelectedAccount] = React.useState('');
  const [gmailRotateAccounts, setGmailRotateAccounts] = React.useState(false);
  const [gmailAccountCaps, setGmailAccountCaps] = React.useState<
    Record<string, { enabled: boolean; maxSends: number }>
  >({});
  const [gmailFromName, setGmailFromName] = React.useState('');
  const [extensionPath, setExtensionPath] = React.useState('');
  const [googleClientId, setGoogleClientId] = React.useState('');
  const [googleClientSecret, setGoogleClientSecret] = React.useState('');
  const [googleRedirectUri, setGoogleRedirectUri] = React.useState(
    'http://localhost:7201/api/gmail/oauth/callback'
  );
  const [chromiumUserDataDir, setChromiumUserDataDir] = React.useState('');
  const [chromiumExecutablePath, setChromiumExecutablePath] = React.useState('');
  const [gmailConnectionMode, setGmailConnectionMode] = React.useState<
    'chromium' | 'chromium-extension' | 'manual'
  >('chromium');
  const [gmailOAuthUrl, setGmailOAuthUrl] = React.useState('');
  const [gmailCallbackUrl, setGmailCallbackUrl] = React.useState('');
  const [finishingManualOAuth, setFinishingManualOAuth] =
    React.useState(false);
  const [loadingProfiles, setLoadingProfiles] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [subjectTemplate, setSubjectTemplate] =
    React.useState('Document for {DomainName}');
  const [bodyTemplate, setBodyTemplate] = React.useState(
    'Hello,\n\nPlease review the attached document.\n\nReference: {Random8}\nDate: {Date}'
  );
  const [gmailMessageMode, setGmailMessageMode] = React.useState<
    'text' | 'html'
  >('text');
  const [logoDevEnabled, setLogoDevEnabled] = React.useState(false);
  const [logoDevKey, setLogoDevKey] = React.useState(
    'pk_eMuRrK-CRt6uZ9jq15CpYw'
  );
  const [logoDevSize, setLogoDevSize] = React.useState(128);
  const [logoDevFormat, setLogoDevFormat] = React.useState<'png' | 'webp'>('png');
  const [logoDevTheme, setLogoDevTheme] = React.useState<
    'light' | 'dark' | 'auto'
  >('auto');
  const [logoDevPreviewDomain, setLogoDevPreviewDomain] =
    React.useState('google.com');
  const [attachmentNameTemplate, setAttachmentNameTemplate] =
    React.useState('{DomainName}-Document-{Random6}.{Ext}');
  const [attachment, setAttachment] = React.useState<File | null>(null);
  const [recipientsText, setRecipientsText] = React.useState('');

  const recipients = React.useMemo(
    () =>
      Array.from(
        new Set(
          recipientsText
            .split(/[\n,;\s]+/)
            .map((value) => value.trim().toLowerCase())
            .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        )
      ),
    [recipientsText]
  );

  React.useEffect(() => {
    if (!recipientsText.trim() && leadEmails.length) {
      setRecipientsText(leadEmails.join('\n'));
    }
  }, [leadEmails, recipientsText]);

  React.useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem('3d-suite-gmail-config');
      if (!raw) return;

      const saved = JSON.parse(raw) as {
        clientId?: string;
        clientSecret?: string;
        redirectUri?: string;
        chromiumUserDataDir?: string;
        chromiumExecutablePath?: string;
        extensionPath?: string;
        connectionMode?: 'chromium' | 'chromium-extension' | 'manual';
      };

      setGoogleClientId(String(saved.clientId || ''));
      setGoogleClientSecret(String(saved.clientSecret || ''));
      setGoogleRedirectUri(
        String(
          saved.redirectUri ||
            'http://localhost:7201/api/gmail/oauth/callback'
        )
      );
      setChromiumUserDataDir(
        String(saved.chromiumUserDataDir || '')
      );
      setChromiumExecutablePath(
        String(saved.chromiumExecutablePath || '')
      );
      setExtensionPath(String(saved.extensionPath || ''));
      setGmailConnectionMode(
        saved.connectionMode === 'manual'
          ? 'manual'
          : saved.connectionMode === 'chromium-extension'
            ? 'chromium-extension'
            : 'chromium'
      );
    } catch {}
  }, []);

  function saveGmailConfigToSession() {
    if (!googleClientId.trim() || !googleClientSecret.trim()) {
      onToast(
        'Google Client ID and Client Secret are required',
        'warning'
      );
      return;
    }

    try {
      window.sessionStorage.setItem(
        '3d-suite-gmail-config',
        JSON.stringify({
          clientId: googleClientId.trim(),
          clientSecret: googleClientSecret.trim(),
          redirectUri:
            googleRedirectUri.trim() ||
            'http://localhost:7201/api/gmail/oauth/callback',
          chromiumUserDataDir: chromiumUserDataDir.trim(),
          chromiumExecutablePath:
            chromiumExecutablePath.trim(),
          extensionPath: extensionPath.trim(),
          connectionMode: gmailConnectionMode,
        })
      );

      onToast('Gmail settings saved to session', 'success');
    } catch {
      onToast('Unable to save Gmail settings to session', 'error');
    }
  }

  function clearGmailConfigFromSession() {
    try {
      window.sessionStorage.removeItem('3d-suite-gmail-config');
    } catch {}

    setGoogleClientId('');
    setGoogleClientSecret('');
    setGoogleRedirectUri(
      'http://localhost:7201/api/gmail/oauth/callback'
    );
    setChromiumUserDataDir('');
    setChromiumExecutablePath('');
    setExtensionPath('');
    setGmailConnectionMode('chromium');
    setGmailOAuthUrl('');
    onToast('Gmail session settings cleared', 'success');
  }

  const refreshConnections = React.useCallback(async () => {
    try {
      const response = await fetch('/api/gmail/oauth/status', { cache: 'no-store' });
      const data = await parseApiJson<{
        accounts?: GmailConnectedAccount[];
        error?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(data.error || `Gmail status failed (HTTP ${response.status})`);
      }

      const accounts = data.accounts || [];
      setConnections(accounts);

      setGmailAccountCaps((prev) => {
        const next = { ...prev };

        for (const account of accounts) {
          if (!next[account.email]) {
            next[account.email] = {
              enabled: true,
              maxSends: 350,
            };
          }
        }

        for (const email of Object.keys(next)) {
          if (!accounts.some((account) => account.email === email)) {
            delete next[email];
          }
        }

        return next;
      });

      if (!selectedAccount && accounts.length) {
        setSelectedAccount(accounts[0].email);
      }
    } catch (error) {
      console.warn(
        'Gmail status refresh failed:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }, [selectedAccount]);

  const loadProfiles = React.useCallback(async () => {
    setLoadingProfiles(true);
    try {
      const profileUrl = chromiumUserDataDir.trim()
        ? `/api/gmail/chromium-profiles?userDataDir=${encodeURIComponent(
            chromiumUserDataDir.trim()
          )}`
        : '/api/gmail/chromium-profiles';

      const response = await fetch(profileUrl, {
        cache: 'no-store',
      });
      const data = await parseApiJson<{
        profiles?: GmailChromiumProfile[];
        error?: string;
      }>(response);

      if (!response.ok) {
        throw new Error(data.error || `Profile discovery failed (HTTP ${response.status})`);
      }

      const list = data.profiles || [];
      setProfiles(list);

      if (!selectedProfile && list.length) {
        setSelectedProfile(list[0].directory);
      }

      onLog('info', `Chromium profiles discovered: ${list.length}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onLog('error', `Chromium profile discovery failed: ${message}`);
      onToast(message, 'error');
    } finally {
      setLoadingProfiles(false);
    }
  }, [
    chromiumUserDataDir,
    onLog,
    onToast,
    selectedProfile,
  ]);

  React.useEffect(() => {
    // Check once when the Gmail panel is opened.
    // Further refreshes happen explicitly after connect/disconnect
    // or from the Refresh accounts button.
    void refreshConnections();
    // Intentionally run once for this mounted Gmail panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectGmail() {
    if (!googleClientId.trim()) {
      onToast('Google Client ID is required', 'warning');
      return;
    }

    if (!googleClientSecret.trim()) {
      onToast('Google Client Secret is required', 'warning');
      return;
    }

    if (!googleRedirectUri.trim()) {
      onToast('OAuth Redirect URI is required', 'warning');
      return;
    }

    if (
      gmailConnectionMode !== 'manual' &&
      !selectedProfile
    ) {
      onToast('Choose a Chromium profile first', 'warning');
      return;
    }

    setConnecting(true);
    try {
      const response = await fetch('/api/gmail/oauth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileDirectory: selectedProfile,
          extensionPath:
            gmailConnectionMode === 'chromium-extension'
              ? extensionPath.trim() || undefined
              : undefined,
          googleClientId: googleClientId.trim(),
          googleClientSecret: googleClientSecret.trim(),
          googleRedirectUri: googleRedirectUri.trim(),
          chromiumUserDataDir:
            chromiumUserDataDir.trim() || undefined,
          chromiumExecutablePath:
            chromiumExecutablePath.trim() || undefined,
          connectionMode: gmailConnectionMode,
        }),
      });

      const data = await parseApiJson<{
        success?: boolean;
        authorizationUrl?: string;
        mode?: 'chromium' | 'manual';
        error?: string;
      }>(response);

      if (!response.ok || !data.success) {
        throw new Error(data.error || `Gmail connection failed (HTTP ${response.status})`);
      }

      if (data.mode === 'manual' && data.authorizationUrl) {
        setGmailOAuthUrl(data.authorizationUrl);
        onLog(
          'info',
          'Google OAuth URL generated. Paste it into the Gmail/Chromium profile you want to connect.'
        );
        onToast('Google OAuth URL generated', 'success');
      } else {
        setGmailOAuthUrl('');
        onLog(
          'info',
          `Google OAuth opened in Chromium profile "${selectedProfile}"${
            gmailConnectionMode === 'chromium-extension' &&
            extensionPath.trim()
              ? ' with unpacked extension loaded'
              : ''
          }.`
        );
        onToast('Google OAuth opened in Chromium', 'success');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onLog('error', `Gmail connection failed: ${message}`);
      onToast(message, 'error');
    } finally {
      setConnecting(false);
    }
  }

  async function finishManualOAuth() {
    const callbackUrl = gmailCallbackUrl.trim();

    if (!callbackUrl) {
      onToast('Paste the full Google callback URL first', 'warning');
      return;
    }

    setFinishingManualOAuth(true);

    try {
      const response = await fetch('/api/gmail/oauth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackUrl }),
      });

      const data = await parseApiJson<{
        success?: boolean;
        email?: string;
        error?: string;
      }>(response);

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            `Gmail OAuth completion failed (HTTP ${response.status})`
        );
      }

      onLog(
        'success',
        `Gmail connected successfully: ${data.email || 'account connected'}`
      );
      onToast(
        `Gmail connected: ${data.email || 'success'}`,
        'success'
      );

      setGmailCallbackUrl('');
      setGmailOAuthUrl('');
      await refreshConnections();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      onLog(
        'error',
        `Manual Gmail OAuth completion failed: ${message}`
      );
      onToast(message, 'error');
    } finally {
      setFinishingManualOAuth(false);
    }
  }

  async function disconnectAccount(email: string) {
    try {
      const response = await fetch('/api/gmail/oauth/status', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await parseApiJson<{ success?: boolean; error?: string }>(response);
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gmail disconnect failed');
      }
      onLog('info', `Gmail disconnected: ${email}`);
      onToast('Gmail disconnected', 'success');
      await refreshConnections();
    } catch (error) {
      onToast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  function buildLogoDevUrl(domain: string): string {
    const normalizedDomain = domain
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0];

    if (!normalizedDomain || !logoDevKey.trim()) return '';

    const params = new URLSearchParams({
      token: logoDevKey.trim(),
      size: String(Math.min(800, Math.max(16, Math.floor(logoDevSize || 128)))),
      format: logoDevFormat,
      theme: logoDevTheme,
    });

    return `https://img.logo.dev/${encodeURIComponent(normalizedDomain)}?${params.toString()}`;
  }

  function previewHtmlWithLogo(): string {
    if (!bodyTemplate.trim()) {
      return '<html><body style="font-family:Arial,sans-serif;color:#64748b;padding:20px;">HTML preview will appear here.</body></html>';
    }

    if (!logoDevEnabled) return bodyTemplate;

    const logoUrl = buildLogoDevUrl(logoDevPreviewDomain);
    let html = bodyTemplate.replace(/\{CompanyLogo\}/gi, logoUrl);

    if (logoUrl && !/href=["']https:\/\/logo\.dev\/?["']/i.test(html)) {
      html += `
        <p style="font-size:11px;color:#888;margin-top:14px;">
          Logos provided by <a href="https://logo.dev">Logo.dev</a>
        </p>
      `;
    }

    return html;
  }

  async function sendGmail() {
    const enabledAccounts = connections
      .filter((account) => gmailAccountCaps[account.email]?.enabled)
      .map((account) => ({
        email: account.email,
        maxSends: Math.max(
          0,
          Math.floor(
            gmailAccountCaps[account.email]?.maxSends || 0
          )
        ),
      }))
      .filter((account) => account.maxSends > 0);

    if (gmailRotateAccounts) {
      if (!enabledAccounts.length) {
        onToast(
          'Enable at least one Gmail account with a send cap above 0',
          'warning'
        );
        return;
      }
    } else if (!selectedAccount) {
      onToast('Connect or select a Gmail account first', 'warning');
      return;
    }

    if (!recipients.length) {
      onToast('Add at least one valid recipient', 'warning');
      return;
    }

    setSending(true);

    try {
      const formData = new FormData();
      formData.append('accountEmail', selectedAccount);
      formData.append('recipients', JSON.stringify(recipients));
      formData.append('subjectTemplate', subjectTemplate);
      formData.append('bodyTemplate', bodyTemplate);
      formData.append('messageMode', gmailMessageMode);
      formData.append('logoDevEnabled', logoDevEnabled ? 'true' : 'false');
      formData.append('logoDevKey', logoDevKey.trim());
      formData.append('logoDevSize', String(logoDevSize));
      formData.append('logoDevFormat', logoDevFormat);
      formData.append('logoDevTheme', logoDevTheme);
      formData.append('attachmentNameTemplate', attachmentNameTemplate);
      formData.append('fromName', gmailFromName.trim());
      formData.append(
        'rotateAccounts',
        gmailRotateAccounts ? 'true' : 'false'
      );
      formData.append(
        'accountPlan',
        JSON.stringify(
          gmailRotateAccounts
            ? enabledAccounts
            : [
                {
                  email: selectedAccount,
                  maxSends:
                    gmailAccountCaps[selectedAccount]?.maxSends || 350,
                },
              ]
        )
      );

      if (attachment) {
        formData.append('attachment', attachment);
      }

      onLog(
        'info',
        gmailRotateAccounts
          ? `Gmail send started — ${recipients.length} recipient(s) across ${enabledAccounts.length} account(s)`
          : `Gmail send started — ${recipients.length} recipient(s) from ${selectedAccount}`
      );

      const response = await fetch('/api/gmail/send', {
        method: 'POST',
        body: formData,
      });

      const data = await parseApiJson<{
        success?: boolean;
        sentCount?: number;
        failedCount?: number;
        results?: Array<{
          index: number;
          total: number;
          recipient: string;
          accountEmail?: string;
          success: boolean;
          messageId?: string;
          error?: string;
        }>;
        error?: string;
      }>(response);

      if (!response.ok && !data.results) {
        throw new Error(data.error || `Gmail send failed (HTTP ${response.status})`);
      }

      for (const result of data.results || []) {
        onLog(
          result.success ? 'success' : 'error',
          result.success
            ? `${result.index}/${result.total} ✅ SENT — ${result.recipient} — via ${result.accountEmail || 'Gmail'} — messageId=${result.messageId || 'unknown'}`
            : `${result.index}/${result.total} ❌ FAILED — ${result.recipient} — via ${result.accountEmail || 'Gmail'} — ${result.error || 'unknown error'}`
        );
      }

      const sent = data.sentCount || 0;
      const failed = data.failedCount || 0;
      onLog(
        failed ? 'warning' : 'success',
        `Gmail complete — ${sent} sent, ${failed} failed, ${recipients.length} total`
      );
      onToast(
        failed ? `Gmail completed with ${failed} failure(s)` : 'Gmail send completed',
        failed ? 'warning' : 'success'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onLog('error', `Gmail send failed: ${message}`);
      onToast(message, 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid xl:grid-cols-2 gap-4">
      <Panel title="Gmail Connection">
        <div className="space-y-3 text-sm">
          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Gmail uses Google OAuth. Client ID and Client Secret are required.
            The redirect URI is required and is pre-filled for your local API.
            Chromium paths and the extension folder are optional.
          </div>

          <Field label="Google Client ID — required">
            <input
              className="input"
              value={googleClientId}
              onChange={(event) =>
                setGoogleClientId(event.target.value)
              }
              placeholder="xxxxxxxx.apps.googleusercontent.com"
            />
          </Field>

          <Field label="Google Client Secret — required">
            <input
              type="password"
              className="input"
              value={googleClientSecret}
              onChange={(event) =>
                setGoogleClientSecret(event.target.value)
              }
              placeholder="Google OAuth client secret"
            />
          </Field>

          <Field label="OAuth Redirect URI — required">
            <input
              className="input"
              value={googleRedirectUri}
              onChange={(event) =>
                setGoogleRedirectUri(event.target.value)
              }
            />
          </Field>

          <div className="text-xs text-slate-500 space-y-1">
            <div>
              Add this exact redirect URI to the Authorized redirect URIs
              for your Google OAuth client.
            </div>
            <div>
              The Client ID and Client Secret belong to your 3D Suite Google OAuth app,
              not to the Gmail account you are connecting. They cannot be read or
              generated from a Chromium/Gmail profile.
            </div>
          </div>

          <Field label="Chromium User Data directory — optional">
            <input
              className="input"
              value={chromiumUserDataDir}
              onChange={(event) =>
                setChromiumUserDataDir(event.target.value)
              }
              placeholder="Auto-detected, or C:\Users\Vergio\AppData\Local\Chromium\User Data"
              disabled={gmailConnectionMode === 'manual'}
            />
          </Field>

          <Field label="Chromium executable path — optional">
            <input
              className="input"
              value={chromiumExecutablePath}
              onChange={(event) =>
                setChromiumExecutablePath(event.target.value)
              }
              placeholder="Auto-detected, or C:\path\to\chromium\chrome.exe"
              disabled={gmailConnectionMode === 'manual'}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-emerald-600 px-3 py-2 text-xs text-white"
              onClick={saveGmailConfigToSession}
            >
              Save settings to session
            </button>
            <button
              type="button"
              className="rounded border border-red-300 px-3 py-2 text-xs text-red-600"
              onClick={clearGmailConfigFromSession}
            >
              Clear settings
            </button>
            <button
              type="button"
              className="rounded border px-3 py-2 text-xs"
              onClick={() => void loadProfiles()}
              disabled={loadingProfiles}
            >
              {loadingProfiles ? 'Scanning…' : 'Scan Chromium profiles'}
            </button>
          </div>

          <Field label="Connection mode">
            <div className="grid lg:grid-cols-3 gap-2">
              <button
                type="button"
                className={`rounded border px-3 py-2 text-left ${
                  gmailConnectionMode === 'chromium'
                    ? 'border-[#6C63FF] bg-violet-50 text-violet-700'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
                onClick={() => {
                  setGmailConnectionMode('chromium');
                  setGmailOAuthUrl('');
                }}
              >
                <div className="font-semibold">Existing Chromium profile</div>
                <div className="mt-1 text-xs opacity-75">
                  Open OAuth in an existing Chromium profile/session.
                </div>
              </button>

              <button
                type="button"
                className={`rounded border px-3 py-2 text-left ${
                  gmailConnectionMode === 'chromium-extension'
                    ? 'border-[#6C63FF] bg-violet-50 text-violet-700'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
                onClick={() => {
                  setGmailConnectionMode('chromium-extension');
                  setGmailOAuthUrl('');
                }}
              >
                <div className="font-semibold">Chromium profile + extension</div>
                <div className="mt-1 text-xs opacity-75">
                  Launch the selected profile with an unpacked extension.
                </div>
              </button>

              <button
                type="button"
                className={`rounded border px-3 py-2 text-left ${
                  gmailConnectionMode === 'manual'
                    ? 'border-[#6C63FF] bg-violet-50 text-violet-700'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
                onClick={() => setGmailConnectionMode('manual')}
              >
                <div className="font-semibold">Manual OAuth URL</div>
                <div className="mt-1 text-xs opacity-75">
                  Generate a URL and paste it into any Gmail/Chromium session.
                </div>
              </button>
            </div>
          </Field>

          {gmailConnectionMode === 'manual' && (
            <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
              Chromium profile, executable path, User Data directory, and extension
              folder are optional in Manual OAuth URL mode.
            </div>
          )}

          <Field label="Chromium profile">
            <select
              className="input"
              value={selectedProfile}
              disabled={gmailConnectionMode === 'manual'}
              onChange={(event) => setSelectedProfile(event.target.value)}
            >
              <option value="">
                {profiles.length
                  ? 'Choose Chromium profile'
                  : 'Click "Scan Chromium profiles" first'}
              </option>
              {profiles.map((profile) => (
                <option key={profile.directory} value={profile.directory}>
                  {profile.name} ({profile.directory})
                </option>
              ))}
            </select>
          </Field>

          {gmailConnectionMode === 'chromium-extension' && (
            <>
              <Field label="Unpacked extension folder — required for this mode">
                <input
                  className="input"
                  value={extensionPath}
                  onChange={(event) => setExtensionPath(event.target.value)}
                  placeholder="C:\path\to\extension"
                />
              </Field>

              <div className="text-xs text-slate-500">
                The extension folder must contain <code>manifest.json</code>.
              </div>
            </>
          )}

          <button
            type="button"
            className="rounded bg-[#6C63FF] px-3 py-2 text-white disabled:opacity-50"
            disabled={
              connecting ||
              !googleClientId.trim() ||
              !googleClientSecret.trim() ||
              !googleRedirectUri.trim() ||
              (gmailConnectionMode !== 'manual' && !selectedProfile) ||
              (gmailConnectionMode === 'chromium-extension' &&
                !extensionPath.trim())
            }
            onClick={() => void connectGmail()}
          >
            {connecting
              ? gmailConnectionMode === 'manual'
                ? 'Generating OAuth URL…'
                : 'Opening Google OAuth…'
              : gmailConnectionMode === 'manual'
                ? 'Generate OAuth URL'
                : gmailConnectionMode === 'chromium-extension'
                  ? 'Connect Gmail with Extension'
                  : 'Connect Gmail'}
          </button>

          {gmailConnectionMode === 'manual' && gmailOAuthUrl && (
            <div className="space-y-2 rounded border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-xs font-semibold text-emerald-800">
                Google OAuth URL
              </div>

              <textarea
                readOnly
                className="input min-h-28 text-xs"
                value={gmailOAuthUrl}
                onFocus={(event) => event.currentTarget.select()}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded bg-emerald-600 px-3 py-2 text-xs text-white"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(gmailOAuthUrl);
                      onToast('OAuth URL copied', 'success');
                    } catch {
                      onToast('Unable to copy OAuth URL', 'error');
                    }
                  }}
                >
                  Copy OAuth URL
                </button>

                <button
                  type="button"
                  className="rounded border border-emerald-400 px-3 py-2 text-xs text-emerald-800"
                  onClick={() =>
                    window.open(
                      gmailOAuthUrl,
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                >
                  Open OAuth URL
                </button>
              </div>

              <div className="text-xs text-emerald-800">
                Paste this URL into the Chromium/Gmail profile you want to connect.
                If that browser is on another PC, the final localhost page will not
                open there. Copy the full URL from its address bar and paste it below.
              </div>

              <div className="border-t border-emerald-200 pt-3 space-y-2">
                <div className="text-xs font-semibold text-emerald-800">
                  Paste OAuth callback URL from another PC
                </div>

                <textarea
                  className="input min-h-28 text-xs"
                  value={gmailCallbackUrl}
                  onChange={(event) =>
                    setGmailCallbackUrl(event.target.value)
                  }
                  placeholder="http://localhost:7201/api/gmail/oauth/callback?state=...&code=..."
                />

                <button
                  type="button"
                  className="rounded bg-[#6C63FF] px-3 py-2 text-xs text-white disabled:opacity-50"
                  disabled={
                    finishingManualOAuth || !gmailCallbackUrl.trim()
                  }
                  onClick={() => void finishManualOAuth()}
                >
                  {finishingManualOAuth
                    ? 'Finishing Gmail connection…'
                    : 'Finish Gmail Connection'}
                </button>
              </div>
            </div>
          )}

          <div className="border-t pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase text-slate-500">
                Connected Gmail accounts
              </div>

              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
                onClick={() => void refreshConnections()}
              >
                Refresh accounts
              </button>
            </div>

            {connections.length === 0 ? (
              <div className="text-xs text-slate-500">No Gmail accounts connected yet.</div>
            ) : (
              <div className="space-y-2">
                {connections.map((account) => (
                  <div
                    key={account.email}
                    className="flex items-center justify-between gap-3 rounded border border-slate-200 px-3 py-2"
                  >
                    <div>
                      <div className="font-medium text-slate-800">{account.email}</div>
                      {account.profileDirectory && (
                        <div className="text-xs text-slate-500">
                          Chromium: {account.profileDirectory}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-xs text-red-600"
                      onClick={() => void disconnectAccount(account.email)}
                    >
                      Disconnect
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Gmail Sender">
        <div className="space-y-3 text-sm">
          <Field label="From name">
            <input
              className="input"
              value={gmailFromName}
              onChange={(event) =>
                setGmailFromName(event.target.value)
              }
              placeholder="e.g. Accounts Department"
            />
          </Field>

          <label className="flex items-center gap-2 rounded border border-slate-200 p-3">
            <input
              type="checkbox"
              checked={gmailRotateAccounts}
              onChange={(event) =>
                setGmailRotateAccounts(event.target.checked)
              }
            />
            <span>
              <span className="font-medium">Rotate connected Gmail accounts</span>
              <span className="block text-xs text-slate-500">
                Distribute recipients round-robin across enabled accounts.
              </span>
            </span>
          </label>

          {!gmailRotateAccounts && (
            <Field label="Send from">
              <select
                className="input"
                value={selectedAccount}
                onChange={(event) =>
                  setSelectedAccount(event.target.value)
                }
              >
                <option value="">Choose connected Gmail account</option>
                {connections.map((account) => (
                  <option key={account.email} value={account.email}>
                    {account.email}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {gmailRotateAccounts && (
            <div className="space-y-2 rounded border border-slate-200 p-3">
              <div className="text-xs font-semibold uppercase text-slate-500">
                Account send caps
              </div>

              {connections.length === 0 ? (
                <div className="text-xs text-slate-500">
                  No connected Gmail accounts.
                </div>
              ) : (
                connections.map((account) => {
                  const config =
                    gmailAccountCaps[account.email] || {
                      enabled: true,
                      maxSends: 350,
                    };

                  return (
                    <div
                      key={account.email}
                      className="grid gap-2 sm:grid-cols-[1fr_130px] items-center rounded border border-slate-100 px-3 py-2"
                    >
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={(event) =>
                            setGmailAccountCaps((prev) => ({
                              ...prev,
                              [account.email]: {
                                ...config,
                                enabled: event.target.checked,
                              },
                            }))
                          }
                        />
                        <span>{account.email}</span>
                      </label>

                      <div>
                        <div className="mb-1 text-[11px] text-slate-500">
                          Max sends
                        </div>
                        <input
                          type="number"
                          min={0}
                          className="input"
                          value={config.maxSends}
                          onChange={(event) =>
                            setGmailAccountCaps((prev) => ({
                              ...prev,
                              [account.email]: {
                                ...config,
                                maxSends: Math.max(
                                  0,
                                  Number(event.target.value || 0)
                                ),
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          <Field label={`Recipients (${recipients.length})`}>
            <textarea
              className="input min-h-36"
              value={recipientsText}
              onChange={(event) => setRecipientsText(event.target.value)}
              placeholder="user1@example.com&#10;user2@example.com"
            />
          </Field>

          <Field label="Subject template">
            <input
              className="input"
              value={subjectTemplate}
              onChange={(event) => setSubjectTemplate(event.target.value)}
            />
          </Field>

          <Field label="Message format">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`rounded border px-3 py-2 text-sm ${
                  gmailMessageMode === 'text'
                    ? 'border-[#6C63FF] bg-violet-50 text-violet-700'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
                onClick={() => setGmailMessageMode('text')}
              >
                Plain Text
              </button>

              <button
                type="button"
                className={`rounded border px-3 py-2 text-sm ${
                  gmailMessageMode === 'html'
                    ? 'border-[#6C63FF] bg-violet-50 text-violet-700'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
                onClick={() => setGmailMessageMode('html')}
              >
                HTML
              </button>
            </div>
          </Field>

          <div
            className={`grid gap-3 ${
              gmailMessageMode === 'html'
                ? 'xl:grid-cols-2'
                : 'grid-cols-1'
            }`}
          >
            <Field
              label={
                gmailMessageMode === 'html'
                  ? 'HTML message'
                  : 'Message'
              }
            >
              <textarea
                className="input min-h-[320px] font-mono text-sm"
                value={bodyTemplate}
                onChange={(event) =>
                  setBodyTemplate(event.target.value)
                }
                placeholder={
                  gmailMessageMode === 'html'
                    ? '<html><body><h2>Hello</h2><p>Your message...</p></body></html>'
                    : 'Type your email message...'
                }
              />
            </Field>

            {gmailMessageMode === 'html' && (
              <Field label="Live HTML preview">
                <div className="overflow-hidden rounded border border-slate-300 bg-white">
                  <iframe
                    title="Gmail HTML preview"
                    className="h-[320px] w-full bg-white"
                    sandbox=""
                    srcDoc={previewHtmlWithLogo()}
                  />
                </div>
              </Field>
            )}
          </div>

          {gmailMessageMode === 'html' && (
            <div className="text-xs text-slate-500">
              Preview updates as you type. Placeholders such as
              {' '}<code>{'{Email}'}</code>,{' '}
              <code>{'{DomainName}'}</code>,{' '}
              <code>{'{Date}'}</code>,{' '}
              <code>{'{Random8}'}</code>, and{' '}
              <code>{'{CompanyLogo}'}</code> are resolved per recipient when sending.
            </div>
          )}

          {gmailMessageMode === 'html' && (
            <div className="space-y-3 rounded border border-slate-200 p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={logoDevEnabled}
                  onChange={(event) => setLogoDevEnabled(event.target.checked)}
                />
                <span>
                  <span className="font-medium">
                    Enable Logo.dev company logo autograb
                  </span>
                  <span className="block text-xs text-slate-500">
                    Replaces <code>{'{CompanyLogo}'}</code> using each recipient&apos;s domain.
                  </span>
                </span>
              </label>

              {logoDevEnabled && (
                <>
                  <Field label="Logo.dev Publishable Key">
                    <input
                      className="input"
                      value={logoDevKey}
                      onChange={(event) => setLogoDevKey(event.target.value)}
                      placeholder="pk_..."
                    />
                  </Field>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Logo size">
                      <input
                        type="number"
                        min={16}
                        max={800}
                        className="input"
                        value={logoDevSize}
                        onChange={(event) =>
                          setLogoDevSize(
                            Math.min(
                              800,
                              Math.max(16, Number(event.target.value || 128))
                            )
                          )
                        }
                      />
                    </Field>

                    <Field label="Format">
                      <select
                        className="input"
                        value={logoDevFormat}
                        onChange={(event) =>
                          setLogoDevFormat(event.target.value as 'png' | 'webp')
                        }
                      >
                        <option value="png">PNG</option>
                        <option value="webp">WebP</option>
                      </select>
                    </Field>

                    <Field label="Theme">
                      <select
                        className="input"
                        value={logoDevTheme}
                        onChange={(event) =>
                          setLogoDevTheme(
                            event.target.value as 'light' | 'dark' | 'auto'
                          )
                        }
                      >
                        <option value="auto">Auto</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                      </select>
                    </Field>
                  </div>

                  <Field label="Preview domain">
                    <input
                      className="input"
                      value={logoDevPreviewDomain}
                      onChange={(event) =>
                        setLogoDevPreviewDomain(event.target.value)
                      }
                      placeholder="example.com"
                    />
                  </Field>

                  <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    Free-tier attribution is automatically appended to HTML emails:
                    {' '}<a
                      href="https://logo.dev"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline"
                    >
                      Logos provided by Logo.dev
                    </a>
                  </div>
                </>
              )}
            </div>
          )}

          <Field label="Attachment">
            <input
              type="file"
              className="input"
              onChange={(event) => setAttachment(event.target.files?.[0] || null)}
            />
          </Field>

          <Field label="Attachment name template">
            <input
              className="input"
              value={attachmentNameTemplate}
              onChange={(event) => setAttachmentNameTemplate(event.target.value)}
            />
          </Field>

          <div className="text-xs text-slate-500 leading-5">
            Placeholders: <code>{'{Email}'}</code>, <code>{'{LocalPart}'}</code>,
            {' '}<code>{'{Domain}'}</code>, <code>{'{DomainName}'}</code>,
            {' '}<code>{'{Date}'}</code>, <code>{'{Random6}'}</code>,
            {' '}<code>{'{Random8}'}</code>, <code>{'{OriginalName}'}</code>,
            {' '}<code>{'{Ext}'}</code>.
          </div>

          <button
            type="button"
            className="rounded bg-[#6C63FF] px-3 py-2 text-white disabled:opacity-50"
            disabled={
              sending ||
              recipients.length === 0 ||
              (!gmailRotateAccounts && !selectedAccount) ||
              (gmailRotateAccounts &&
                !connections.some(
                  (account) =>
                    gmailAccountCaps[account.email]?.enabled &&
                    (gmailAccountCaps[account.email]?.maxSends || 0) > 0
                ))
            }
            onClick={() => void sendGmail()}
          >
            {sending ? 'Sending Gmail…' : 'Send Gmail'}
          </button>
        </div>
      </Panel>
    </div>
  );
}

function MockSenderPanel({
  sender,
  config,
  onConfigChange,
  onLog,
}: {
  sender: SenderKey;
  config: SenderConfig;
  onConfigChange: (next: Partial<SenderConfig>) => void;
  onLog: (message: string) => void;
}) {
  const senderLabel = SENDERS.find((entry) => entry.key === sender)?.label || sender;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel title={`${senderLabel} Connection`}>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={config.connected} onChange={(e) => onConfigChange({ connected: e.target.checked })} />
            Connected
          </label>
          <Field label="Template / Upload"><input className="input" value={config.design} onChange={(e) => onConfigChange({ design: e.target.value })} /></Field>
          <Field label="Sender Settings"><textarea rows={4} className="input" value={config.notes} onChange={(e) => onConfigChange({ notes: e.target.value })} /></Field>
        </div>
      </Panel>
      <Panel title={`${senderLabel} Automation Controls`}>
        <div className="space-y-2 text-sm">
          <Field label="Rate Delay (sec)"><input type="number" className="input" value={config.rateLimitDelay} onChange={(e) => onConfigChange({ rateLimitDelay: Number(e.target.value || 1) })} /></Field>
          <Field label="Run Notes"><input className="input" value={config.tempProvider} onChange={(e) => onConfigChange({ tempProvider: e.target.value })} /></Field>
          <button className="px-3 py-2 rounded bg-[#6C63FF] text-white" onClick={() => onLog(`${senderLabel} runtime settings updated`)}>
            Apply Config
          </button>
        </div>
      </Panel>
    </div>
  );
}

function modalTitle(modal: ModalKey | null) {
  const map: Record<ModalKey, string> = {
    credentials: 'Credentials',
    leads: 'Leads Management',
    settings: 'Settings',
    logs: 'Logs',
    'attach-host': 'Attach / Host',
    rmm: '3D RMM',
    browser: '3D Browser',
    antired: 'AntiRed + Landing',
    'redirect-generator': 'Redirect Generator',
    domains: 'Domains',
    'campaign-redirect': 'Campaign Redirect',
    payload: 'Payload',
    b2b: 'B2B Sender',
    blast: '3D Blast',
    'browser-proxy': 'Browser Proxy Settings',
  };
  return modal ? map[modal] : '';
}

function senderColor(sender: SenderKey | 'system') {
  if (sender === 'wetransfer') return '#60A5FA';
  if (sender === 'adobe') return '#F59E0B';
  if (sender === 'quickbooks') return '#34D399';
  if (sender === 'docusign') return '#F472B6';
  return '#A78BFA';
}

function levelColor(level: LogLevel) {
  if (level === 'success') return '#22C55E';
  if (level === 'warning') return '#F59E0B';
  if (level === 'error' || level === 'stopped') return '#EF4444';
  if (level === 'system') return '#A78BFA';
  return '#60A5FA';
}

function stepStatusColor(status: WeTransferStepStatus) {
  if (status === 'success') return '#22C55E';
  if (status === 'verification_received') return '#22C55E';
  if (status === 'upload_completed') return '#22C55E';
  if (status === 'send_confirmed') return '#22C55E';
  if (status === 'failed') return '#EF4444';
  if (status === 'stopped') return '#EF4444';
  if (status === 'opening_browser') return '#60A5FA';
  if (status === 'loading_wetransfer') return '#60A5FA';
  if (status === 'awaiting_sender_verification') return '#60A5FA';
  if (status === 'waiting_for_verification') return '#60A5FA';
  if (status === 'preparing_attachment') return '#60A5FA';
  if (status === 'upload_started') return '#60A5FA';
  if (status === 'send_submitted') return '#60A5FA';
  if (status === 'running') return '#60A5FA';
  return '#CBD5E1'; // pending
}

function stepStatusIcon(status: WeTransferStepStatus) {
  if (status === 'success') return '✓';
  if (status === 'verification_received') return '✓';
  if (status === 'upload_completed') return '✓';
  if (status === 'send_confirmed') return '✓';
  if (status === 'failed') return '✗';
  if (status === 'stopped') return '■';
  if (status === 'opening_browser') return '🌐';
  if (status === 'loading_wetransfer') return '↻';
  if (status === 'awaiting_sender_verification') return '✉';
  if (status === 'waiting_for_verification') return '⏳';
  if (status === 'preparing_attachment') return '📄';
  if (status === 'upload_started') return '↑';
  if (status === 'send_submitted') return '⇢';
  if (status === 'running') return '⟳';
  return '○';
}

function WeTransferStepsPanel({ session }: { session: WeTransferSessionState }) {
  if (session.status === 'idle') {
    return (
      <Panel title="WeTransfer Execution Steps">
        <p className="text-xs text-slate-400 italic">
          Steps will appear here when you click Send. Ensure your temp-mail.io API key is set in the Connection panel above.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="WeTransfer Execution Steps">
      <div className="space-y-1">
        {session.mailbox && (
          <div className="mb-2 text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 font-mono">
            Temp mailbox: {session.mailbox}
          </div>
        )}
        {session.mailboxMessageCount !== null && (
          <div className="mb-2 text-xs px-2 py-1 rounded bg-slate-50 text-slate-700">
            Mailbox messages: {session.mailboxMessageCount}
          </div>
        )}
        {session.attachment && (
          <div className="mb-2 text-xs px-2 py-2 rounded bg-slate-50 text-slate-700 space-y-1">
            <div className="font-semibold text-slate-800">Attachment</div>
            <div>Name: {session.attachment.name ?? 'none selected'}</div>
            <div>Source: {session.attachment.source}</div>
            <div>MIME: {session.attachment.mimeType ?? 'unknown'}</div>
            <div>Size: {formatBytes(session.attachment.sizeBytes)}</div>
            <div>Readiness: {session.attachment.readiness}</div>
          </div>
        )}
        {session.latestError && (
          <div className="mb-2 text-xs px-2 py-2 rounded bg-red-50 text-red-700">
            Latest error: {session.latestError}
          </div>
        )}
        {session.status === 'initializing' && session.steps.length === 0 && (
          <div className="text-xs text-slate-400 italic animate-pulse">Initialising session…</div>
        )}
        {session.steps.map((step) => (
          <div key={step.id} className="flex items-start gap-2 text-xs py-1 border-b border-slate-100 last:border-0">
            <span
              className="font-mono font-bold min-w-[16px] text-center"
              style={{ color: stepStatusColor(step.status) }}
            >
              {stepStatusIcon(step.status)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={step.status === 'running' ? 'font-semibold' : ''}>{step.label}</span>
                {step.status !== 'pending' && (
                  <span className="px-1 rounded bg-emerald-50 text-emerald-600 text-[10px]">REAL</span>
                )}
              </div>
              {step.detail && (
                <div className="text-slate-500 mt-0.5 truncate" title={step.detail}>{step.detail}</div>
              )}
            </div>
            <span className="text-slate-400 whitespace-nowrap">
              {step.timestamp ? formatTime(step.timestamp) : ''}
            </span>
          </div>
        ))}
        {session.status === 'failed' && (
          <div className="mt-2 text-xs text-red-600 font-semibold">
            Session failed. Check the log panel below.
          </div>
        )}
        {session.status === 'completed_with_errors' && (
          <div className="mt-2 text-xs text-amber-600 font-semibold">
            Run finished with unconfirmed or failed leads. Review the latest error and step details.
          </div>
        )}
      </div>
    </Panel>
  );
}
