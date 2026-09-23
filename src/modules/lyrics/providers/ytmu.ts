import { AppState } from "@core/appState";
import { logCore, warnCore } from "@core/logger";
import type { Lyric, LyricPart, LyricSourceKey, LyricSourceResult, ProviderParameters } from "./shared";

export const YTMU_SERVER_URL = "https://ytmtranslate.chiuhuang.dev";

const YTMU_SOURCE = "YT Music Ultimate";
const YTMU_HOMEPAGE = "https://github.com/ChiuHuang/ytmusicultimate";

const YTMU_KEYS: readonly LyricSourceKey[] = ["ytmu-richsynced", "ytmu-synced", "ytmu-plain"];

interface YTMUPart {
  startTimeMs?: number;
  durationMs?: number;
  words?: string;
  isBackground?: boolean;
}

interface YTMULine {
  time?: number;
  startTimeMs?: number;
  duration?: number;
  durationMs?: number;
  text?: string;
  translated?: string;
  wordSynced?: boolean;
  parts?: YTMUPart[];
}

interface YTMUResponse {
  lyrics?: YTMULine[];
  source?: string;
  synced?: boolean;
  wordSynced?: boolean;
  song?: string;
  artist?: string;
  album?: string;
  duration?: number;
  error?: string;
}

// One fetch per videoId+lang, shared across the three ytmu source keys.
// The server embeds translations for the requested lang, so keying by videoId
// alone would serve stale translations after a target-language switch.
const activeFetches = new Map<string, Promise<YTMUResponse | null>>();

function fetchCacheKey(videoId: string, lang: string): string {
  return `${videoId}:${lang}`;
}

function isNotFoundResponse(data: YTMUResponse | null): boolean {
  if (!data) return true;
  const lyrics = data.lyrics ?? [];
  if (!Array.isArray(lyrics) || lyrics.length === 0) return true;
  if (data.source === "none" || data.source === "error") return true;
  if (lyrics.length === 1 && "No lyrics found" === lyrics[0].text) return true;
  return false;
}

function toLyricPart(part: YTMUPart): LyricPart {
  return {
    startTimeMs: Math.round(part.startTimeMs ?? 0),
    durationMs: Math.round(part.durationMs ?? 0),
    words: part.words ?? "",
    isBackground: part.isBackground,
  };
}

function toLyrics(lines: YTMULine[], lang: string): Lyric[] {
  return lines
    .filter(line => typeof line.text === "string" && line.text.length > 0)
    .map(line => {
      const startTimeMs = Math.round(line.startTimeMs ?? (line.time ?? 0) * 1000);
      const durationMs = Math.round(line.durationMs ?? (line.duration ?? 0) * 1000);
      const parts = (line.parts ?? [])
        .filter(part => (part.words ?? "").length > 0)
        .map(toLyricPart);
      const result: Lyric = {
        startTimeMs,
        words: line.text!,
        durationMs,
      };
      if (parts.length > 0) {
        result.parts = parts;
      }
      if (line.translated && line.translated.length > 0) {
        result.translations = { [lang]: line.translated };
      }
      return result;
    });
}

async function fetchFromBackground(url: string): Promise<YTMUResponse | null> {
  try {
    const response = await chrome.runtime.sendMessage({ action: "fetchYTMULyrics", url });
    if (!response || !response.ok) {
      warnCore("YT Music Ultimate background fetch failed:", response?.status ?? response?.error);
      return null;
    }
    return response.data as YTMUResponse;
  } catch (error) {
    warnCore("YT Music Ultimate background fetch errored:", error);
    return null;
  }
}

async function fetchYTMU(providerParameters: ProviderParameters, lang: string): Promise<YTMUResponse | null> {
  const dedupKey = fetchCacheKey(providerParameters.videoId, lang);
  const existing = activeFetches.get(dedupKey);
  if (existing) return existing;

  const promise = (async () => {
    const url = new URL(YTMU_SERVER_URL + "/api/lyrics");
    url.searchParams.set("v", providerParameters.videoId);
    url.searchParams.set("lang", lang);
    url.searchParams.set("fast", "1");
    return fetchFromBackground(url.toString());
  })();

  activeFetches.set(dedupKey, promise);
  void promise.finally(() => {
    if (activeFetches.get(dedupKey) === promise) {
      activeFetches.delete(dedupKey);
    }
  });
  return promise;
}

/**
 * YT Music Ultimate provider: proxies the user's lyrics server
 * (https://ytmtranslate.chiuhuang.dev/api/lyrics). The single HTTP response is
 * shared across the three ytmu source keys and each key only fills when it
 * matches the returned sync tier (word > line > plain).
 */
export default async function ytmu(
  providerParameters: ProviderParameters,
  _targetSource: LyricSourceKey
): Promise<void> {
  const { sourceMap } = providerParameters;

  // Mark every ytmu key filled so later attempts skip re-fetching.
  for (const key of YTMU_KEYS) {
    sourceMap[key].filled = true;
  }

  // A previous attempt already stored a tier result.
  if (sourceMap["ytmu-richsynced"].lyricSourceResult || sourceMap["ytmu-synced"].lyricSourceResult || sourceMap["ytmu-plain"].lyricSourceResult) {
    return;
  }

  const lang = providerParameters.translationLang || AppState.translationLanguage || "zh-TW";
  const data = await fetchYTMU(providerParameters, lang);
  if (isNotFoundResponse(data)) {
    return;
  }

  const lines = data!.lyrics ?? [];
  const lyrics = toLyrics(lines, lang);
  if (lyrics.length === 0) {
    return;
  }

  const hasRealWordSync = data!.wordSynced === true || lines.some(line => line.wordSynced === true);
  const isSynced = data!.synced === true;

  const result: LyricSourceResult = {
    lyrics,
    source: YTMU_SOURCE,
    sourceHref: YTMU_HOMEPAGE,
    musicVideoSynced: false,
    cacheAllowed: true,
    song: data!.song || providerParameters.song,
    artist: data!.artist || providerParameters.artist,
    duration: providerParameters.duration,
  };

  if (hasRealWordSync) {
    sourceMap["ytmu-richsynced"].lyricSourceResult = result;
  } else if (isSynced) {
    sourceMap["ytmu-synced"].lyricSourceResult = result;
  } else {
    sourceMap["ytmu-plain"].lyricSourceResult = result;
  }

  logCore("YT Music Ultimate provider filled", providerParameters.videoId, hasRealWordSync ? "word" : isSynced ? "line" : "plain", `${lyrics.length} lines`);
}