import {
  DEFAULT_VIDEO_QUALITY_SETTINGS,
  normalizeVideoQualitySettings,
  VIDEO_QUALITY_REQUEST_EVENT,
  VIDEO_QUALITY_SETTINGS_EVENT,
} from "./videoQuality";

/** ISOLATED-world storage -> MAIN-world player settings, including startup/reinjection. */
export function startVideoQualitySettingsBridge(): () => void {
  let disposed = false;
  let revision = 0;
  const publish = async (): Promise<void> => {
    const current = ++revision;
    try {
      const raw = await chrome.storage.sync.get({ ...DEFAULT_VIDEO_QUALITY_SETTINGS });
      if (disposed || current !== revision) return;
      document.dispatchEvent(
        new CustomEvent(VIDEO_QUALITY_SETTINGS_EVENT, {
          // A string can cross Firefox's isolated/page-world boundary too.
          detail: JSON.stringify(normalizeVideoQualitySettings(raw)),
        })
      );
    } catch {
      // Leave native playback alone if extension storage is unavailable.
    }
  };
  const request = (): void => {
    void publish();
  };
  const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area === "sync" && Object.keys(DEFAULT_VIDEO_QUALITY_SETTINGS).some(key => key in changes)) request();
  };
  document.addEventListener(VIDEO_QUALITY_REQUEST_EVENT, request);
  chrome.storage.onChanged.addListener(changed);
  request();
  return () => {
    disposed = true;
    document.removeEventListener(VIDEO_QUALITY_REQUEST_EVENT, request);
    chrome.storage.onChanged.removeListener(changed);
  };
}
