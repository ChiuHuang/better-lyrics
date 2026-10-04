import { AppState } from "@core/appState";
import { YTMU_SERVER_ORIGIN } from "@core/constants";
import { logCore, warnCore } from "@core/logger";
import type { Lyric, LyricPart, LyricSourceKey, LyricSourceResult, ProviderParameters } from "./shared";
import { noteServerTier } from "./ytmuUpgrade";

/**
 * YT Music Ultimate: the viewer's own lyrics server, as a provider.
 *
 * One HTTP response serves all three source keys, and each key only fills when
 * it matches the tier that came back (word > line > plain).
 *
 * THE DEADLINE IS THE WHOLE DESIGN. The server is a full fetch pipeline, and on
 * the deployed host a cold song measured 11s, 27s and 46s (that last one found
 * nothing at all) because this request carries no JWT, so the Cubey tier is
 * skipped. The provider race is sequential -- `for (const provider of
 * orderedProviders) await getLyrics(...)` -- so a slow provider early in the
 * order holds every other one hostage. That is what "still searching for synced
 * lyrics" was: 23 extension requests, 23 cache misses, 11-55 seconds each.
 *
 * So this provider resolves EMPTY once the deadline passes and lets the race
 * carry on. The fetch is deliberately NOT aborted: the server keeps working and
 * writes the cache, so the next play of that song is a ~1ms hit carrying real
 * word timing. First play is fast; later plays are ours.
 */
const YTMU_SOURCE = "YT Music Ultimate";
const YTMU_HOMEPAGE = "https://github.com/ChiuHuang/ytmusicultimate";

/** How long we wait before letting the race continue without us. */
export const YTMU_DEADLINE_MS = 2500;

const YTMU_KEYS: readonly LyricSourceKey[] = ["ytmu-richsynced", "ytmu-synced", "ytmu-plain"];

/** videoId:lang -> the in-flight RAW fetch, shared by the three source keys. */
const activeFetches = new Map<string, Promise<YTMUResponse | null>>();

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
  isInstrumental?: boolean;
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

function isNotFound(data: YTMUResponse | null): boolean {
  if (!data) return true;
  const lyrics = data.lyrics ?? [];
  if (!Array.isArray(lyrics) || lyrics.length === 0) return true;
  if (data.source === "none" || data.source === "error") return true;
  if (lyrics.length === 1 && lyrics[0].text === "No lyrics found") return true;
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

/**
 * `isInstrumental` is the whole contract with braccato: the renderer draws a
 * note for a line carrying it and a text row for a line without it. The server
 * derives its markers from the gaps between lines and tags them; dropping the
 * flag while copying the fields one by one turned every break into a lyric line
 * reading "[instrumental]".
 *
 * The placeholder text is kept because it is what a plain-text consumer (our own
 * upgrade push, a bug report) sees, and braccato never draws it.
 */
function toLyrics(lines: YTMULine[], lang: string): Lyric[] {
  return lines
    .filter(line => typeof line.text === "string" && line.text.length > 0)
    .map(line => {
      const startTimeMs = Math.round(line.startTimeMs ?? (line.time ?? 0) * 1000);
      const durationMs = Math.round(line.durationMs ?? (line.duration ?? 0) * 1000);
      const parts = (line.parts ?? []).filter(part => (part.words ?? "").length > 0).map(toLyricPart);
      const result: Lyric = { startTimeMs, words: line.text as string, durationMs };
      if (parts.length > 0) {
        result.parts = parts;
      }
      if (line.isInstrumental === true) {
        result.isInstrumental = true;
      }
      if (line.translated && line.translated.length > 0) {
        // Per-line embedded translations. injectLyrics prefers these and keeps
        // the line out of its network batch, so a server translation is free.
        result.translations = { [lang]: line.translated };
      }
      return result;
    });
}

function fetchFromBackground(url: string): Promise<YTMUResponse | null> {
  return chrome.runtime
    .sendMessage({ action: "fetchYTMULyrics", url })
    .then((response: { ok?: boolean; status?: number; error?: string; data?: YTMUResponse }) => {
      if (!response?.ok) {
        warnCore("YT Music Ultimate fetch failed:", response?.status ?? response?.error);
        return null;
      }
      return response.data ?? null;
    })
    .catch(error => {
      warnCore("YT Music Ultimate fetch errored:", error);
      return null;
    });
}

/**
 * Await `request`, but not for longer than the deadline.
 *
 * The deadline settles the PROMISE THE RACE AWAITS. The request is deliberately
 * left running: the server keeps working and writes the cache, which is the whole
 * point -- a slow answer is still a cache write we get for free, and it is served
 * to the next play in about a millisecond.
 *
 * Each caller gets its own deadline around the SHARED request, so the second and
 * third source keys cost one server round-trip between them and cannot add
 * another 2.5 seconds to the race.
 */
function withDeadline(request: Promise<YTMUResponse | null>, deadlineMs: number): Promise<YTMUResponse | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>(resolve => {
    timer = setTimeout(() => resolve(null), deadlineMs);
  });
  return Promise.race([request, deadline]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** One request per video+language, shared by the three source keys. */
function sharedFetch(videoId: string, lang: string): Promise<YTMUResponse | null> {
  const key = `${videoId}:${lang}`;
  const existing = activeFetches.get(key);
  if (existing) return existing;
  const request = fetchFromBackground(requestUrl(videoId, lang));
  activeFetches.set(key, request);
  void request.finally(() => {
    if (activeFetches.get(key) === request) {
      activeFetches.delete(key);
    }
  });
  return request;
}

function requestUrl(videoId: string, lang: string): string {
  const url = new URL(YTMU_SERVER_ORIGIN + "/api/lyrics");
  url.searchParams.set("v", videoId);
  url.searchParams.set("lang", lang);
  // No `fast=1`: this is the request the iOS app makes. The fast path is LRCLib +
  // YouTube + a fast Google pass and no JWT, and it writes the `:fast` key while
  // the phone reads the full one -- so a browser on it can be served line-sync
  // or plain for a song the server holds word-by-word.
  return url.toString();
}

function fill(sourceMap: ProviderParameters["sourceMap"], data: YTMUResponse, videoId: string, lang: string): void {
  const lines = data.lyrics ?? [];
  const lyrics = toLyrics(lines, lang);
  if (lyrics.length === 0) {
    noteServerTier(videoId, lang, -1);
    return;
  }

  const hasRealWordSync = data.wordSynced === true || lines.some(line => line.wordSynced === true);
  const isSynced = data.synced === true;
  // The tier the SERVER holds, on the scale ytmuUpgrade.tierOf uses. Recorded on
  // every path, including the empty ones: a song the server does not have is
  // exactly the case the upgrade push exists for, and a tier left unrecorded
  // reads as "never asked", which is not the same thing.
  noteServerTier(videoId, lang, hasRealWordSync ? 2 : isSynced ? 1 : 0);

  const result: LyricSourceResult = {
    lyrics,
    source: YTMU_SOURCE,
    sourceHref: YTMU_HOMEPAGE,
    musicVideoSynced: false,
    cacheAllowed: true,
    song: data.song,
    artist: data.artist,
    album: data.album,
    duration: data.duration,
  };

  if (hasRealWordSync) {
    sourceMap["ytmu-richsynced"].lyricSourceResult = result;
  } else if (isSynced) {
    sourceMap["ytmu-synced"].lyricSourceResult = result;
  } else {
    sourceMap["ytmu-plain"].lyricSourceResult = result;
  }
  logCore(
    "YT Music Ultimate filled",
    videoId,
    hasRealWordSync ? "word" : isSynced ? "line" : "plain",
    `${lyrics.length} lines`
  );
}

export default async function ytmu(providerParameters: ProviderParameters): Promise<void> {
  const { sourceMap, videoId } = providerParameters;
  for (const key of YTMU_KEYS) {
    sourceMap[key].filled = true;
  }
  if (sourceMap["ytmu-richsynced"].lyricSourceResult) {
    return;
  }

  // 3.0 reads the target language from AppState (ProviderParameters no longer
  // carries it), so the provider asks where injectLyrics will look for it.
  const lang = AppState.translationLanguage || "zh-TW";

  const data = await withDeadline(sharedFetch(videoId, lang), YTMU_DEADLINE_MS);
  // A deadline resolves null and a miss resolves null-or-not-found; both mean
  // "we are not the answer for this song right now", and both record -1.
  if (isNotFound(data)) {
    noteServerTier(videoId, lang, -1);
    return;
  }
  fill(sourceMap, data as YTMUResponse, videoId, lang);
}
