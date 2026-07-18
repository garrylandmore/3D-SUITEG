type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';
type LogStatus = 'success' | 'error' | 'warning' | 'info';
type SessionSendStatus = 'idle' | 'running' | 'stopped';

type SessionLead = {
  id: string;
  email: string;
  name: string;
  status: 'pending' | 'sent' | 'failed';
  addedAt: string;
  sentAt: string | null;
};

type SessionSettings = {
  proxyHost: string;
  proxyPort: string;
  proxyUser: string;
  proxyPass: string;
  weTransferApiKey: string;
  smtpHost: string;
  smtpUser: string;
  smtpPass: string;
  maxRetries: string;
  updatedAt: string;
};

type LocalCampaign = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  templatePdfUrl: string;
  placeholders: string[];
  status: CampaignStatus;
  totalLeads: number;
  processedLeads: number;
  failedLeads: number;
  successLeads: number;
  createdAt: Date;
  updatedAt: Date;
};

type LocalLead = {
  id: string;
  campaignId: string;
  email: string;
  name: string;
  company: string | null;
  referenceNumber: string | null;
  customFields: Record<string, unknown>;
  status: string;
  sentAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LocalCampaignLog = {
  id: string;
  campaignId: string;
  leadId: string | null;
  action: string;
  details: string | null;
  status: LogStatus;
  createdAt: Date;
};

type DashboardSessionState = {
  provider: string;
  batchSize: string;
  delay: string;
  rotateIds: boolean;
  subject: string;
  message: string;
  recipientsCount: number;
  files: Array<{ name: string; size: number }>;
  updatedAt: string;
};

type RuntimeEvent = {
  id: string;
  type: string;
  createdAt: string;
  details: Record<string, unknown>;
};

type RuntimeState = {
  campaigns: Map<string, LocalCampaign>;
  leadsByCampaign: Map<string, LocalLead[]>;
  logsByCampaign: Map<string, LocalCampaignLog[]>;
  events: RuntimeEvent[];
  dashboardSession: DashboardSessionState | null;
  sessionLeads: SessionLead[];
  sessionSettings: SessionSettings | null;
  sessionStatus: SessionSendStatus;
};

const globalForRuntime = globalThis as typeof globalThis & {
  __runtimeState?: RuntimeState;
};

function getState(): RuntimeState {
  if (!globalForRuntime.__runtimeState) {
    globalForRuntime.__runtimeState = {
      campaigns: new Map(),
      leadsByCampaign: new Map(),
      logsByCampaign: new Map(),
      events: [],
      dashboardSession: null,
      sessionLeads: [],
      sessionSettings: null,
      sessionStatus: 'idle',
    };
  }
  return globalForRuntime.__runtimeState;
}

function makeId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${uuid}`;
}

function addEvent(type: string, details: Record<string, unknown>) {
  const state = getState();
  state.events.unshift({
    id: makeId('event'),
    type,
    createdAt: new Date().toISOString(),
    details,
  });
  state.events = state.events.slice(0, 200);
}

function addCampaignLog(
  campaignId: string,
  action: string,
  status: LogStatus,
  details?: Record<string, unknown>,
  leadId?: string
) {
  const state = getState();
  const existing = state.logsByCampaign.get(campaignId) || [];
  existing.unshift({
    id: makeId('log'),
    campaignId,
    leadId: leadId || null,
    action,
    status,
    details: details ? JSON.stringify(details) : null,
    createdAt: new Date(),
  });
  state.logsByCampaign.set(campaignId, existing.slice(0, 200));
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getLocalModeReason() {
  if (!isDatabaseConfigured()) {
    return 'DATABASE_URL is not configured';
  }
  return 'database access unavailable';
}

export function listCampaignsLocal() {
  const state = getState();
  return Array.from(state.campaigns.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export function createCampaignLocal(input: {
  name: string;
  description?: string;
  templatePdfUrl: string;
  placeholders: string[];
  userId?: string;
}) {
  const state = getState();
  const now = new Date();
  const campaign: LocalCampaign = {
    id: makeId('cmp'),
    userId: input.userId || 'local-user',
    name: input.name,
    description: input.description || null,
    templatePdfUrl: input.templatePdfUrl,
    placeholders: input.placeholders,
    status: 'draft',
    totalLeads: 0,
    processedLeads: 0,
    failedLeads: 0,
    successLeads: 0,
    createdAt: now,
    updatedAt: now,
  };
  state.campaigns.set(campaign.id, campaign);
  state.leadsByCampaign.set(campaign.id, []);
  state.logsByCampaign.set(campaign.id, []);
  addCampaignLog(campaign.id, 'campaign_created_local', 'info', { mode: 'local-memory' });
  addEvent('campaign.created', { campaignId: campaign.id, name: campaign.name });
  return campaign;
}

export function getCampaignLocal(campaignId: string) {
  const state = getState();
  const campaign = state.campaigns.get(campaignId);
  if (!campaign) return null;
  return {
    ...campaign,
    leads: [...(state.leadsByCampaign.get(campaignId) || [])].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    ),
    logs: [...(state.logsByCampaign.get(campaignId) || [])].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    ),
  };
}

export function updateCampaignLocal(
  campaignId: string,
  update: Partial<Pick<LocalCampaign, 'name' | 'description' | 'status'>>
) {
  const state = getState();
  const campaign = state.campaigns.get(campaignId);
  if (!campaign) return null;
  const next = { ...campaign, ...update, updatedAt: new Date() };
  state.campaigns.set(campaignId, next);
  addEvent('campaign.updated', { campaignId, status: next.status });
  return next;
}

export function deleteCampaignLocal(campaignId: string) {
  const state = getState();
  const existed = state.campaigns.delete(campaignId);
  state.leadsByCampaign.delete(campaignId);
  state.logsByCampaign.delete(campaignId);
  if (existed) addEvent('campaign.deleted', { campaignId });
  return existed;
}

export function listLeadsLocal(campaignId: string) {
  const state = getState();
  return [...(state.leadsByCampaign.get(campaignId) || [])].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export function importLeadsLocal(
  campaignId: string,
  leads: Array<Record<string, unknown>>
) {
  const state = getState();
  const campaign = state.campaigns.get(campaignId);
  if (!campaign) return null;

  const existing = state.leadsByCampaign.get(campaignId) || [];
  const existingEmails = new Set(existing.map((lead) => lead.email.toLowerCase()));
  let imported = 0;

  for (const lead of leads) {
    const email = String(lead.email || '').trim().toLowerCase();
    const name = String(lead.name || '').trim();
    if (!email || !name || existingEmails.has(email)) continue;
    existingEmails.add(email);
    imported += 1;
    existing.push({
      id: makeId('lead'),
      campaignId,
      email,
      name,
      company: lead.company ? String(lead.company) : null,
      referenceNumber: lead.referenceNumber ? String(lead.referenceNumber) : null,
      customFields: (lead.customFields as Record<string, unknown>) || {},
      status: 'pending',
      sentAt: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  campaign.totalLeads += imported;
  campaign.updatedAt = new Date();
  state.leadsByCampaign.set(campaignId, existing);
  state.campaigns.set(campaignId, campaign);

  addCampaignLog(campaignId, 'imported_leads_local', 'success', { imported });
  addEvent('campaign.leads.imported', { campaignId, imported });
  return imported;
}

export function startCampaignLocal(campaignId: string) {
  const state = getState();
  const campaign = state.campaigns.get(campaignId);
  if (!campaign) return null;
  const leads = state.leadsByCampaign.get(campaignId) || [];
  const queued = leads.filter((lead) => lead.status === 'pending').length;
  campaign.status = 'active';
  campaign.updatedAt = new Date();
  state.campaigns.set(campaignId, campaign);
  addCampaignLog(campaignId, 'campaign_started_local', 'info', { queued });
  addEvent('campaign.started', { campaignId, queued });
  return { campaign, queued };
}

export function stopCampaignLocal(campaignId: string) {
  const state = getState();
  const campaign = state.campaigns.get(campaignId);
  if (!campaign) return null;
  campaign.status = 'paused';
  campaign.updatedAt = new Date();
  state.campaigns.set(campaignId, campaign);
  addCampaignLog(campaignId, 'campaign_stopped_local', 'info', { mode: 'local-memory' });
  addEvent('campaign.stopped', { campaignId });
  return campaign;
}

export function validateCampaignLocal(campaignId: string) {
  const campaign = getCampaignLocal(campaignId);
  if (!campaign) return null;
  const errors: string[] = [];
  const warnings: string[] = [];
  const pendingLeads = campaign.leads.filter((lead) => lead.status === 'pending');

  if (!campaign.templatePdfUrl) errors.push('Template PDF is not configured');
  if (!campaign.placeholders?.length) errors.push('No placeholders defined');
  if (!campaign.leads.length) errors.push('No leads imported. Please import leads first.');
  if (campaign.status === 'active') errors.push('Campaign is already running');
  if (!pendingLeads.length && campaign.leads.length > 0) warnings.push('All leads have already been processed');
  warnings.push('Running in local in-memory mode; data resets when API restarts.');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalLeads: campaign.leads.length,
      pendingLeads: pendingLeads.length,
      status: campaign.status,
      placeholders: campaign.placeholders,
    },
  };
}

export function updateDashboardSessionLocal(input: Omit<DashboardSessionState, 'updatedAt'>) {
  const state = getState();
  const next: DashboardSessionState = { ...input, updatedAt: new Date().toISOString() };
  state.dashboardSession = next;
  addEvent('dashboard.session.updated', {
    provider: input.provider,
    recipientsCount: input.recipientsCount,
    files: input.files.length,
  });
  return next;
}

export function getDashboardSessionLocal() {
  return getState().dashboardSession;
}

export function recordUploadMetadataLocal(details: {
  filename: string;
  importedRows: number;
  source: 'csv';
}) {
  addEvent('dashboard.upload.csv', details);
}

export function listRuntimeEventsLocal(limit = 50) {
  return getState().events.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Session leads — flat list independent of campaigns, for CRM sender tracking
// ---------------------------------------------------------------------------

export function addSessionLeads(lines: string[]): { added: number; total: number; leads: SessionLead[] } {
  const state = getState();
  const existingEmails = new Set(state.sessionLeads.map((l) => l.email.toLowerCase()));
  let added = 0;

  for (const raw of lines) {
    const email = raw.trim().toLowerCase();
    if (!email || existingEmails.has(email)) continue;
    existingEmails.add(email);
    const name = email.split('@')[0]?.replace(/[._-]/g, ' ') || email;
    state.sessionLeads.push({
      id: makeId('sl'),
      email,
      name,
      status: 'pending',
      addedAt: new Date().toISOString(),
      sentAt: null,
    });
    added++;
  }

  if (added > 0) {
    addEvent('session.leads.added', { added, total: state.sessionLeads.length });
  }
  return { added, total: state.sessionLeads.length, leads: state.sessionLeads };
}

export function getSessionLeads(): SessionLead[] {
  return getState().sessionLeads;
}

export function markSessionLeadsSent(emails: string[]): void {
  const state = getState();
  const emailSet = new Set(emails.map((e) => e.toLowerCase()));
  let marked = 0;
  for (const lead of state.sessionLeads) {
    if (emailSet.has(lead.email) && lead.status === 'pending') {
      lead.status = 'sent';
      lead.sentAt = new Date().toISOString();
      marked++;
    }
  }
  if (marked > 0) {
    addEvent('session.leads.marked_sent', { count: marked });
  }
}

export function getSessionStats(): {
  total: number;
  sent: number;
  pending: number;
  failed: number;
  status: SessionSendStatus;
} {
  const state = getState();
  const total = state.sessionLeads.length;
  const sent = state.sessionLeads.filter((l) => l.status === 'sent').length;
  const failed = state.sessionLeads.filter((l) => l.status === 'failed').length;
  const pending = total - sent - failed;
  return { total, sent, pending, failed, status: state.sessionStatus };
}

export function setSessionStatus(status: SessionSendStatus): void {
  const state = getState();
  const prev = state.sessionStatus;
  state.sessionStatus = status;
  addEvent('session.status.changed', { from: prev, to: status });
}

// ---------------------------------------------------------------------------
// Session settings — local-mode config (proxy, API keys, etc.)
// ---------------------------------------------------------------------------

export function getSessionSettings(): SessionSettings | null {
  return getState().sessionSettings;
}

export function updateSessionSettings(s: Omit<SessionSettings, 'updatedAt'>): SessionSettings {
  const state = getState();
  const next: SessionSettings = { ...s, updatedAt: new Date().toISOString() };
  state.sessionSettings = next;
  addEvent('session.settings.updated', {});
  return next;
}

// ---------------------------------------------------------------------------
// Campaign logs — fallback list for local mode
// ---------------------------------------------------------------------------

export function listCampaignLogsLocal(campaignId: string, limit = 100, offset = 0): LocalCampaignLog[] {
  const state = getState();
  const all = [...(state.logsByCampaign.get(campaignId) || [])].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  return all.slice(offset, offset + limit);
}
