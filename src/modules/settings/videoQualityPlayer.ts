import {
  normalizeVideoQualitySettings,
  selectVideoQuality,
  VIDEO_QUALITY_REQUEST_EVENT,
  VIDEO_QUALITY_SETTINGS_EVENT,
  type VideoQualitySettings,
} from "./videoQuality";

type PlayerVars = Record<string, unknown>;
type PlayerMethod = (vars: PlayerVars, ...args: unknown[]) => unknown;
export interface VideoQualityPlayer {
  [key: string]: unknown;
  getVideoData?: () => { video_id?: string; isLive?: boolean };
  getAvailableQualityLevels?: () => string[];
  setPlaybackQualityRange?: (min: string, max: string) => void;
  getPlayerState?: () => number;
  getAdState?: () => number;
  getPlayerResponse?: () => { streamingData?: { adaptiveFormats?: { height?: number }[] } };
  updateVideoData?: (vars: PlayerVars, refresh: boolean) => void;
}

const LOAD_METHODS = [
  "loadVideoByPlayerVars",
  "cueVideoByPlayerVars",
  "preloadVideoByPlayerVars",
  "queueNextVideo",
  "enqueueVideoByPlayerVars",
] as const;

/** Preserve Music's audio, queue, authentication, timing, and content-check arguments. */
export function patchVideoQualityPlayer(
  api: VideoQualityPlayer,
  settings: () => VideoQualitySettings | null
): () => void {
  const hooks: { name: string; original: PlayerMethod; wrapped: PlayerMethod }[] = [];
  for (const name of LOAD_METHODS) {
    const original = api[name];
    if (typeof original !== "function") continue;
    const wrapped: PlayerMethod = function (this: unknown, vars, ...args) {
      const audioOnly = [true, 1, "1", "True"].includes(vars?.audio_only as never);
      const isVideo = typeof (vars?.video_id ?? vars?.videoId) === "string" && !audioOnly;
      const override = settings()?.isHighResolutionVideoEnabled && isVideo;
      return Reflect.apply(original, this, [override ? { ...vars, prefer_gapless: false } : vars, ...args]);
    };
    api[name] = wrapped;
    hooks.push({ name, original: original as PlayerMethod, wrapped });
  }
  return () => {
    for (const { name, original, wrapped } of hooks) {
      if (api[name] === wrapped) api[name] = original;
    }
  };
}

/** MAIN-world entrypoint. Music's API proxy is distinct from the DOM movie_player. */
export function startVideoQualityPlayer(doc: Document = document, win: Window = window): () => void {
  let settings: VideoQualitySettings | null = null;
  let disposed = false;
  let api: VideoQualityPlayer | null = null;
  let unpatch: (() => void) | undefined;
  let pending = false;
  let lastQualityKey = "";
  let initialRefreshKey = "";

  const applyQuality = (): void => {
    if (!api || !settings) return;
    try {
      if (doc.querySelector(".ad-showing, ytmusic-player-bar[is-advertisement]") || api.getAdState?.() === 1) return;
      const data = api.getVideoData?.();
      if (!data?.video_id || data.isLive || api.getPlayerState?.() === -1) return;
      const available = api.getAvailableQualityLevels?.() ?? [];
      // Audio-only requests have no selectable video qualities.
      if (!available.some(quality => quality !== "auto")) {
        lastQualityKey = "";
        return;
      }
      // Music may start its first video before getPlayer() resolves. Refresh its
      // existing data in place once, without reconstructing load arguments or
      // restarting the track. The second argument asks the player to refilter.
      if (
        settings.isHighResolutionVideoEnabled &&
        initialRefreshKey !== data.video_id &&
        !available.some(quality => ["hd1440", "hd2160", "hd2880", "hd4320", "highres"].includes(quality)) &&
        api.getPlayerResponse?.().streamingData?.adaptiveFormats?.some(format => (format.height ?? 0) > 1080) &&
        typeof api.updateVideoData === "function"
      ) {
        initialRefreshKey = data.video_id;
        api.updateVideoData({ prefer_gapless: false }, true);
        return;
      }
      const quality = selectVideoQuality(settings, available);
      const key = `${data.video_id}:${available.join(",")}:${quality}`;
      if (key === lastQualityKey || typeof api.setPlaybackQualityRange !== "function") return;
      api.setPlaybackQualityRange(quality, quality);
      lastQualityKey = key;
    } catch {
      // These are undocumented APIs; failure must not interrupt Music playback.
    }
  };

  const connect = (): void => {
    if (disposed || pending || !settings) return;
    const host = doc.querySelector("ytmusic-player") as (HTMLElement & { getPlayer?: () => unknown }) | null;
    if (typeof host?.getPlayer !== "function") return;
    pending = true;
    try {
      Promise.resolve(host.getPlayer())
        .then(value => {
          if (disposed || !host.isConnected || !value || typeof value !== "object") return;
          const next = value as VideoQualityPlayer;
          if (typeof next.loadVideoByPlayerVars !== "function") return;
          if (next !== api) {
            unpatch?.();
            api = next;
            unpatch = patchVideoQualityPlayer(api, () => settings);
            lastQualityKey = "";
            initialRefreshKey = "";
          }
          observer.disconnect();
          applyQuality();
        })
        .catch(() => {})
        .finally(() => {
          pending = false;
        });
    } catch {
      pending = false;
    }
  };

  const receive = (event: Event): void => {
    try {
      const raw: unknown = JSON.parse((event as CustomEvent<string>).detail);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const next = normalizeVideoQualitySettings(raw);
      if (next.isHighResolutionVideoEnabled !== settings?.isHighResolutionVideoEnabled) initialRefreshKey = "";
      settings = next;
      lastQualityKey = "";
      connect();
    } catch {
      /* Ignore unrelated/malformed page events. */
    }
  };
  doc.addEventListener(VIDEO_QUALITY_SETTINGS_EVENT, receive);
  doc.addEventListener("yt-navigate-finish", connect);
  doc.addEventListener("loadedmetadata", applyQuality, true);
  // Catch the initial custom-element upgrade and API readiness before first playback.
  const observer = new MutationObserver(connect);
  observer.observe(doc, { childList: true, subtree: true });
  const interval = win.setInterval(connect, 1000);
  doc.dispatchEvent(new Event(VIDEO_QUALITY_REQUEST_EVENT));
  return () => {
    disposed = true;
    observer.disconnect();
    win.clearInterval(interval);
    unpatch?.();
    doc.removeEventListener(VIDEO_QUALITY_SETTINGS_EVENT, receive);
    doc.removeEventListener("yt-navigate-finish", connect);
    doc.removeEventListener("loadedmetadata", applyQuality, true);
  };
}
