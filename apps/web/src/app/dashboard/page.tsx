'use client';

import React from 'react';
import {
  Send,
  Upload,
  Users,
  BarChart3,
  Settings,
  FileText,
  Mail,
  Activity,
  ChevronRight,
  Circle,
  Wifi,
  WifiOff,
  RefreshCw,
  Play,
  Square,
  ToggleLeft,
  List,
  LogOut,
  Database,
  Zap,
} from 'lucide-react';

const MOCK_LOGS = [
  { time: '14:32:01', status: 'ok',   msg: 'Session initialized — provider: WeTransfer v2' },
  { time: '14:32:03', status: 'ok',   msg: 'Temp email generated: tmp_8f2a@mailhaven.io' },
  { time: '14:32:05', status: 'ok',   msg: 'File uploaded: Campaign_Brief_Q3.pdf (2.4 MB)' },
  { time: '14:32:08', status: 'ok',   msg: 'Transfer link created: we.tl/t-xK9mP2' },
  { time: '14:32:09', status: 'warn', msg: 'Recipient throttle — waiting 3s before next send' },
  { time: '14:32:13', status: 'ok',   msg: 'Sent → john.doe@acme.com ✓' },
  { time: '14:32:14', status: 'ok',   msg: 'Sent → sarah.k@tecorp.io ✓' },
  { time: '14:32:15', status: 'err',  msg: 'Failed → bounced: no-reply@invalid.xyz' },
  { time: '14:32:17', status: 'ok',   msg: 'Sent → mike.torres@ventures.com ✓' },
  { time: '14:32:18', status: 'ok',   msg: 'Sent → linda.p@globalfirm.co ✓' },
  { time: '14:32:19', status: 'ok',   msg: 'Batch 1/3 complete — 4 sent, 1 failed' },
  { time: '14:32:22', status: 'ok',   msg: 'Rotating temp identity…' },
  { time: '14:32:24', status: 'ok',   msg: 'New session: tmp_c4d1@dropzone.net' },
  { time: '14:32:26', status: 'ok',   msg: 'Sent → ceo@startupxyz.com ✓' },
];

const NAV_ITEMS = [
  { id: 'overview',    label: 'Overview',     icon: BarChart3 },
  { id: 'crm-sender',  label: 'CRM Sender',   icon: Send,     active: true },
  { id: 'campaigns',   label: 'Campaigns',    icon: FileText },
  { id: 'leads',       label: 'Leads',        icon: Users },
  { id: 'providers',   label: 'Providers',    icon: Database },
  { id: 'analytics',   label: 'Analytics',    icon: Activity },
  { id: 'logs',        label: 'Logs',         icon: List },
  { id: 'settings',    label: 'Settings',     icon: Settings },
];

const PROVIDERS = [
  { name: 'WeTransfer',  status: 'online',  sends: 142, quota: '∞' },
  { name: 'Smash.io',    status: 'online',  sends: 38,  quota: '20 GB' },
  { name: 'Filemail',    status: 'offline', sends: 0,   quota: '—' },
];

export default function DashboardPage() {
  const [activeNav, setActiveNav] = React.useState('crm-sender');
  const [running, setRunning] = React.useState(false);
  const [logs, setLogs] = React.useState(MOCK_LOGS.slice(0, 8));
  const [recipients, setRecipients] = React.useState(
    'john.doe@acme.com\nsarah.k@tecorp.io\nmike.torres@ventures.com\nlinda.p@globalfirm.co'
  );
  const [subject, setSubject] = React.useState('Campaign Brief — Q3 2025');
  const [message, setMessage] = React.useState(
    'Hi {{first_name}},\n\nPlease find the attached campaign brief for Q3.\n\nBest regards,\n3D+ Suite'
  );
  const [provider, setProvider] = React.useState('wetransfer');
  const [batchSize, setBatchSize] = React.useState('10');
  const [delay, setDelay] = React.useState('3');
  const logEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  function toggleRun() {
    if (running) {
      setRunning(false);
      setLogs(prev => [...prev, {
        time: new Date().toTimeString().slice(0, 8),
        status: 'warn',
        msg: 'Campaign stopped by user',
      }]);
    } else {
      setRunning(true);
      setLogs(MOCK_LOGS);
    }
  }

  function clearLogs() {
    setLogs([]);
  }

  const sentCount  = logs.filter(l => l.msg.includes('✓')).length;
  const failCount  = logs.filter(l => l.status === 'err').length;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0b0404', color: '#e2d6d6' }}>

      {/* ─── Sidebar ─────────────────────────────────────────── */}
      <aside
        className="flex flex-col w-52 shrink-0 border-r"
        style={{ background: '#100505', borderColor: '#2d1010' }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2 px-4 py-4 border-b"
          style={{ borderColor: '#2d1010' }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black"
            style={{ background: 'linear-gradient(135deg,#c0392b,#7b1a1a)', color: '#fff' }}
          >
            3D+
          </div>
          <span className="font-bold text-sm tracking-wide" style={{ color: '#f0e0e0' }}>
            3D+ Suite
          </span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
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

        {/* Bottom section */}
        <div className="px-3 py-3 border-t space-y-1" style={{ borderColor: '#2d1010' }}>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs" style={{ color: '#6b4444' }}>
            <Zap className="w-3.5 h-3.5" />
            <span>v1.0.0-dev</span>
          </div>
          <button
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition"
            style={{ color: '#9a7272' }}
          >
            <LogOut className="w-3.5 h-3.5" />
            Disconnect
          </button>
        </div>
      </aside>

      {/* ─── Main column ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Top header */}
        <header
          className="flex items-center justify-between px-5 py-2.5 border-b shrink-0"
          style={{ background: '#120606', borderColor: '#2d1010' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold" style={{ color: '#f0e0e0' }}>CRM Sender</span>
            <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#3b1111', color: '#f87171', background: '#1f0a0a' }}>
              BETA
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Provider select */}
            <select
              value={provider}
              onChange={e => setProvider(e.target.value)}
              className="text-xs px-2 py-1 rounded border outline-none"
              style={{ background: '#1c0a0a', borderColor: '#3b1111', color: '#d4a0a0' }}
            >
              <option value="wetransfer">WeTransfer</option>
              <option value="smash">Smash.io</option>
              <option value="filemail">Filemail</option>
            </select>

            {/* Batch size */}
            <select
              value={batchSize}
              onChange={e => setBatchSize(e.target.value)}
              className="text-xs px-2 py-1 rounded border outline-none"
              style={{ background: '#1c0a0a', borderColor: '#3b1111', color: '#d4a0a0' }}
            >
              {['5','10','25','50','100'].map(v => (
                <option key={v} value={v}>Batch: {v}</option>
              ))}
            </select>

            {/* Delay select */}
            <select
              value={delay}
              onChange={e => setDelay(e.target.value)}
              className="text-xs px-2 py-1 rounded border outline-none"
              style={{ background: '#1c0a0a', borderColor: '#3b1111', color: '#d4a0a0' }}
            >
              {['1','2','3','5','10'].map(v => (
                <option key={v} value={v}>Delay: {v}s</option>
              ))}
            </select>

            {/* Rotate toggle */}
            <button
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition"
              style={{ borderColor: '#3b1111', color: '#d4a0a0', background: '#1c0a0a' }}
            >
              <ToggleLeft className="w-3.5 h-3.5" />
              Rotate IDs
            </button>

            {/* Refresh */}
            <button
              className="p-1.5 rounded border transition"
              style={{ borderColor: '#2d1010', color: '#9a7272', background: '#1c0a0a' }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Status strip */}
        <div
          className="flex items-center gap-6 px-5 py-1.5 border-b shrink-0 text-xs"
          style={{ background: '#0f0505', borderColor: '#2d1010' }}
        >
          <StatusDot color="#22c55e" label="API Connected" />
          <StatusDot color="#f59e0b" label="Queue: 12 pending" />
          <StatusDot color={running ? '#22c55e' : '#6b7280'} label={running ? 'Running' : 'Idle'} />
          <span style={{ color: '#6b4444', marginLeft: 'auto' }}>
            Sent today: <span style={{ color: '#f87171' }}>{sentCount}</span>
            &nbsp;·&nbsp;Failed: <span style={{ color: '#ef4444' }}>{failCount}</span>
          </span>
        </div>

        {/* Provider row */}
        <div
          className="flex items-center gap-3 px-5 py-2.5 border-b shrink-0 overflow-x-auto"
          style={{ background: '#0e0505', borderColor: '#2d1010' }}
        >
          {PROVIDERS.map(p => (
            <div
              key={p.name}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs shrink-0"
              style={{
                borderColor: p.status === 'online' ? '#1f3d1f' : '#3b1111',
                background: p.status === 'online' ? '#0d1f0d' : '#1a0a0a',
              }}
            >
              {p.status === 'online'
                ? <Wifi className="w-3 h-3" style={{ color: '#22c55e' }} />
                : <WifiOff className="w-3 h-3" style={{ color: '#6b4444' }} />}
              <span style={{ color: p.status === 'online' ? '#86efac' : '#7a4444' }}>{p.name}</span>
              {p.status === 'online' && (
                <span style={{ color: '#4b7a4b' }}>· {p.sends} sent</span>
              )}
            </div>
          ))}
        </div>

        {/* ─── Content row ───────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* WeTransfer Sender Form */}
          <div
            className="flex flex-col flex-1 min-w-0 overflow-y-auto p-5 gap-4 border-r"
            style={{ borderColor: '#2d1010' }}
          >
            <h2 className="text-sm font-semibold tracking-wide" style={{ color: '#f0e0e0' }}>
              WeTransfer Sender
            </h2>

            {/* File upload zone */}
            <div
              className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 cursor-pointer transition hover:border-red-700"
              style={{ borderColor: '#3b1111', background: '#130606' }}
            >
              <Upload className="w-8 h-8" style={{ color: '#6b4444' }} />
              <span className="text-xs" style={{ color: '#9a7272' }}>
                Drop files or <span style={{ color: '#f87171' }}>browse</span>
              </span>
              <span className="text-xs" style={{ color: '#5a3333' }}>
                PDF, ZIP, DOCX — max 2 GB
              </span>
            </div>

            {/* Subject */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#9a7272' }}>Subject</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="text-xs px-3 py-2 rounded border outline-none w-full"
                style={{ background: '#130606', borderColor: '#3b1111', color: '#e2d6d6' }}
              />
            </div>

            {/* Message */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: '#9a7272' }}>
                Message <span style={{ color: '#5a3333' }}>(supports {'{{first_name}}'})</span>
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={4}
                className="text-xs px-3 py-2 rounded border outline-none w-full resize-none"
                style={{ background: '#130606', borderColor: '#3b1111', color: '#e2d6d6' }}
              />
            </div>

            {/* Recipients */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium" style={{ color: '#9a7272' }}>
                  Recipients <span style={{ color: '#5a3333' }}>(one per line)</span>
                </label>
                <button className="text-xs" style={{ color: '#f87171' }}>
                  Import CSV
                </button>
              </div>
              <textarea
                value={recipients}
                onChange={e => setRecipients(e.target.value)}
                rows={5}
                className="text-xs px-3 py-2 rounded border outline-none w-full resize-none font-mono"
                style={{ background: '#130606', borderColor: '#3b1111', color: '#d4a0a0' }}
              />
              <span className="text-xs" style={{ color: '#5a3333' }}>
                {recipients.split('\n').filter(Boolean).length} recipients loaded
              </span>
            </div>

            {/* Options row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: '#9a7272' }}>Temp Email Domain</label>
                <select
                  className="text-xs px-2 py-1.5 rounded border outline-none"
                  style={{ background: '#130606', borderColor: '#3b1111', color: '#d4a0a0' }}
                >
                  <option>mailhaven.io</option>
                  <option>dropzone.net</option>
                  <option>tempmailer.xyz</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: '#9a7272' }}>Transfer Expiry</label>
                <select
                  className="text-xs px-2 py-1.5 rounded border outline-none"
                  style={{ background: '#130606', borderColor: '#3b1111', color: '#d4a0a0' }}
                >
                  <option>7 days</option>
                  <option>14 days</option>
                  <option>30 days</option>
                </select>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 mt-auto pt-2">
              <button
                onClick={toggleRun}
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
              >
                Save Draft
              </button>
            </div>
          </div>

          {/* ─── Terminal / Log Panel ─────────────────────────── */}
          <div
            className="flex flex-col w-96 shrink-0 overflow-hidden"
            style={{ background: '#040f04' }}
          >
            {/* Terminal header */}
            <div
              className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
              style={{ borderColor: '#0f2b0f', background: '#060e06' }}
            >
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

            {/* Log lines */}
            <div className="flex-1 overflow-y-auto px-3 py-3 font-mono text-xs space-y-0.5">
              {logs.length === 0 && (
                <div style={{ color: '#1a4d1a' }} className="text-center pt-10">
                  — No output yet —
                </div>
              )}
              {logs.map((log, i) => (
                <div key={i} className="flex gap-2 leading-5">
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

            {/* Terminal footer stats */}
            <div
              className="grid grid-cols-3 gap-0 border-t shrink-0"
              style={{ borderColor: '#0f2b0f', background: '#060e06' }}
            >
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
    <div
      className="flex flex-col items-center py-2"
      style={border ? { borderLeft: '1px solid #0f2b0f' } : undefined}
    >
      <span className="text-sm font-bold" style={{ color }}>{value}</span>
      <span className="text-xs" style={{ color: '#1a4d1a' }}>{label}</span>
    </div>
  );
}
