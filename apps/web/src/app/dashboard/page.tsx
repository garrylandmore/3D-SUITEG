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
} from 'lucide-react';

type LogStatus = 'ok' | 'warn' | 'err';

type LogEntry = {
  time: string;
  status: LogStatus;
  msg: string;
};

type ProviderKey = 'wetransfer' | 'smash' | 'filemail';

type ProviderMeta = {
  key: ProviderKey;
  name: string;
  available: boolean;
  sends: number;
  quota: string;
};

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Overview', icon: BarChart3, route: '/dashboard' },
  { id: 'crm-sender', label: 'CRM Sender', icon: Send, route: '/dashboard' },
  { id: 'campaigns', label: 'Campaigns', icon: FileText, route: '/campaigns' },
  { id: 'create-campaign', label: 'Create Campaign', icon: FileUp, route: '/campaigns/create' },
  { id: 'leads', label: 'Leads', icon: Users },
  { id: 'providers', label: 'Providers', icon: Database },
  { id: 'analytics', label: 'Analytics', icon: Activity },
  { id: 'logs', label: 'Logs', icon: List },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

function now() {
  return new Date().toTimeString().slice(0, 8);
}

function parseRecipients(input: string) {
  const lines = input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const valid: string[] = [];
  const invalid: string[] = [];

  for (const line of lines) {
    if (emailRegex.test(line)) {
      valid.push(line.toLowerCase());
    } else {
      invalid.push(line);
    }
  }

  return {
    valid,
    invalid,
    unique: Array.from(new Set(valid)),
  };
}

function inferNameFromEmail(email: string) {
  return email.split('@')[0]?.replace(/[._-]/g, ' ') || email;
}

function parseCsvText(text: string) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

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

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const csvInputRef = React.useRef<HTMLInputElement>(null);
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

  async function refreshConnectionState() {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) {
        throw new Error(`Health check failed (${res.status})`);
      }
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
      } catch {
        // Ignore optional session restore failures.
      }

      try {
        const campaignsRes = await fetch('/api/campaigns');
        if (campaignsRes.ok) {
          const campaigns = await campaignsRes.json();
          if (Array.isArray(campaigns)) {
            const active = campaigns.filter((c: any) => c?.status === 'active').length;
            setQueuedCount(active);
          }
        }
      } catch {
        // Keep UI responsive even if this optional fetch fails.
      }
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
    provider: ProviderKey;
    batchSize: string;
    delay: string;
    rotateIds: boolean;
    subject: string;
    message: string;
    recipients: string;
    files: File[];
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
          files: (overrides?.files ?? files).map((file) => ({ name: file.name, size: file.size })),
        }),
      });
    } catch {
      // Keep dashboard responsive if session sync fails.
    }
  }

  function handleFilesSelected(nextFiles: FileList | File[]) {
    const selected = Array.from(nextFiles).filter((file) => file.size > 0);
    if (!selected.length) return;

    setFiles((prev) => {
      const byName = new Map(prev.map((file) => [file.name, file]));
      selected.forEach((file) => byName.set(file.name, file));
      return Array.from(byName.values());
    });

    appendLog('ok', `Selected ${selected.length} file(s)`);
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((file) => file.name !== name));
  }

  async function handleCsvImport(event: React.ChangeEvent<HTMLInputElement>) {
    const csvFile = event.target.files?.[0];
    if (!csvFile) return;

    setIsProcessingCsv(true);

    try {
      const formData = new FormData();
      formData.append('file', csvFile);

      const res = await fetch('/api/upload/csv', {
        method: 'POST',
        body: formData,
      });

      let importedEmails: string[] = [];

      if (res.ok) {
        const data = await res.json();
        importedEmails = (data.leads || []).map((lead: any) => lead.email).filter(Boolean);
      } else {
        const csvText = await csvFile.text();
        importedEmails = parseCsvText(csvText);
      }

      if (!importedEmails.length) {
        throw new Error('CSV import found no valid email rows');
      }

      setRecipients((prev) => {
        const merged = [prev, ...importedEmails].filter(Boolean).join('\n');
        return Array.from(new Set(merged.split('\n').map((line) => line.trim()).filter(Boolean))).join('\n');
      });

      appendLog('ok', `Imported ${importedEmails.length} recipients from CSV`);
      setSystemMessage(`Imported ${importedEmails.length} recipients from CSV.`);
    } catch (error: any) {
      const details = error?.message || 'Failed to import CSV';
      appendLog('err', details);
      setSystemMessage(details);
    } finally {
      setIsProcessingCsv(false);
      event.target.value = '';
    }
  }

  function validateForm() {
    const errors: string[] = [];

    if (!subject.trim()) errors.push('Subject is required.');
    if (!message.trim()) errors.push('Message is required.');
    if (!files.length) errors.push('At least one file must be selected.');

    const recipientData = parseRecipients(recipients);
    if (!recipientData.unique.length) {
      errors.push('At least one valid recipient email is required.');
    }
    if (recipientData.invalid.length) {
      errors.push(`Invalid recipients: ${recipientData.invalid.slice(0, 3).join(', ')}${recipientData.invalid.length > 3 ? '…' : ''}`);
    }

    const selectedProvider = providerMeta.find((entry) => entry.key === provider);
    if (selectedProvider && !selectedProvider.available) {
      errors.push(`${selectedProvider.name} is currently unavailable.`);
    }

    setValidationErrors(errors);
    return {
      errors,
      recipientData,
    };
  }

  async function startSimulation(recipientEmails: string[], reason: string) {
    appendLog('warn', `Using simulated/test mode (${reason})`);
    setRunMode('simulated');
    setRunning(true);
    setSystemMessage('Campaign running in simulated mode.');

    let index = 0;
    const timerDelay = Math.max(Number(delay) * 1000, 500);

    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
    }

    simulationTimerRef.current = setInterval(() => {
      if (index >= recipientEmails.length) {
        if (simulationTimerRef.current) {
          clearInterval(simulationTimerRef.current);
          simulationTimerRef.current = null;
        }
        setRunning(false);
        setRunMode('idle');
        appendLog('ok', 'Simulated run completed');
        return;
      }

      const email = recipientEmails[index];
      const status: LogStatus = email.includes('invalid') ? 'err' : 'ok';
      appendLog(status, `${status === 'ok' ? 'Simulated sent' : 'Simulated failed'} → ${email}`);
      index += 1;
    }, timerDelay);
  }

  async function handleStartCampaign() {
    const { errors, recipientData } = validateForm();
    if (errors.length > 0) {
      setSystemMessage('Please fix validation errors before starting.');
      appendLog('err', 'Campaign start blocked by validation errors');
      return;
    }

    setValidationErrors([]);
    appendLog('ok', `Starting campaign with ${recipientData.unique.length} recipients...`);

    const baseCampaignPayload = {
      name: `Dashboard Campaign ${new Date().toLocaleString()}`,
      description: `Provider: ${provider}, batch: ${batchSize}, delay: ${delay}s`,
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

      if (!createRes.ok) {
        throw new Error('Failed to create campaign in API');
      }

      const createdCampaign = await createRes.json();
      const campaignId = createdCampaign.id as string;
      setActiveCampaignId(campaignId);

      const leadPayload = recipientData.unique.map((email) => ({
        email,
        name: inferNameFromEmail(email),
      }));

      const leadsRes = await fetch(`/api/campaigns/${campaignId}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: leadPayload }),
      });

      if (!leadsRes.ok) {
        throw new Error('Failed to import campaign leads');
      }

      appendLog('ok', `Created campaign ${campaignId.slice(0, 8)} and imported ${leadPayload.length} leads`);

      const startRes = await fetch(`/api/campaigns/${campaignId}/start`, {
        method: 'POST',
      });

      const startBody = await startRes.json();

      if (startRes.ok) {
        setRunMode('api');
        setRunning(true);
        setSystemMessage(startBody.message || 'Campaign started successfully.');
        setQueuedCount((prev) => prev + 1);
        appendLog('ok', `API campaign started (${startBody.queued ?? 0} queued)`);
      } else {
        const backendErrors = Array.isArray(startBody.errors) ? startBody.errors.join('; ') : startBody.message;
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
        const res = await fetch(`/api/campaigns/${activeCampaignId}/stop`, {
          method: 'POST',
        });
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
      appendLog('warn', 'Simulated campaign stopped by user');
    }

    setRunning(false);
    setRunMode('idle');
    setSystemMessage('Campaign stopped.');
  }

  function clearLogs() {
    setLogs([]);
  }

  function handleSaveDraft() {
    const payload = {
      provider,
      batchSize,
      delay,
      rotateIds,
      subject,
      message,
      recipients,
      files: files.map((file) => ({ name: file.name, size: file.size })),
    };

    localStorage.setItem('dashboard-draft', JSON.stringify(payload));
    const time = now();
    setDraftSavedAt(time);
    appendLog('ok', 'Draft saved locally');
    setSystemMessage(`Draft saved at ${time}`);
    void syncDashboardSession();
  }

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
    } catch {
      // Ignore invalid draft payloads.
    }
  }, [appendLog]);

  const sentCount = logs.filter((entry) => entry.msg.includes('sent')).length;
  const failCount = logs.filter((entry) => entry.status === 'err').length;

  const providerMeta: ProviderMeta[] = [
    { key: 'wetransfer', name: 'WeTransfer', available: apiConnected, sends: sentCount, quota: '∞' },
    { key: 'smash', name: 'Smash.io', available: true, sends: Math.max(Math.floor(sentCount / 2), 0), quota: '20 GB' },
    { key: 'filemail', name: 'Filemail', available: false, sends: 0, quota: '—' },
  ];

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0b0404', color: '#e2d6d6' }}>
      <aside className="flex flex-col w-52 shrink-0 border-r" style={{ background: '#100505', borderColor: '#2d1010' }}>
        <div className="flex items-center gap-2 px-4 py-4 border-b" style={{ borderColor: '#2d1010' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black" style={{ background: 'linear-gradient(135deg,#c0392b,#7b1a1a)', color: '#fff' }}>
            3D+
          </div>
          <span className="font-bold text-sm tracking-wide" style={{ color: '#f0e0e0' }}>
            3D+ Suite
          </span>
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
                  if ('route' in item && item.route) {
                    router.push(item.route);
                    appendLog('ok', `Navigated to ${item.label}`);
                    return;
                  }

                  const message = `${item.label} is not available yet in this dashboard build.`;
                  setSystemMessage(message);
                  appendLog('warn', message);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-all text-left"
                style={
                  isActive
                    ? { background: '#3b1111', color: '#f87171', borderLeft: '2px solid #ef4444' }
                    : { color: '#9a7272' }
                }
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
            <Zap className="w-3.5 h-3.5" />
            <span>v1.1.0-dev</span>
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
            <LogOut className="w-3.5 h-3.5" />
            Disconnect
          </button>
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="flex items-center justify-between px-5 py-2.5 border-b shrink-0" style={{ background: '#120606', borderColor: '#2d1010' }}>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold" style={{ color: '#f0e0e0' }}>CRM Sender</span>
            <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#3b1111', color: '#f87171', background: '#1f0a0a' }}>
              {runMode === 'simulated' ? 'SIMULATED' : 'BETA'}
            </span>
            {apiMode === 'local-memory' && (
              <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#7f1d1d', color: '#fca5a5', background: '#2a0b0b' }}>
                LOCAL MODE (NO DB)
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={provider}
              onChange={(e) => {
                const nextProvider = e.target.value as ProviderKey;
                setProvider(nextProvider);
                appendLog('ok', `Provider changed to ${nextProvider}`);
                void syncDashboardSession({ provider: nextProvider });
              }}
              className="text-xs px-2 py-1 rounded border outline-none"
              style={{ background: '#1c0a0a', borderColor: '#3b1111', color: '#d4a0a0' }}
            >
              <option value="wetransfer">WeTransfer</option>
              <option value="smash">Smash.io</option>
              <option value="filemail">Filemail</option>
            </select>

            <select
              value={batchSize}
              onChange={(e) => setBatchSize(e.target.value)}
              className="text-xs px-2 py-1 rounded border outline-none"
              style={{ background: '#1c0a0a', borderColor: '#3b1111', color: '#d4a0a0' }}
            >
              {['5', '10', '25', '50', '100'].map((value) => (
                <option key={value} value={value}>Batch: {value}</option>
              ))}
            </select>

            <select
              value={delay}
              onChange={(e) => setDelay(e.target.value)}
              className="text-xs px-2 py-1 rounded border outline-none"
              style={{ background: '#1c0a0a', borderColor: '#3b1111', color: '#d4a0a0' }}
            >
              {['1', '2', '3', '5', '10'].map((value) => (
                <option key={value} value={value}>Delay: {value}s</option>
              ))}
            </select>

            <button
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition"
              style={{ borderColor: '#3b1111', color: '#d4a0a0', background: '#1c0a0a' }}
              onClick={() => setRotateIds((prev) => !prev)}
            >
              {rotateIds ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
              Rotate IDs
            </button>

            <button
              className="p-1.5 rounded border transition"
              style={{ borderColor: '#2d1010', color: '#9a7272', background: '#1c0a0a' }}
              onClick={refreshConnectionState}
              title="Refresh connection"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        <div className="flex items-center gap-6 px-5 py-1.5 border-b shrink-0 text-xs" style={{ background: '#0f0505', borderColor: '#2d1010' }}>
          <StatusDot color={apiConnected ? '#22c55e' : '#ef4444'} label={apiConnected ? 'API Connected' : 'API Offline'} />
          <StatusDot color="#f59e0b" label={`Queue: ${queuedCount} active`} />
          <StatusDot color={running ? '#22c55e' : '#6b7280'} label={running ? `Running (${runMode})` : 'Idle'} />
          <span style={{ color: '#6b4444', marginLeft: 'auto' }}>
            Sent: <span style={{ color: '#f87171' }}>{sentCount}</span>
            &nbsp;·&nbsp;Failed: <span style={{ color: '#ef4444' }}>{failCount}</span>
          </span>
        </div>

        <div className="flex items-center gap-3 px-5 py-2.5 border-b shrink-0 overflow-x-auto" style={{ background: '#0e0505', borderColor: '#2d1010' }}>
          {providerMeta.map((entry) => {
            const active = provider === entry.key;

            return (
              <div
                key={entry.key}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs shrink-0"
                style={{
                  borderColor: active ? '#ef4444' : entry.available ? '#1f3d1f' : '#3b1111',
                  background: active ? '#2f0909' : entry.available ? '#0d1f0d' : '#1a0a0a',
                }}
              >
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
          <div className="px-5 py-2 text-xs border-b" style={{ borderColor: '#3b1111', background: '#230808', color: '#fca5a5' }}>
            Backend error: {apiError}
          </div>
        )}

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col flex-1 min-w-0 overflow-y-auto p-5 gap-4 border-r" style={{ borderColor: '#2d1010' }}>
            <h2 className="text-sm font-semibold tracking-wide" style={{ color: '#f0e0e0' }}>
              {providerMeta.find((entry) => entry.key === provider)?.name || 'Provider'} Sender
            </h2>

            <div
              className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 cursor-pointer transition hover:border-red-700"
              style={{ borderColor: '#3b1111', background: '#130606' }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleFilesSelected(event.dataTransfer.files);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(event) => {
                  if (event.target.files) {
                    handleFilesSelected(event.target.files);
                    event.target.value = '';
                  }
                }}
                className="hidden"
              />

              <Upload className="w-8 h-8" style={{ color: '#6b4444' }} />
              <span className="text-xs" style={{ color: '#9a7272' }}>
                Drop files or <span style={{ color: '#f87171' }}>browse</span>
              </span>
              <span className="text-xs" style={{ color: '#5a3333' }}>
                PDF, ZIP, DOCX — max 2 GB
              </span>
            </div>

            {files.length > 0 && (
              <div className="border rounded-md p-2" style={{ borderColor: '#3b1111', background: '#0f0505' }}>
                <p className="text-xs mb-1" style={{ color: '#9a7272' }}>Selected files</p>
                <div className="space-y-1">
                  {files.map((file) => (
                    <div key={file.name} className="flex items-center justify-between text-xs">
                      <span style={{ color: '#d4a0a0' }}>{file.name} ({Math.max(file.size / 1024 / 1024, 0.01).toFixed(2)} MB)</span>
                      <button onClick={() => removeFile(file.name)} style={{ color: '#f87171' }}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#9a7272' }}>Subject</label>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="text-xs px-3 py-2 rounded border outline-none w-full"
                style={{ background: '#130606', borderColor: '#3b1111', color: '#e2d6d6' }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#9a7272' }}>
                Message <span style={{ color: '#5a3333' }}>(supports {'{{first_name}}'})</span>
              </label>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={4}
                className="text-xs px-3 py-2 rounded border outline-none w-full resize-none"
                style={{ background: '#130606', borderColor: '#3b1111', color: '#e2d6d6' }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium" style={{ color: '#9a7272' }}>
                  Recipients <span style={{ color: '#5a3333' }}>(one per line)</span>
                </label>
                <button
                  className="text-xs disabled:opacity-60"
                  style={{ color: '#f87171' }}
                  disabled={isProcessingCsv}
                  onClick={() => csvInputRef.current?.click()}
                >
                  {isProcessingCsv ? 'Importing…' : 'Import CSV'}
                </button>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleCsvImport}
                />
              </div>
              <textarea
                value={recipients}
                onChange={(event) => setRecipients(event.target.value)}
                rows={5}
                className="text-xs px-3 py-2 rounded border outline-none w-full resize-none font-mono"
                style={{ background: '#130606', borderColor: '#3b1111', color: '#d4a0a0' }}
              />
              <span className="text-xs" style={{ color: '#5a3333' }}>
                {parseRecipients(recipients).unique.length} valid recipients loaded
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 rounded border px-2 py-2" style={{ borderColor: '#3b1111', background: '#130606' }}>
                {validationErrors.length === 0 ? (
                  <CheckCircle2 className="w-4 h-4" style={{ color: '#22c55e' }} />
                ) : (
                  <AlertCircle className="w-4 h-4" style={{ color: '#ef4444' }} />
                )}
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
                  {validationErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-3 mt-auto pt-2">
              <button
                onClick={running ? handleStopCampaign : handleStartCampaign}
                className="flex items-center gap-2 px-5 py-2 rounded-md text-sm font-semibold transition"
                style={
                  running
                    ? { background: '#7f1d1d', color: '#fca5a5', border: '1px solid #991b1b' }
                    : { background: '#c0392b', color: '#fff', border: '1px solid #e74c3c' }
                }
              >
                {running ? <><Square className="w-4 h-4" /> Stop Campaign</> : <><Play className="w-4 h-4" /> Start Campaign</>}
              </button>
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm transition border"
                style={{ borderColor: '#3b1111', color: '#9a7272', background: '#130606' }}
                onClick={handleSaveDraft}
              >
                Save Draft
              </button>
            </div>
          </div>

          <div className="flex flex-col w-96 shrink-0 overflow-hidden" style={{ background: '#040f04' }}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0" style={{ borderColor: '#0f2b0f', background: '#060e06' }}>
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" style={{ color: '#22c55e' }} />
                <span className="text-xs font-semibold" style={{ color: '#4ade80' }}>
                  Output Log
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: '#166534' }}>
                  {logs.length} entries
                </span>
                <button
                  onClick={clearLogs}
                  className="text-xs px-2 py-0.5 rounded border transition"
                  style={{ borderColor: '#0f2b0f', color: '#4b7a4b', background: '#060e06' }}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 font-mono text-xs space-y-0.5">
              {logs.length === 0 && (
                <div style={{ color: '#1a4d1a' }} className="text-center pt-10">
                  — No output yet —
                </div>
              )}
              {logs.map((log, index) => (
                <div key={`${log.time}-${index}`} className="flex gap-2 leading-5">
                  <span className="shrink-0 select-none" style={{ color: '#1a4d1a' }}>{log.time}</span>
                  <span
                    className="shrink-0 select-none w-4 text-center"
                    style={{
                      color: log.status === 'ok' ? '#22c55e' : log.status === 'warn' ? '#f59e0b' : '#ef4444',
                    }}
                  >
                    {log.status === 'ok' ? '›' : log.status === 'warn' ? '!' : '✗'}
                  </span>
                  <span
                    style={{
                      color: log.status === 'ok' ? '#4ade80' : log.status === 'warn' ? '#fbbf24' : '#f87171',
                      textShadow: log.status === 'ok' ? '0 0 6px rgba(34,197,94,0.4)' : undefined,
                    }}
                  >
                    {log.msg}
                  </span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>

            <div className="grid grid-cols-3 gap-0 border-t shrink-0" style={{ borderColor: '#0f2b0f', background: '#060e06' }}>
              <StatCell label="Sent" value={sentCount} color="#4ade80" />
              <StatCell label="Failed" value={failCount} color="#f87171" border />
              <StatCell label="Total" value={logs.length} color="#facc15" border />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Circle className="w-2 h-2 fill-current" style={{ color }} />
      <span style={{ color: '#9a7272' }}>{label}</span>
    </div>
  );
}

function StatCell({
  label,
  value,
  color,
  border,
}: {
  label: string;
  value: number;
  color: string;
  border?: boolean;
}) {
  return (
    <div className="flex flex-col items-center py-2" style={border ? { borderLeft: '1px solid #0f2b0f' } : undefined}>
      <span className="text-sm font-bold" style={{ color }}>{value}</span>
      <span className="text-xs" style={{ color: '#1a4d1a' }}>{label}</span>
    </div>
  );
}
