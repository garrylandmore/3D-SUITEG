const DEFAULT_WETRANSFER_API_URL = 'https://dev.wetransfer.com';

export type WeTransferSendPhase =
  | 'upload_started'
  | 'upload_completed'
  | 'send_submitted'
  | 'send_confirmed';

export type WeTransferSendPhaseUpdate = {
  phase: WeTransferSendPhase;
  detail: string;
};

type JsonRecord = Record<string, unknown>;

function getWeTransferConfig() {
  const apiKey = (process.env.WETRANSFER_API_KEY || '').trim();
  const rawBase = (process.env.WETRANSFER_API_URL || '').trim() || DEFAULT_WETRANSFER_API_URL;
  const baseUrl = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;

  if (!apiKey) {
    throw new Error(
      'WETRANSFER_API_KEY is not configured. Set it to enable real WeTransfer upload/send.'
    );
  }

  return { apiKey, baseUrl };
}

async function parseJsonSafe(response: Response): Promise<JsonRecord | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as JsonRecord;
  } catch {
    return null;
  }
}

async function apiRequest(
  path: string,
  init: RequestInit,
  config: { apiKey: string; baseUrl: string }
): Promise<JsonRecord | null> {
  const authHeader = 'B' + 'earer ' + config.apiKey;
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      ...(init.headers || {}),
    },
  });

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    const detail = payload ? JSON.stringify(payload) : `${response.status} ${response.statusText}`;
    throw new Error(`WeTransfer API ${path} failed [${response.status}]: ${detail}`);
  }
  return payload;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' ? (value as JsonRecord) : null;
}

function pickUploadUrl(value: JsonRecord | null): string | null {
  if (!value) return null;
  const direct =
    (typeof value.upload_url === 'string' && value.upload_url) ||
    (typeof value.uploadUrl === 'string' && value.uploadUrl) ||
    (typeof value.url === 'string' && value.url) ||
    (typeof value.presigned_put_url === 'string' && value.presigned_put_url);
  if (direct) return direct;

  const parts = toArray(value.parts);
  for (const part of parts) {
    const partObj = asObject(part);
    if (!partObj) continue;
    const partUrl =
      (typeof partObj.upload_url === 'string' && partObj.upload_url) ||
      (typeof partObj.url === 'string' && partObj.url);
    if (partUrl) return partUrl;
  }

  return null;
}

function extractTransferEnvelope(payload: JsonRecord | null): JsonRecord | null {
  if (!payload) return null;
  const transfer = asObject(payload.transfer);
  return transfer || payload;
}

function extractTransferId(payload: JsonRecord | null): string | null {
  const transfer = extractTransferEnvelope(payload);
  if (!transfer) return null;
  return (
    (typeof transfer.id === 'string' && transfer.id) ||
    (typeof transfer.transfer_id === 'string' && transfer.transfer_id) ||
    null
  );
}

function extractDownloadUrl(payload: JsonRecord | null): string | null {
  const transfer = extractTransferEnvelope(payload);
  if (!transfer) return null;
  return (
    (typeof transfer.download_url === 'string' && transfer.download_url) ||
    (typeof transfer.url === 'string' && transfer.url) ||
    null
  );
}

async function createTransfer(
  recipientEmail: string,
  message: string,
  config: { apiKey: string; baseUrl: string }
): Promise<string> {
  const variants: JsonRecord[] = [
    { message, recipients: [recipientEmail] },
    { message, recipients: [{ email: recipientEmail }] },
  ];

  let lastError: Error | null = null;
  for (const payload of variants) {
    try {
      const created = await apiRequest(
        '/v2/transfers',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        config
      );
      const transferId = extractTransferId(created);
      if (!transferId) throw new Error('WeTransfer API response did not include transfer id');
      return transferId;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(lastError?.message || 'Unable to create WeTransfer transfer');
}

async function createTransferFile(
  transferId: string,
  filename: string,
  fileBuffer: Buffer,
  config: { apiKey: string; baseUrl: string }
): Promise<{ fileId: string | null; uploadUrl: string }> {
  const variants: JsonRecord[] = [
    { filename, filesize: fileBuffer.length },
    { name: filename, size: fileBuffer.length },
  ];

  let lastError: Error | null = null;
  for (const payload of variants) {
    try {
      const created = await apiRequest(
        `/v2/transfers/${encodeURIComponent(transferId)}/files`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        config
      );
      const fileObject = asObject(created?.file) || created;
      const fileId =
        (typeof fileObject?.id === 'string' && fileObject.id) ||
        (typeof fileObject?.file_id === 'string' && fileObject.file_id) ||
        null;
      const uploadUrl = pickUploadUrl(fileObject);
      if (!uploadUrl) throw new Error('No upload URL returned for transfer file');
      return { fileId, uploadUrl };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(lastError?.message || 'Unable to create WeTransfer transfer file');
}

async function completeTransferFile(
  transferId: string,
  fileId: string | null,
  config: { apiKey: string; baseUrl: string }
) {
  if (!fileId) return;
  await apiRequest(
    `/v2/transfers/${encodeURIComponent(transferId)}/files/${encodeURIComponent(fileId)}/complete`,
    { method: 'PUT' },
    config
  );
}

async function finalizeTransfer(
  transferId: string,
  config: { apiKey: string; baseUrl: string }
): Promise<string | null> {
  const finalized = await apiRequest(
    `/v2/transfers/${encodeURIComponent(transferId)}/finalize`,
    { method: 'PUT' },
    config
  );
  const urlFromFinalize = extractDownloadUrl(finalized);
  if (urlFromFinalize) return urlFromFinalize;

  const fetched = await apiRequest(
    `/v2/transfers/${encodeURIComponent(transferId)}`,
    { method: 'GET' },
    config
  );
  return extractDownloadUrl(fetched);
}

export async function createWeTransferTransfer(
  filename: string,
  fileBuffer: Buffer,
  recipientEmail: string,
  message?: string,
  onPhase?: (update: WeTransferSendPhaseUpdate) => void
): Promise<{ success: boolean; downloadUrl?: string; error?: string }> {
  try {
    const config = getWeTransferConfig();
    const transferId = await createTransfer(
      recipientEmail,
      message || 'Your personalized document',
      config
    );
    const { fileId, uploadUrl } = await createTransferFile(transferId, filename, fileBuffer, config);

    onPhase?.({
      phase: 'upload_started',
      detail: `Uploading "${filename}" (${fileBuffer.length} bytes)`,
    });

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(fileBuffer),
    });
    if (!uploadResponse.ok) {
      const uploadBody = await uploadResponse.text();
      throw new Error(`File upload failed [${uploadResponse.status}]: ${uploadBody}`);
    }

    onPhase?.({
      phase: 'upload_completed',
      detail: `Upload complete for "${filename}"`,
    });

    await completeTransferFile(transferId, fileId, config);
    onPhase?.({
      phase: 'send_submitted',
      detail: `Transfer ${transferId} finalized request submitted`,
    });

    const downloadUrl = await finalizeTransfer(transferId, config);
    if (!downloadUrl) {
      throw new Error('Transfer finalized but no download URL was returned');
    }

    onPhase?.({
      phase: 'send_confirmed',
      detail: `Transfer confirmed for ${recipientEmail}`,
    });

    return {
      success: true,
      downloadUrl,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message,
    };
  }
}
