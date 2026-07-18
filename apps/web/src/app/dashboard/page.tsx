'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Send,
  Upload,
  Users,
  BarChart3,
  Settings,
  FileText,
  Activity,
  ChevronRight,
  Circle,
  Wifi,
  WifiOff,
  RefreshCw,
  Play,
  Square,
  ToggleLeft,
  ToggleRight,
  List,
  LogOut,
  Database,
  Zap,
  AlertCircle,
  CheckCircle2,
  FileUp,
  X,
} from 'lucide-react';

type LogStatus = 'ok' | 'warn' | 'err';
type LogEntry = { time: string; status: LogStatus; msg: string };
type ProviderKey = 'wetransfer' | 'smash' | 'filemail';
type ProviderMeta = { key: ProviderKey; name: string; available: boolean; sends: number; quota: string };
type ActiveModal = 'leads' | 'providers' | 'analytics' | 'logs' | 'settings' | null;

type RuntimeEvent = {
  id: string;
  type: string;
  createdAt: string;
  details: Record<string, unknown>;
};

type SessionStats = {
  total: number;
  sent: number;
  pending: number;
  failed: number;
  status: 'idle' | 'running' | 'stopped';
};

type LocalSettings = {
  proxyHost: string;
  proxyPort: string;
  proxyUser: string;
  proxyPass: string;
  weTransferApiKey: string;
  smtpHost: string;
  smtpUser: string;
  smtpPass: string;
  maxRetries: string;
};

const DEFAULT_SETTINGS: LocalSettings = {
  proxyHost: '',
  proxyPort: '',
  proxyUser: '',
  proxyPass: '',
  weTransferApiKey: '',
  smtpHost: '',
  smtpUser: '',
  smtpPass: '',
  maxRetries: '3',
};

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Overview', icon: BarChart3, route: '/dashboard' },
  { id: 'crm-sender', label: 'CRM Sender', icon: Send, route: '/dashboard' },
  { id: 'campaigns', label: 'Campaigns', icon: FileText, route: '/campaigns' },
  { id: 'create-campaign', label: 'Create Campaign', icon: FileUp, route: '/campaigns/create' },
  { id: 'leads', label: 'Leads', icon: Users, modal: 'leads' as ActiveModal },
  { id: 'providers', label: 'Providers', icon: Database, modal: 'providers' as ActiveModal },
  { id: 'analytics', label: 'Analytics', icon: Activity, modal: 'analytics' as ActiveModal },
  { id: 'logs', label: 'Logs', icon: List, modal: 'logs' as ActiveModal },
  { id: 'settings', label: 'Settings', icon: Settings, modal: 'settings' as ActiveModal },
] as const;

function now() {
  return new Date().toTimeString().slice(0, 8);
}

function parseRecipients(input: string) {
  const lines = input.split('\n').map((l) => l.trim()).filter(Boolean);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const line of lines) {
    (emailRegex.test(line) ? valid : invalid).push(emailRegex.test(line) ? line.toLowerCase() : line);
  }
  return { valid, invalid, unique: Array.from(new Set(valid)) };
}

function inferNameFromEmail(email: string) {
  return email.split('@')[0]?.replace(/[._-]/g, ' ') || email;
}

function parseCsvText(text: string) {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rows.length < 2) return [];
  const headers = rows[0].split(',').map((h) => h.trim().toLowerCase());
  const emailIdx = headers.indexOf('email');
  if (emailIdx < 0) return [];
  return rows.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    return values[emailIdx] || '';
  }).filter(Boolean);
}

export default function DashboardPage() {
  const router = useRouter();

  // ── Core form state ──────────────────────────────────────────────────────
  const [activeNav, setActiveNav] = React.useState('crm-sender');
  const [running, setRunning] = React.useState(false);
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  const [recipients, setRecipients] = React.useState('');
  const [subject, setSubject] = React.useState('Campaign Brief — Q3 2025');
  const [message, setMessage] = React.useState(
    'Hi {{first_name}},\n\nPlease find the attached campaign brief for Q3.\n\nBest regards,\n3D+ Suite'
  );
  const [provider, setProvider] = React.useState<ProviderKey>('wetransfer');
  const [batchSize, setBatchSize] = React.useState('10');
  const [delay, setDelay] = React.useState('3');
  const [rotateIds, setRotateIds] = React.useState(false);
  const [draftSavedAt, setDraftSavedAt] = React.useState<string | null>(null);
  const [files, setFiles] = React.useState<File[]>([]);
  const [validationErrors, setValidationErrors] = React.useState<string[]>([]);
  const [systemMessage, setSystemMessage] = React.useState('Ready');
  const [apiConnected, setApiConnected] = React.useState(false);
  const [apiMode, setApiMode] = React.useState<'unknown' | 'database' | 'local-memory'>('unknown');
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [queuedCount, setQueuedCount] = React.useState(0);
  const [isProcessingCsv, setIsProcessingCsv] = React.useState(false);
  const [activeCampaignId, setActiveCampaignId] = React.useState<string | null>(null);
  const [runMode, setRunMode] = React.useState<'idle' | 'api' | 'simulated'>('idle');

  // ── WeTransfer file config ───────────────────────────────────────────────
  const [fileType, setFileType] = React.useState<'PDF' | 'PPTX' | 'DOCX' | 'ZIP'>('PDF');
  const [pdfOrientation, setPdfOrientation] = React.useState<'portrait' | 'landscape'>('portrait');

  // ── Resume semantics ─────────────────────────────────────────────────────
  // sentEmails persists across stop/start within the same browser session
  const [sentEmails, setSentEmails] = React.useState<Set<string>>(new Set());

  // ── Modal state ──────────────────────────────────────────────────────────
  const [activeModal, setActiveModal] = React.useState<ActiveModal>(null);
  const [runtimeEvents, setRuntimeEvents] = React.useState<RuntimeEvent[]>([]);
  const [sessionStats, setSessionStats] = React.useState<SessionStats | null>(null);
  const [localSettings, setLocalSettings] = React.useState<LocalSettings>(DEFAULT_SETTINGS);
  const [settingsSaved, setSettingsSaved] = React.useState(false);
  const [leadsInput, setLeadsInput] = React.useState('');
  const [isSyncingLeads, setIsSyncingLeads] = React.useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const csvInputRef = React.useRef<HTMLInputElement>(null);
  const leadsFileRef = React.useRef<HTMLInputElement>(null);
  const logEndRef = React.useRef<HTMLDivElement>(null);
  const simulationTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const appendLog = React.useCallback((status: LogStatus, msg: string) => {
    setLogs((prev) => [...prev, { time: now(), status, msg }]);
  }, []);

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  React.useEffect(() => {
    refreshConnectionState();
    return () => {
      if (simulationTimerRef.current) {
        clearInterval(simulationTimerRef.current);
        simulationTimerRef.current = null;
      }
    };
  }, []);

  // ── Connection & session restore ─────────────────────────────────────────
  async function refreshConnectionState() {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error(`Health check failed (${res.status})`);
      const health = await res.json();
      const mode = health?.mode === 'local-memory' ? 'local-memory' : 'database';
      setApiConnected(true);
      setApiMode(mode);
      setApiError(null);
      if (mode === 'local-memory') {
        setSystemMessage('API connected in local in-memory mode (no database persistence).');
        appendLog('warn', 'API health check passed in local in-memory mode');
      } else {
        setSystemMessage('API connected');
        appendLog('ok', 'API health check passed');
      }

      try {
        const hasLocalDraft = Boolean(localStorage.getItem('dashboard-draft'));
        if (!hasLocalDraft) {
          const sessionRes = await fetch('/api/dashboard/session');
          if (sessionRes.ok) {
            const sessionPayload = await sessionRes.json();
            const saved = sessionPayload?.data;
            if (saved) {
              setProvider(saved.provider || 'wetransfer');
              setBatchSize(saved.batchSize || '10');
              setDelay(saved.delay || '3');
              setRotateIds(Boolean(saved.rotateIds));
              setSubject(saved.subject || '');
              setMessage(saved.message || '');
              appendLog('warn', 'Restored dashboard session from runtime memory');
            }
          }
        }
      } catch { /* ignore optional */ }

      try {
        const campaignsRes = await fetch('/api/campaigns');
        if (campaignsRes.ok) {
          const campaigns = await campaignsRes.json();
          if (Array.isArray(campaigns)) {
            setQueuedCount(campaigns.filter((c: any) => c?.status === 'active').length);
          }
        }
      } catch { /* ignore optional */ }

      // Restore session settings from backend
      try {
        const settingsRes = await fetch('/api/session/settings');
        if (settingsRes.ok) {
          const settingsPayload = await settingsRes.json();
          if (settingsPayload?.settings) {
            setLocalSettings({ ...DEFAULT_SETTINGS, ...settingsPayload.settings });
          }
        }
      } catch { /* ignore optional */ }
    } catch (error: any) {
      const details = error?.message || 'Unknown connection error';
      setApiConnected(false);
      setApiMode('unknown');
      setApiError(details);
      setSystemMessage('Backend API unavailable. Local simulation mode is enabled.');
      appendLog('warn', `API unavailable (${details})`);
    }
  }

  async function syncDashboardSession(overrides?: Partial<{
    provider: ProviderKey; batchSize: string; delay: string; rotateIds: boolean;
    subject: string; message: string; recipients: string; files: File[];
  }>) {
    if (!apiConnected) return;
    try {
      await fetch('/api/dashboard/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: overrides?.provider ?? provider,
          batchSize: overrides?.batchSize ?? batchSize,
          delay: overrides?.delay ?? delay,
          rotateIds: overrides?.rotateIds ?? rotateIds,
          subject: overrides?.subject ?? subject,
          message: overrides?.message ?? message,
          recipientsCount: parseRecipients(overrides?.recipients ?? recipients).unique.length,
          files: (overrides?.files ?? files).map((f) => ({ name: f.name, size: f.size })),
        }),
      });
    } catch { /* keep responsive */ }
  }

  // ── File handling ────────────────────────────────────────────────────────
  function handleFilesSelected(nextFiles: FileList | File[]) {
    const selected = Array.from(nextFiles).filter((f) => f.size > 0);
    if (!selected.length) return;
    setFiles((prev) => {
      const byName = new Map(prev.map((f) => [f.name, f]));
      selected.forEach((f) => byName.set(f.name, f));
      return Array.from(byName.values());
    });
    appendLog('ok', `Selected ${selected.length} file(s)`);
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function handleCsvImport(event: React.ChangeEvent<HTMLInputElement>) {
    const csvFile = event.target.files?.[0];
    if (!csvFile) return;
    setIsProcessingCsv(true);
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      const res = await fetch('/api/upload/csv', { method: 'POST', body: formData });
      let importedEmails: string[] = [];
      if (res.ok) {
        const data = await res.json();
        importedEmails = (data.leads || []).map((lead: any) => lead.email).filter(Boolean);
      } else {
        importedEmails = parseCsvText(await csvFile.text());
      }
      if (!importedEmails.length) throw new Error('CSV import found no valid email rows');
      setRecipients((prev) => {
        const merged = [prev, ...importedEmails].filter(Boolean).join('\n');
        return Array.from(new Set(merged.split('\n').map((l) => l.trim()).filter(Boolean))).join('\n');
      });
      appendLog('ok', `Imported ${importedEmails.length} recipients from CSV`);
      setSystemMessage(`Imported ${importedEmails.length} recipients from CSV.`);
    } catch (error: any) {
      const msg = error?.message || 'Failed to import CSV';
      appendLog('err', msg);
      setSystemMessage(msg);
    } finally {
      setIsProcessingCsv(false);
      event.target.value = '';
    }
  }

  // ── Validation ───────────────────────────────────────────────────────────
  function validateForm() {
    const errors: string[] = [];
    if (!subject.trim()) errors.push('Subject is required.');
    if (!message.trim()) errors.push('Message is required.');
    if (!files.length) errors.push('At least one file must be selected.');
    const recipientData = parseRecipients(recipients);
    if (!recipientData.unique.length) errors.push('At least one valid recipient email is required.');
    if (recipientData.invalid.length) {
      errors.push(`Invalid recipients: ${recipientData.invalid.slice(0, 3).join(', ')}${recipientData.invalid.length > 3 ? '…' : ''}`);
    }
    const selectedProvider = providerMeta.find((e) => e.key === provider);
    if (selectedProvider && !selectedProvider.available) {
      errors.push(`${selectedProvider.name} is currently unavailable.`);
    }
    setValidationErrors(errors);
    return { errors, recipientData };
  }

  // ── Simulation with resume semantics ─────────────────────────────────────
  async function startSimulation(allEmails: string[], reason: string) {
    const currentSent = sentEmails;
    const unsentEmails = allEmails.filter((e) => !currentSent.has(e));

    if (unsentEmails.length === 0) {
      appendLog('warn', 'All recipients already sent this session. Nothing to resume.');
      setRunning(false);
      setRunMode('idle');
      return;
    }

    appendLog('warn', `Using simulated/test mode (${reason})`);
    if (allEmails.length !== unsentEmails.length) {
      appendLog('warn', `Resuming: ${currentSent.size} already sent, ${unsentEmails.length} remaining`);
    }

    setRunMode('simulated');
    setRunning(true);
    setSystemMessage('Campaign running in simulated mode.');

    // Notify backend of running status
    if (apiConnected) {
      fetch('/api/session/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'running' }),
      }).catch(() => {});
    }

    const snapshot = [...unsentEmails];
    let index = 0;
    const timerDelay = Math.max(Number(delay) * 1000, 500);

    if (simulationTimerRef.current) clearInterval(simulationTimerRef.current);

    simulationTimerRef.current = setInterval(() => {
      if (index >= snapshot.length) {
        clearInterval(simulationTimerRef.current!);
        simulationTimerRef.current = null;
        setRunning(false);
        setRunMode('idle');
        appendLog('ok', 'Simulated run completed');
        if (apiConnected) {
          fetch('/api/session/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'idle' }),
          }).catch(() => {});
        }
        return;
      }

      const email = snapshot[index];
      const isFailed = email.includes('invalid');
      const status: LogStatus = isFailed ? 'err' : 'ok';
      appendLog(status, `${isFailed ? 'Simulated failed' : 'Simulated sent'} → ${email}`);

      if (!isFailed) {
        // Mark as sent — persists across stop/start in this browser session
        setSentEmails((prev) => new Set([...prev, email]));
        // Sync to backend session leads
        if (apiConnected) {
          fetch('/api/session/leads', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails: [email] }),
          }).catch(() => {});
        }
      }
      index++;
    }, timerDelay);
  }

  // ── Campaign start/stop ──────────────────────────────────────────────────
  async function handleStartCampaign() {
    const { errors, recipientData } = validateForm();
    if (errors.length > 0) {
      setSystemMessage('Please fix validation errors before starting.');
      appendLog('err', 'Campaign start blocked by validation errors');
      return;
    }

    setValidationErrors([]);
    const unsent = recipientData.unique.filter((e) => !sentEmails.has(e));
    appendLog('ok', `Starting campaign: ${unsent.length} unsent of ${recipientData.unique.length} total recipients`);

    const baseCampaignPayload = {
      name: `Dashboard Campaign ${new Date().toLocaleString()}`,
      description: `Provider: ${provider}, batch: ${batchSize}, delay: ${delay}s, fileType: ${fileType}${fileType === 'PDF' ? ', orientation: ' + pdfOrientation : ''}`,
      templatePdfUrl: `/uploads/${files[0]?.name || 'dashboard-upload'}`,
      placeholders: ['email', 'name', 'first_name'],
      userId: 'dashboard-user',
    };

    if (!apiConnected) {
      await startSimulation(recipientData.unique, 'API offline');
      return;
    }

    try {
      const createRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(baseCampaignPayload),
      });
      if (!createRes.ok) throw new Error('Failed to create campaign in API');

      const createdCampaign = await createRes.json();
      const campaignId = createdCampaign.id as string;
      setActiveCampaignId(campaignId);

      const leadPayload = unsent.map((email) => ({ email, name: inferNameFromEmail(email) }));

      const leadsRes = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: leadPayload }),
      });
      if (!leadsRes.ok) throw new Error('Failed to import campaign leads');

      appendLog('ok', `Created campaign ${campaignId.slice(0, 8)} and imported ${leadPayload.length} leads`);

      const startRes = await fetch(`/api/campaigns/${campaignId}/start`, { method: 'POST' });
      const startBody = await startRes.json();

      if (startRes.ok) {
        setRunMode('api');
        setRunning(true);
        setSystemMessage(startBody.message || 'Campaign started successfully.');
        setQueuedCount((prev) => prev + 1);
        appendLog('ok', `API campaign started (${startBody.queued ?? 0} queued)`);
        // Kick off the visual simulation in parallel so the UI stays lively
        void startSimulation(recipientData.unique, 'api-backed simulation');
      } else {
        const backendErrors = Array.isArray(startBody.errors)
          ? startBody.errors.join('; ')
          : startBody.message;
        await startSimulation(recipientData.unique, backendErrors || 'start endpoint rejected request');
      }
    } catch (error: any) {
      await startSimulation(recipientData.unique, error?.message || 'unexpected API error');
    }
  }

  async function handleStopCampaign() {
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }

    if (runMode === 'api' && activeCampaignId) {
      try {
        const res = await fetch(`/api/campaigns/${activeCampaignId}/stop`, { method: 'POST' });
        const body = await res.json();
        if (res.ok) {
          appendLog('warn', `Campaign stopped (${body.jobsStopped ?? 0} jobs cancelled)`);
        } else {
          appendLog('err', body.message || 'Failed to stop API campaign cleanly');
        }
      } catch (error: any) {
        appendLog('err', `Error stopping campaign: ${error?.message || 'unknown error'}`);
      }
    } else {
      appendLog('warn', 'Simulated campaign stopped by user — sent leads are preserved for resume');
    }

    // Notify backend
    if (apiConnected) {
      fetch('/api/session/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'stopped' }),
      }).catch(() => {});
    }

    setRunning(false);
    setRunMode('idle');
    setSystemMessage(`Campaign stopped. ${sentEmails.size} leads sent. Click Start to resume remaining.`);
  }

  // ── Draft save ───────────────────────────────────────────────────────────
  function handleSaveDraft() {
    const payload = {
      provider, batchSize, delay, rotateIds, subject, message, recipients,
      files: files.map((f) => ({ name: f.name, size: f.size })),
    };
    localStorage.setItem('dashboard-draft', JSON.stringify(payload));
    const t = now();
    setDraftSavedAt(t);
    appendLog('ok', 'Draft saved locally');
    setSystemMessage(`Draft saved at ${t}`);
    void syncDashboardSession();
  }

  function clearLogs() { setLogs([]); }

  // ── Draft restore ────────────────────────────────────────────────────────
  React.useEffect(() => {
    const raw = localStorage.getItem('dashboard-draft');
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      setProvider(draft.provider || 'wetransfer');
      setBatchSize(draft.batchSize || '10');
      setDelay(draft.delay || '3');
      setRotateIds(Boolean(draft.rotateIds));
      setSubject(draft.subject || '');
      setMessage(draft.message || '');
      setRecipients(draft.recipients || '');
      if (Array.isArray(draft.files) && draft.files.length) {
        appendLog('warn', 'Draft restored (reselect file attachments before sending)');
      }
    } catch { /* ignore invalid */ }
  }, [appendLog]);

  // ── Derived counts ───────────────────────────────────────────────────────
  const sentCount = sentEmails.size;
  const failCount = logs.filter((e) => e.status === 'err').length;
  const totalRecipients = parseRecipients(recipients).unique.length;
  const remainingCount = Math.max(totalRecipients - sentCount, 0);

  const providerMeta: ProviderMeta[] = [
    { key: 'wetransfer', name: 'WeTransfer', available: apiConnected, sends: sentCount, quota: '∞' },
    { key: 'smash', name: 'Smash.io', available: true, sends: Math.max(Math.floor(sentCount / 2), 0), quota: '20 GB' },
    { key: 'filemail', name: 'Filemail', available: false, sends: 0, quota: '—' },
  ];

  // ── Modal data fetchers ──────────────────────────────────────────────────
  async function fetchModalData(modal: ActiveModal) {
    if (modal === 'logs' || modal === 'analytics') {
      try {
        const evRes = await fetch('/api/session/logs?limit=100');
        if (evRes.ok) {
          const payload = await evRes.json();
          setRuntimeEvents(Array.isArray(payload.events) ? payload.events : []);
        }
      } catch { /* ignore */ }
    }
    if (modal === 'analytics') {
      try {
        const aRes = await fetch('/api/session/analytics');
        if (aRes.ok) {
          const payload = await aRes.json();
          setSessionStats(payload.stats || null);
        }
      } catch { /* ignore */ }
    }
    if (modal === 'settings') {
      try {
        const sRes = await fetch('/api/session/settings');
        if (sRes.ok) {
          const payload = await sRes.json();
          if (payload.settings) setLocalSettings({ ...DEFAULT_SETTINGS, ...payload.settings });
        }
      } catch { /* ignore */ }
    }
  }

  function openModal(modal: ActiveModal) {
    setActiveModal(modal);
    if (modal) void fetchModalData(modal);
  }

  // ── Leads modal helpers ──────────────────────────────────────────────────
  async function handleAddLeads() {
    const lines = leadsInput.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setIsSyncingLeads(true);
    try {
      // Merge into recipients textarea
      setRecipients((prev) => {
        const merged = [prev, ...lines].filter(Boolean).join('\n');
        return Array.from(new Set(merged.split('\n').map((l) => l.trim()).filter(Boolean))).join('\n');
      });
      // Sync to backend
      if (apiConnected) {
        await fetch('/api/session/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines }),
        });
      }
      appendLog('ok', `Added ${lines.length} lead(s) to session`);
      setLeadsInput('');
    } finally {
      setIsSyncingLeads(false);
    }
  }

  async function handleLeadsFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      setLeadsInput((prev) => {
        const merged = [prev, ...lines].filter(Boolean).join('\n');
        return merged;
      });
      appendLog('ok', `Loaded ${lines.length} lines from ${f.name}`);
    } catch {
      appendLog('err', 'Failed to read leads file');
    } finally {
      event.target.value = '';
    }
  }

  // ── Settings save ────────────────────────────────────────────────────────
  async function handleSaveSettings() {
    if (apiConnected) {
      try {
        await fetch('/api/session/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localSettings),
        });
      } catch { /* ignore */ }
    }
    localStorage.setItem('local-settings', JSON.stringify(localSettings));
    setSettingsSaved(true);
    appendLog('ok', 'Local settings saved');
    setTimeout(() => setSettingsSaved(false), 2000);
  }

  // Restore settings from localStorage on mount
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('local-settings');
      if (raw) setLocalSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0b0404', color: '#e2d6d6' }}>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="flex flex-col w-52 shrink-0 border-r" style={{ background: '#100505', borderColor: '#2d1010' }}>
        <div className="flex items-center gap-2 px-4 py-4 border-b" style={{ borderColor: '#2d1010' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black"
            style={{ background: 'linear-gradient(135deg,#c0392b,#7b1a1a)', color: '#fff' }}>
            3D+
          </div>
          <span className="font-bold text-sm tracking-wide" style={{ color: '#f0e0e0' }}>3D+ Suite</span>
        </div>

        <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveNav(item.id);
                  if ('modal' in item && item.modal) {
                    openModal(item.modal);
                    return;
                  }
                  if ('route' in item && item.route) {
                    router.push(item.route);
                    appendLog('ok', `Navigated to ${item.label}`);
                  }
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-all text-left"
                style={isActive
                  ? { background: '#3b1111', color: '#f87171', borderLeft: '2px solid #ef4444' }
                  : { color: '#9a7272' }}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {item.label}
                {isActive && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
              </button>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t space-y-1" style={{ borderColor: '#2d1010' }}>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs" style={{ color: '#6b4444' }}>
            <Zap className="w-3.5 h-3.5" /><span>v1.2.0-local</span>
          </div>
          <button
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition"
            style={{ color: '#9a7272' }}
            onClick={() => {
              setSystemMessage('Disconnected from current dashboard session.');
              appendLog('warn', 'Session disconnected');
              setRunning(false);
              setRunMode('idle');
            }}
          >
            <LogOut className="w-3.5 h-3.5" />Disconnect
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-2.5 border-b shrink-0"
          style={{ background: '#120606', borderColor: '#2d1010' }}>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold" style={{ color: '#f0e0e0' }}>CRM Sender</span>
            <span className="text-xs px-2 py-0.5 rounded-full border"
              style={{ borderColor: '#3b1111', color: '#f87171', background: '#1f0a0a' }}>
              {runMode === 'simulated' ? 'SIMULATED' : 'BETA'}
            </span>
            {apiMode === 'local-memory' && (
              <span className="text-xs px-2 py-0.5 rounded-full border"
                style={{ borderColor: '#7f1d1d', color: '#fca5a5', background: '#2a0b0b' }}>
                LOCAL MODE (NO DB)
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <select value={provider}
              onChange={(e) => {
                const v = e.target.value as ProviderKey;
                setProvider(v);
                appendLog('ok', `Provider changed to ${v}`);
                void syncDashboardSession({ provider: v });
              }}
              className="text-xs px-2 py-1 rounded border outline-none"
              style={{ background: '#1c0a0a', borderColor: '#3b1111', color: '#d4a0a0' }}>
              <option value="wetransfer">WeTransfer</option>
              <option value="smash">Smash.io</option>
              <option value="filemail">Filemail</option>
            </select>
            <select value={batchSize} onChange={(e) => setBatchSize(e.target.value)}
              className="text-xs px-2 py-1 rounded border outline-none"
              style={{ background: '#1c0a0a', borderColor: '#3b1111', color: '#d4a0a0' }}>
              {['5','10','25','50','100'].map((v) => (
                <option key={v} value={v}>Batch: {v}</option>
              ))}
            </select>
            <select value={delay} onChange={(e) => setDelay(e.target.value)}
              className="text-xs px-2 py-1 rounded border outline-none"
              style={{ background: '#1c0a0a', borderColor: '#3b1111', color: '#d4a0a0' }}>
              {['1','2','3','5','10'].map((v) => (
                <option key={v} value={v}>Delay: {v}s</option>
              ))}
            </select>
            <button
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition"
              style={{ borderColor: '#3b1111', color: '#d4a0a0', background: '#1c0a0a' }}
              onClick={() => setRotateIds((p) => !p)}>
              {rotateIds ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
              Rotate IDs
            </button>
            <button className="p-1.5 rounded border transition"
              style={{ borderColor: '#2d1010', color: '#9a7272', background: '#1c0a0a' }}
              onClick={refreshConnectionState} title="Refresh connection">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Status bar */}
        <div className="flex items-center gap-6 px-5 py-1.5 border-b shrink-0 text-xs"
          style={{ background: '#0f0505', borderColor: '#2d1010' }}>
          <StatusDot color={apiConnected ? '#22c55e' : '#ef4444'} label={apiConnected ? 'API Connected' : 'API Offline'} />
          <StatusDot color="#f59e0b" label={`Queue: ${queuedCount} active`} />
          <StatusDot color={running ? '#22c55e' : '#6b7280'} label={running ? `Running (${runMode})` : 'Idle'} />
          <span style={{ color: '#6b4444', marginLeft: 'auto' }}>
            Sent: <span style={{ color: '#f87171' }}>{sentCount}</span>
            &nbsp;·&nbsp;Remaining: <span style={{ color: '#fbbf24' }}>{remainingCount}</span>
            &nbsp;·&nbsp;Failed: <span style={{ color: '#ef4444' }}>{failCount}</span>
          </span>
        </div>

        {/* Provider chips */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b shrink-0 overflow-x-auto"
          style={{ background: '#0e0505', borderColor: '#2d1010' }}>
          {providerMeta.map((entry) => {
            const active = provider === entry.key;
            return (
              <div key={entry.key}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs shrink-0"
                style={{
                  borderColor: active ? '#ef4444' : entry.available ? '#1f3d1f' : '#3b1111',
                  background: active ? '#2f0909' : entry.available ? '#0d1f0d' : '#1a0a0a',
                }}>
                {entry.available
                  ? <Wifi className="w-3 h-3" style={{ color: '#22c55e' }} />
                  : <WifiOff className="w-3 h-3" style={{ color: '#6b4444' }} />}
                <span style={{ color: entry.available ? '#86efac' : '#7a4444' }}>{entry.name}</span>
                {entry.available && <span style={{ color: '#4b7a4b' }}>· {entry.sends} sent</span>}
                <span style={{ color: '#6b4444' }}>· {entry.quota}</span>
              </div>
            );
          })}
        </div>

        {apiError && (
          <div className="px-5 py-2 text-xs border-b"
            style={{ borderColor: '#3b1111', background: '#230808', color: '#fca5a5' }}>
            Backend error: {apiError}
          </div>
        )}

        {/* Body: sender panel + log panel */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Sender panel */}
          <div className="flex flex-col flex-1 min-w-0 overflow-y-auto p-5 gap-4 border-r"
            style={{ borderColor: '#2d1010' }}>
            <h2 className="text-sm font-semibold tracking-wide" style={{ color: '#f0e0e0' }}>
              {providerMeta.find((e) => e.key === provider)?.name || 'Provider'} Sender
            </h2>

            {/* File upload zone */}
            <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 cursor-pointer transition hover:border-red-700"
              style={{ borderColor: '#3b1111', background: '#130606' }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFilesSelected(e.dataTransfer.files); }}>
              <input ref={fileInputRef} type="file" multiple className="hidden"
                onChange={(e) => { if (e.target.files) { handleFilesSelected(e.target.files); e.target.value = ''; } }} />
              <Upload className="w-8 h-8" style={{ color: '#6b4444' }} />
              <span className="text-xs" style={{ color: '#9a7272' }}>
                Drop files or <span style={{ color: '#f87171' }}>browse</span>
              </span>
              <span className="text-xs" style={{ color: '#5a3333' }}>PDF, ZIP, DOCX — max 2 GB</span>
            </div>

            {/* WeTransfer file type + PDF orientation */}
            {provider === 'wetransfer' && (
              <div className="flex gap-3">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs font-medium" style={{ color: '#9a7272' }}>File Type</label>
                  <select value={fileType} onChange={(e) => setFileType(e.target.value as typeof fileType)}
                    className="text-xs px-2 py-1.5 rounded border outline-none"
                    style={{ background: '#130606', borderColor: '#3b1111', color: '#d4a0a0' }}>
                    <option value="PDF">PDF Document</option>
                    <option value="PPTX">PPTX (PowerPoint)</option>
                    <option value="DOCX">DOCX (Word)</option>
                    <option value="ZIP">ZIP Archive</option>
                  </select>
                </div>
                {fileType === 'PDF' && (
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-xs font-medium" style={{ color: '#9a7272' }}>PDF Orientation</label>
                    <select value={pdfOrientation} onChange={(e) => setPdfOrientation(e.target.value as typeof pdfOrientation)}
                      className="text-xs px-2 py-1.5 rounded border outline-none"
                      style={{ background: '#130606', borderColor: '#3b1111', color: '#d4a0a0' }}>
                      <option value="portrait">Vertical (Portrait)</option>
                      <option value="landscape">Horizontal (Landscape)</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {files.length > 0 && (
              <div className="border rounded-md p-2" style={{ borderColor: '#3b1111', background: '#0f0505' }}>
                <p className="text-xs mb-1" style={{ color: '#9a7272' }}>Selected files</p>
                <div className="space-y-1">
                  {files.map((f) => (
                    <div key={f.name} className="flex items-center justify-between text-xs">
                      <span style={{ color: '#d4a0a0' }}>{f.name} ({Math.max(f.size / 1024 / 1024, 0.01).toFixed(2)} MB)</span>
                      <button onClick={() => removeFile(f.name)} style={{ color: '#f87171' }}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#9a7272' }}>Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)}
                className="text-xs px-3 py-2 rounded border outline-none w-full"
                style={{ background: '#130606', borderColor: '#3b1111', color: '#e2d6d6' }} />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#9a7272' }}>
                Message <span style={{ color: '#5a3333' }}>(supports {'{{first_name}}'})</span>
              </label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
                className="text-xs px-3 py-2 rounded border outline-none w-full resize-none"
                style={{ background: '#130606', borderColor: '#3b1111', color: '#e2d6d6' }} />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium" style={{ color: '#9a7272' }}>
                  Recipients <span style={{ color: '#5a3333' }}>(one email per line)</span>
                </label>
                <div className="flex items-center gap-2">
                  <button className="text-xs" style={{ color: '#94a3b8' }}
                    onClick={() => openModal('leads')}>
                    Manage Leads ↗
                  </button>
                  <button className="text-xs disabled:opacity-60" style={{ color: '#f87171' }}
                    disabled={isProcessingCsv} onClick={() => csvInputRef.current?.click()}>
                    {isProcessingCsv ? 'Importing…' : 'Import CSV'}
                  </button>
                  <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
                </div>
              </div>
              <textarea value={recipients} onChange={(e) => setRecipients(e.target.value)} rows={5}
                className="text-xs px-3 py-2 rounded border outline-none w-full resize-none font-mono"
                style={{ background: '#130606', borderColor: '#3b1111', color: '#d4a0a0' }} />
              <div className="flex items-center justify-between text-xs" style={{ color: '#5a3333' }}>
                <span>{totalRecipients} recipients loaded · {sentCount} sent · {remainingCount} remaining</span>
                {sentCount > 0 && !running && (
                  <span style={{ color: '#86efac' }}>↺ Resume available</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 rounded border px-2 py-2"
                style={{ borderColor: '#3b1111', background: '#130606' }}>
                {validationErrors.length === 0
                  ? <CheckCircle2 className="w-4 h-4" style={{ color: '#22c55e' }} />
                  : <AlertCircle className="w-4 h-4" style={{ color: '#ef4444' }} />}
                <span className="text-xs" style={{ color: '#9a7272' }}>{systemMessage}</span>
              </div>
              <div className="flex items-center justify-end text-xs" style={{ color: '#6b4444' }}>
                {draftSavedAt ? `Last draft: ${draftSavedAt}` : 'No saved draft'}
              </div>
            </div>

            {validationErrors.length > 0 && (
              <div className="rounded border px-3 py-2" style={{ borderColor: '#7f1d1d', background: '#220909' }}>
                <p className="text-xs mb-1" style={{ color: '#fca5a5' }}>Validation errors</p>
                <ul className="space-y-1 list-disc pl-4 text-xs" style={{ color: '#fca5a5' }}>
                  {validationErrors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </div>
            )}

            <div className="flex gap-3 mt-auto pt-2">
              <button onClick={running ? handleStopCampaign : handleStartCampaign}
                className="flex items-center gap-2 px-5 py-2 rounded-md text-sm font-semibold transition"
                style={running
                  ? { background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b' }
                  : { background: '#c0392b', color: '#fff', border: '1px solid #e74c3c' }}>
                {running
                  ? <><Square className="w-4 h-4" /> Stop Campaign</>
                  : <><Play className="w-4 h-4" />{sentCount > 0 ? 'Resume Campaign' : 'Start Campaign'}</>}
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-md text-sm transition border"
                style={{ borderColor: '#3b1111', color: '#9a7272', background: '#130606' }}
                onClick={handleSaveDraft}>
                Save Draft
              </button>
            </div>
          </div>

          {/* Log panel */}
          <div className="flex flex-col w-96 shrink-0 overflow-hidden" style={{ background: '#040f04' }}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
              style={{ borderColor: '#0f2b0f', background: '#060e06' }}>
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" style={{ color: '#22c55e' }} />
                <span className="text-xs font-semibold" style={{ color: '#4ade80' }}>Output Log</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: '#166534' }}>{logs.length} entries</span>
                <button onClick={clearLogs}
                  className="text-xs px-2 py-0.5 rounded border transition"
                  style={{ borderColor: '#0f2b0f', color: '#4b7a4b', background: '#060e06' }}>
                  Clear
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 font-mono text-xs space-y-0.5">
              {logs.length === 0 && (
                <div style={{ color: '#1a4d1a' }} className="text-center pt-10">— No output yet —</div>
              )}
              {logs.map((log, i) => (
                <div key={`${log.time}-${i}`} className="flex gap-2 leading-5">
                  <span className="shrink-0 select-none" style={{ color: '#1a4d1a' }}>{log.time}</span>
                  <span className="shrink-0 select-none w-4 text-center"
                    style={{ color: log.status === 'ok' ? '#22c55e' : log.status === 'warn' ? '#f59e0b' : '#ef4444' }}>
                    {log.status === 'ok' ? '›' : log.status === 'warn' ? '!' : '✗'}
                  </span>
                  <span style={{
                    color: log.status === 'ok' ? '#4ade80' : log.status === 'warn' ? '#fbbf24' : '#f87171',
                    textShadow: log.status === 'ok' ? '0 0 6px rgba(34,197,94,0.4)' : undefined,
                  }}>
                    {log.msg}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>

            <div className="grid grid-cols-3 gap-0 border-t shrink-0"
              style={{ borderColor: '#0f2b0f', background: '#060e06' }}>
              <StatCell label="Sent" value={sentCount} color="#4ade80" />
              <StatCell label="Remaining" value={remainingCount} color="#fbbf24" border />
              <StatCell label="Failed" value={failCount} color="#f87171" border />
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {activeModal && (
        <ModalOverlay title={
          activeModal === 'leads' ? 'Session Leads' :
          activeModal === 'providers' ? 'Providers' :
          activeModal === 'analytics' ? 'Session Analytics' :
          activeModal === 'logs' ? 'Session Logs' : 'Local Configuration'
        } onClose={() => setActiveModal(null)}>

          {/* Leads Modal */}
          {activeModal === 'leads' && (
            <div className="space-y-4">
              <div className="flex gap-3 text-sm" style={{ color: '#9a7272' }}>
                <div className="flex-1 text-center rounded border py-2" style={{ borderColor: '#2d1010', background: '#130606' }}>
                  <div className="text-lg font-bold" style={{ color: '#f0e0e0' }}>{totalRecipients}</div>
                  <div className="text-xs">Total Loaded</div>
                </div>
                <div className="flex-1 text-center rounded border py-2" style={{ borderColor: '#1f3d1f', background: '#0d1f0d' }}>
                  <div className="text-lg font-bold" style={{ color: '#4ade80' }}>{sentCount}</div>
                  <div className="text-xs">Sent</div>
                </div>
                <div className="flex-1 text-center rounded border py-2" style={{ borderColor: '#3b1111', background: '#1a0a0a' }}>
                  <div className="text-lg font-bold" style={{ color: '#fbbf24' }}>{remainingCount}</div>
                  <div className="text-xs">Remaining</div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium" style={{ color: '#9a7272' }}>
                    Paste leads (one email per line)
                  </label>
                  <div className="flex items-center gap-2">
                    <button className="text-xs px-2 py-0.5 rounded border"
                      style={{ borderColor: '#3b1111', color: '#f87171', background: '#1a0a0a' }}
                      onClick={() => leadsFileRef.current?.click()}>
                      Upload .txt
                    </button>
                    <input ref={leadsFileRef} type="file" accept=".txt,.csv" className="hidden"
                      onChange={handleLeadsFileUpload} />
                  </div>
                </div>
                <textarea value={leadsInput} onChange={(e) => setLeadsInput(e.target.value)} rows={8}
                  placeholder="user1@example.com&#10;user2@example.com&#10;..."
                  className="text-xs px-3 py-2 rounded border outline-none w-full resize-none font-mono"
                  style={{ background: '#0b0404', borderColor: '#3b1111', color: '#d4a0a0' }} />
                <span className="text-xs" style={{ color: '#5a3333' }}>
                  {leadsInput.split('\n').filter((l) => l.trim()).length} lines entered
                </span>
              </div>

              <button
                onClick={handleAddLeads}
                disabled={isSyncingLeads || !leadsInput.trim()}
                className="w-full py-2 rounded-md text-sm font-semibold transition disabled:opacity-50"
                style={{ background: '#c0392b', color: '#fff', border: '1px solid #e74c3c' }}>
                {isSyncingLeads ? 'Adding…' : 'Add to Session'}
              </button>

              {totalRecipients > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium" style={{ color: '#9a7272' }}>Current session leads (preview)</p>
                  <div className="rounded border overflow-hidden" style={{ borderColor: '#2d1010' }}>
                    {parseRecipients(recipients).unique.slice(0, 10).map((email) => (
                      <div key={email} className="flex items-center justify-between px-2 py-1 border-b text-xs"
                        style={{ borderColor: '#1a0808', background: '#0b0404' }}>
                        <span style={{ color: '#d4a0a0' }}>{email}</span>
                        <span style={{ color: sentEmails.has(email) ? '#4ade80' : '#6b4444' }}>
                          {sentEmails.has(email) ? '✓ sent' : 'pending'}
                        </span>
                      </div>
                    ))}
                    {totalRecipients > 10 && (
                      <div className="px-2 py-1 text-xs text-center" style={{ color: '#5a3333' }}>
                        +{totalRecipients - 10} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Providers Modal */}
          {activeModal === 'providers' && (
            <div className="space-y-3">
              {providerMeta.map((entry) => (
                <div key={entry.key} className="rounded border p-3"
                  style={{ borderColor: entry.available ? '#1f3d1f' : '#3b1111', background: '#130606' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold" style={{ color: '#f0e0e0' }}>{entry.name}</span>
                    <div className="flex items-center gap-1.5 text-xs"
                      style={{ color: entry.available ? '#4ade80' : '#7a4444' }}>
                      {entry.available
                        ? <><Wifi className="w-3 h-3" /> Available</>
                        : <><WifiOff className="w-3 h-3" /> Unavailable</>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: '#9a7272' }}>
                    <div>Sent this session: <span style={{ color: '#f87171' }}>{entry.sends}</span></div>
                    <div>Quota: <span style={{ color: '#d4a0a0' }}>{entry.quota}</span></div>
                  </div>
                  {entry.key === 'wetransfer' && (
                    <p className="text-xs mt-2" style={{ color: '#5a3333' }}>
                      WeTransfer is available when the API is connected. Requires WETRANSFER_API_KEY in production.
                    </p>
                  )}
                  {entry.key === 'smash' && (
                    <p className="text-xs mt-2" style={{ color: '#5a3333' }}>
                      Smash.io free tier active. Up to 20 GB per transfer.
                    </p>
                  )}
                  {entry.key === 'filemail' && (
                    <p className="text-xs mt-2" style={{ color: '#5a3333' }}>
                      Filemail integration coming soon.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Analytics Modal */}
          {activeModal === 'analytics' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Total Recipients', value: totalRecipients, color: '#f0e0e0' },
                  { label: 'Sent This Session', value: sentCount, color: '#4ade80' },
                  { label: 'Remaining', value: remainingCount, color: '#fbbf24' },
                  { label: 'Failed', value: failCount, color: '#f87171' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded border p-3 text-center"
                    style={{ borderColor: '#2d1010', background: '#130606' }}>
                    <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
                    <div className="text-xs mt-1" style={{ color: '#9a7272' }}>{stat.label}</div>
                  </div>
                ))}
              </div>

              <div className="rounded border p-3" style={{ borderColor: '#2d1010', background: '#130606' }}>
                <div className="flex items-center justify-between text-xs mb-2" style={{ color: '#9a7272' }}>
                  <span>Session status</span>
                  <span style={{ color: running ? '#4ade80' : '#f87171' }}>
                    {running ? '● Running' : sentCount > 0 ? '◉ Stopped (resume available)' : '○ Idle'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs" style={{ color: '#9a7272' }}>
                  <span>API mode</span>
                  <span style={{ color: '#fbbf24' }}>{apiMode}</span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1" style={{ color: '#9a7272' }}>
                  <span>Active provider</span>
                  <span style={{ color: '#d4a0a0' }}>{provider}</span>
                </div>
              </div>

              {sessionStats && (
                <div className="rounded border p-3" style={{ borderColor: '#2d1010', background: '#0b0404' }}>
                  <p className="text-xs font-medium mb-2" style={{ color: '#9a7272' }}>Backend Session (API)</p>
                  <div className="grid grid-cols-2 gap-1 text-xs" style={{ color: '#6b4444' }}>
                    <div>API total: {sessionStats.total}</div>
                    <div>API sent: {sessionStats.sent}</div>
                    <div>API pending: {sessionStats.pending}</div>
                    <div>API status: {sessionStats.status}</div>
                  </div>
                </div>
              )}

              <p className="text-xs" style={{ color: '#3b1111' }}>
                Stats are for the current runtime session and reset when the API server restarts.
              </p>
            </div>
          )}

          {/* Logs Modal */}
          {activeModal === 'logs' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: '#9a7272' }}>{runtimeEvents.length} events</span>
                <button className="text-xs px-2 py-0.5 rounded border"
                  style={{ borderColor: '#2d1010', color: '#9a7272', background: '#0b0404' }}
                  onClick={() => fetchModalData('logs')}>
                  Refresh
                </button>
              </div>

              {/* Frontend log entries */}
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: '#9a7272' }}>Frontend log</p>
                <div className="rounded border overflow-hidden" style={{ borderColor: '#2d1010', maxHeight: 180, overflowY: 'auto' }}>
                  {logs.length === 0
                    ? <div className="px-3 py-3 text-xs text-center" style={{ color: '#3b1111' }}>No entries</div>
                    : [...logs].reverse().map((log, i) => (
                      <div key={i} className="flex gap-2 px-2 py-1 border-b text-xs"
                        style={{ borderColor: '#1a0808', background: '#0b0404' }}>
                        <span style={{ color: '#1a4d1a' }}>{log.time}</span>
                        <span style={{ color: log.status === 'ok' ? '#4ade80' : log.status === 'warn' ? '#fbbf24' : '#f87171' }}>
                          {log.status === 'ok' ? '›' : log.status === 'warn' ? '!' : '✗'} {log.msg}
                        </span>
                      </div>
                    ))
                  }
                </div>
              </div>

              {/* Backend runtime events */}
              {runtimeEvents.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: '#9a7272' }}>Backend runtime events</p>
                  <div className="rounded border overflow-hidden" style={{ borderColor: '#2d1010', maxHeight: 200, overflowY: 'auto' }}>
                    {runtimeEvents.map((ev) => (
                      <div key={ev.id} className="px-2 py-1 border-b text-xs"
                        style={{ borderColor: '#1a0808', background: '#0b0404' }}>
                        <div className="flex items-center justify-between">
                          <span style={{ color: '#86efac' }}>{ev.type}</span>
                          <span style={{ color: '#1a4d1a' }}>{new Date(ev.createdAt).toLocaleTimeString()}</span>
                        </div>
                        <div style={{ color: '#4b7a4b' }}>
                          {JSON.stringify(ev.details).slice(0, 80)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Settings Modal */}
          {activeModal === 'settings' && (
            <div className="space-y-4">
              <SettingsSection title="Proxy Settings">
                <SettingsField label="Proxy Host" value={localSettings.proxyHost}
                  onChange={(v) => setLocalSettings((p) => ({ ...p, proxyHost: v }))} />
                <SettingsField label="Proxy Port" value={localSettings.proxyPort}
                  onChange={(v) => setLocalSettings((p) => ({ ...p, proxyPort: v }))} placeholder="3128" />
                <SettingsField label="Proxy Username" value={localSettings.proxyUser}
                  onChange={(v) => setLocalSettings((p) => ({ ...p, proxyUser: v }))} />
                <SettingsField label="Proxy Password" value={localSettings.proxyPass}
                  onChange={(v) => setLocalSettings((p) => ({ ...p, proxyPass: v }))} password />
              </SettingsSection>

              <SettingsSection title="API Keys">
                <SettingsField label="WeTransfer API Key" value={localSettings.weTransferApiKey}
                  onChange={(v) => setLocalSettings((p) => ({ ...p, weTransferApiKey: v }))}
                  placeholder="wt_…" password />
              </SettingsSection>

              <SettingsSection title="Email (SMTP)">
                <SettingsField label="SMTP Host" value={localSettings.smtpHost}
                  onChange={(v) => setLocalSettings((p) => ({ ...p, smtpHost: v }))} />
                <SettingsField label="SMTP Username" value={localSettings.smtpUser}
                  onChange={(v) => setLocalSettings((p) => ({ ...p, smtpUser: v }))} />
                <SettingsField label="SMTP Password" value={localSettings.smtpPass}
                  onChange={(v) => setLocalSettings((p) => ({ ...p, smtpPass: v }))} password />
              </SettingsSection>

              <SettingsSection title="Sending">
                <SettingsField label="Max Retries" value={localSettings.maxRetries}
                  onChange={(v) => setLocalSettings((p) => ({ ...p, maxRetries: v }))} placeholder="3" />
              </SettingsSection>

              <p className="text-xs" style={{ color: '#5a3333' }}>
                These values are stored in local session memory and browser localStorage. They are not sent to any external service.
              </p>

              <button onClick={handleSaveSettings}
                className="w-full py-2 rounded-md text-sm font-semibold transition"
                style={{
                  background: settingsSaved ? '#166534' : '#c0392b',
                  color: '#fff',
                  border: `1px solid ${settingsSaved ? '#15803d' : '#e74c3c'}`,
                }}>
                {settingsSaved ? '✓ Settings Saved' : 'Save Settings'}
              </button>
            </div>
          )}
        </ModalOverlay>
      )}
    </div>
  );
}

// ── Helper components ──────────────────────────────────────────────────────

function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Circle className="w-2 h-2 fill-current" style={{ color }} />
      <span style={{ color: '#9a7272' }}>{label}</span>
    </div>
  );
}

function StatCell({ label, value, color, border }: { label: string; value: number; color: string; border?: boolean }) {
  return (
    <div className="flex flex-col items-center py-2"
      style={border ? { borderLeft: '1px solid #0f2b0f' } : undefined}>
      <span className="text-sm font-bold" style={{ color }}>{value}</span>
      <span className="text-xs" style={{ color: '#1a4d1a' }}>{label}</span>
    </div>
  );
}

function ModalOverlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.80)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex flex-col rounded-lg border shadow-2xl w-full max-w-lg"
        style={{ background: '#100505', borderColor: '#2d1010', maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: '#2d1010' }}>
          <span className="font-semibold text-sm" style={{ color: '#f0e0e0' }}>{title}</span>
          <button onClick={onClose}
            className="p-1 rounded transition hover:bg-red-900"
            style={{ color: '#9a7272' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold mb-2" style={{ color: '#d4a0a0' }}>{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SettingsField({
  label, value, onChange, placeholder, password,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; password?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs w-36 shrink-0" style={{ color: '#9a7272' }}>{label}</label>
      <input
        type={password ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 text-xs px-2 py-1.5 rounded border outline-none"
        style={{ background: '#0b0404', borderColor: '#3b1111', color: '#e2d6d6' }} />
    </div>
  );
}
