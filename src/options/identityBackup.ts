// -- Rules --------------------------

const IDENTITY_BACKUP_KEY = "identityBackedUpKeyId";

export function isIdentityBackedUp(storedKeyId: unknown, currentKeyId: string): boolean {
  return typeof storedKeyId === "string" && storedKeyId.length > 0 && storedKeyId === currentKeyId;
}

interface DownloadDelta {
  id: number;
  state?: { current?: string };
}

export function downloadCompleted(delta: DownloadDelta, downloadId: number): boolean {
  return delta.id === downloadId && delta.state?.current === "complete";
}

// -- Storage --------------------------

export async function readBackedUpKeyId(): Promise<unknown> {
  const items = await chrome.storage.local.get(IDENTITY_BACKUP_KEY);
  return items[IDENTITY_BACKUP_KEY];
}

export async function markIdentityBackedUp(keyId: string): Promise<void> {
  await chrome.storage.local.set({ [IDENTITY_BACKUP_KEY]: keyId });
}

export function markWhenDownloadCompletes(downloadId: number, keyId: string, onMarked: () => void): void {
  const listener = (delta: chrome.downloads.DownloadDelta): void => {
    if (delta.id !== downloadId) return;
    if (downloadCompleted(delta, downloadId)) {
      chrome.downloads.onChanged.removeListener(listener);
      void markIdentityBackedUp(keyId).then(onMarked);
    } else if (delta.state?.current === "interrupted") {
      chrome.downloads.onChanged.removeListener(listener);
    }
  };
  chrome.downloads.onChanged.addListener(listener);
}
