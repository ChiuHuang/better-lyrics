// -- Rules --------------------------

const IDENTITY_BACKUP_KEY = "identityBackedUpKeyId";
const PENDING_BACKUP_KEY = "identityBackupPending";

export function isIdentityBackedUp(storedKeyId: unknown, currentKeyId: string): boolean {
  return typeof storedKeyId === "string" && storedKeyId.length > 0 && storedKeyId === currentKeyId;
}

interface DownloadDelta {
  id: number;
  state?: { current?: string };
}

interface PendingBackupSettlement {
  backedUpKeyId: string | null;
  clearPending: boolean;
}

function isPendingBackup(value: unknown): value is { downloadId: number; keyId: string } {
  if (typeof value !== "object" || value === null) return false;
  const { downloadId, keyId } = value as Record<string, unknown>;
  return typeof downloadId === "number" && typeof keyId === "string" && keyId.length > 0;
}

export function settlePendingBackup(pending: unknown, delta: DownloadDelta): PendingBackupSettlement {
  const untouched = { backedUpKeyId: null, clearPending: false };
  if (!isPendingBackup(pending) || pending.downloadId !== delta.id) return untouched;
  if (delta.state?.current === "complete") return { backedUpKeyId: pending.keyId, clearPending: true };
  if (delta.state?.current === "interrupted") return { backedUpKeyId: null, clearPending: true };
  return untouched;
}

// -- Storage --------------------------

function pendingArea(): chrome.storage.StorageArea {
  return chrome.storage.session ?? chrome.storage.local;
}

export async function readBackedUpKeyId(): Promise<unknown> {
  const items = await chrome.storage.local.get(IDENTITY_BACKUP_KEY);
  return items[IDENTITY_BACKUP_KEY];
}

export async function markIdentityBackedUp(keyId: string): Promise<void> {
  await chrome.storage.local.set({ [IDENTITY_BACKUP_KEY]: keyId });
}

export async function rememberPendingBackup(downloadId: number, keyId: string): Promise<void> {
  await pendingArea().set({ [PENDING_BACKUP_KEY]: { downloadId, keyId } });
}

export function onBackupFlagChanged(callback: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[IDENTITY_BACKUP_KEY]) callback();
  });
}

// -- Background watcher --------------------------

async function settleDownload(delta: DownloadDelta): Promise<void> {
  const area = pendingArea();
  const items = await area.get(PENDING_BACKUP_KEY);
  const { backedUpKeyId, clearPending } = settlePendingBackup(items[PENDING_BACKUP_KEY], delta);
  if (backedUpKeyId) await markIdentityBackedUp(backedUpKeyId);
  if (clearPending) await area.remove(PENDING_BACKUP_KEY);
}

let watchingDownloads = false;

export function initIdentityBackupWatcher(onError: (error: unknown) => void): void {
  const watch = (): void => {
    if (watchingDownloads || !chrome.downloads?.onChanged) return;
    watchingDownloads = true;
    chrome.downloads.onChanged.addListener(delta => {
      settleDownload(delta).catch(onError);
    });
  };
  watch();
  chrome.permissions?.onAdded?.addListener(watch);
}
