import { AppState } from "@core/appState";
import { logCore, warnCore } from "@core/logger";
import type { Lyric, LyricSourceResult } from "./shared";

/**
 * The upgrade path: this browser racing providers and finding something better
 * than the server did, and handing it back.
 *
 * The direction that used to exist was one-way. The extension asks the server for
 * lyrics and renders whatever comes back; the server never learns anything the
 * browser learned. That wastes the one place where a real race happens: the
 * extension tries more providers than we do, so it regularly ends up with
 * word-by-word timing where our pool only had line-sync -- or with a song our
 * database does not have at all, which is the case this is really for.
 *
 * So: remember the tier the server handed us, and when OUR race ends on a
 * strictly better tier from a different provider, POST it to
 * /api/lyrics/contribute with the push key. The server re-checks the tier itself
 * and refuses anything that does not beat what is on disk, so a stale "I was
 * better" claim from a cached response cannot downgrade an entry.
 *
 * Only the strict-improvement case is sent. A tie is not worth a write: it would
 * be the same text, and the server would refuse it anyway.
 */

// videoId:lang -> the tier the server served us. -1 = it had nothing.
//
// An ABSENT entry means "we never asked", which is NOT the same as -1: it sends
// nothing, because we cannot claim to have beaten a server we never spoke to.
const serverTiers = new Map<string, number>();
// videoId:lang -> the best tier already pushed, so a song that repeats (or a
// replay of the same page) does not re-POST on every visit.
const pushedTiers = new Map<string, number>();

function tierKey(videoId: string, lang: string): string {
  return `${videoId}:${lang}`;
}

/**
 * Our tier scale, identical to the server's rerace._tier: 2 word-by-word,
 * 1 line-synced, 0 plain, -1 nothing.
 *
 * Two parts is the test, not a flag: the server's `_wbw_line_count` works the
 * same way, and trusting each provider's own idea of what it is is how a plain
 * result ends up claiming to be richsync.
 */
export function tierOf(result: Pick<LyricSourceResult, "lyrics"> | null | undefined): number {
  const lyrics = result?.lyrics;
  if (!lyrics || lyrics.length === 0) return -1;
  for (const lyric of lyrics as Lyric[]) {
    if (lyric.isInstrumental) continue;
    const parts = lyric.parts;
    if (parts && parts.length > 1) return 2;
  }
  // No provider here sets a `synced` flag, so read the shape: an unsynced
  // plain-text source carries no timings at all.
  return lyrics.some(lyric => (lyric.startTimeMs ?? 0) > 0) ? 1 : 0;
}

/** Called by the ytmu provider with the tier of what the server just served. */
export function noteServerTier(videoId: string, lang: string, tier: number): void {
  serverTiers.set(tierKey(videoId, lang), tier);
}

export interface UpgradeContext {
  videoId: string;
  lang: string;
  song?: string;
  artist?: string;
  durationMs?: number;
}

interface ContributePart {
  startTimeMs: number;
  durationMs: number;
  words: string;
}

function toContributeLines(lyrics: Lyric[], lang: string): { lines: Record<string, unknown>[]; wordSynced: boolean } {
  const lines: Record<string, unknown>[] = [];
  let wordSynced = false;
  for (const lyric of lyrics) {
    // An instrumental marker is OUR line, not the provider's: the server derives
    // them from the gaps and would derive a second copy.
    if (lyric.isInstrumental) continue;
    const words = lyric.words ?? "";
    if (!words) continue;

    const parts: ContributePart[] = [];
    for (const part of lyric.parts ?? []) {
      if (!part.words) continue;
      parts.push({
        startTimeMs: Math.round(part.startTimeMs ?? 0),
        durationMs: Math.round(part.durationMs ?? 0),
        words: part.words,
      });
    }

    const line: Record<string, unknown> = {
      startTimeMs: Math.round(lyric.startTimeMs ?? 0),
      durationMs: Math.round(lyric.durationMs ?? 0),
      words,
    };
    // Two parts is karaoke; one part is a line with a duration, and the server
    // drops the parts of any line that is not genuinely word-timed.
    if (parts.length > 1) {
      line.parts = parts;
      wordSynced = true;
    }
    // Only present when translate is on and the winner was NOT us, in which case
    // `translations[lang]` is what injectLyrics filled in: the wording on screen.
    const translation = lyric.translations?.[lang];
    if (translation) {
      line.translations = { [lang]: translation };
    }
    lines.push(line);
  }
  return { lines, wordSynced };
}

/**
 * Offer a result we just won with to the server. Fire and forget: a refused
 * contribution is a normal outcome (someone else upgraded it first, or no key is
 * configured), never something the lyric display waits on or reports.
 */
export function offerUpgradeToServer(result: LyricSourceResult, context: UpgradeContext): void {
  if (!AppState.isYtmuUpgradeEnabled) return;
  const pushKey = AppState.ytmuPushKey;
  if (!pushKey) return;
  if (!result?.lyrics || result.lyrics.length === 0) return;
  // Our own provider's result IS the server's entry; sending it back would be a
  // no-op write on every play.
  if (result.source === "YT Music Ultimate") return;

  const { videoId, lang } = context;
  const key = tierKey(videoId, lang);
  const serverTier = serverTiers.get(key);
  if (serverTier === undefined) return;

  const ourTier = tierOf(result);
  if (ourTier <= serverTier) return;
  if ((pushedTiers.get(key) ?? -1) >= ourTier) return;

  void send(result, context, ourTier, false);
}

/**
 * Push what is on screen RIGHT NOW, tier comparison aside.
 *
 * This is the button in Sources, and it exists because the automatic gate cannot
 * cover every case. The gate only ever moves a tier UP, so it stays silent on a
 * song where this browser's provider simply knows something the server does not
 * and never will: a lyric fix, a re-sync, a provider we do not carry. This one is
 * an explicit "take this, I am looking at it".
 *
 * Force means force on the server too (`force: true` skips the tier check), so
 * the entry is replaced rather than refused -- which is the whole point of a
 * button, and is why the server logs it as a force so it is never mistaken for
 * an upgrade.
 */
export async function pushCurrentLyrics(): Promise<{ ok: boolean; error?: string; tier?: string }> {
  if (!AppState.ytmuPushKey) {
    return { ok: false, error: "no push key" };
  }
  const lines = AppState.parsedLyrics?.lyrics ?? [];
  if (lines.length === 0) {
    return { ok: false, error: "no lyrics loaded" };
  }
  const videoId = AppState.lastLoadedVideoId ?? AppState.lastVideoId;
  if (!videoId) {
    return { ok: false, error: "no song playing" };
  }
  const details = AppState.lastVideoDetails;
  const lang = AppState.translationLanguage || "zh-TW";
  return send(
    {
      lyrics: lines,
      source: AppState.currentProviderKey || "browser",
      sourceHref: "",
    },
    {
      videoId,
      lang,
      song: details?.song,
      artist: details?.artist,
      durationMs: Number(details?.duration) || undefined,
    },
    tierOf({ lyrics: lines }),
    true
  );
}

async function send(
  result: LyricSourceResult,
  context: UpgradeContext,
  ourTier: number,
  force: boolean
): Promise<{ ok: boolean; error?: string; tier?: string }> {
  const { videoId, lang } = context;
  const key = tierKey(videoId, lang);
  const pushKey = AppState.ytmuPushKey;
  const { lines, wordSynced } = toContributeLines(result.lyrics as Lyric[], lang);
  if (lines.length === 0) {
    return { ok: false, error: "nothing to send" };
  }

  const source = (result.source || "browser").slice(0, 64);
  const body = {
    video_id: videoId,
    lang,
    source,
    node_id: "better-lyrics",
    force,
    song: context.song ?? result.song ?? "",
    artist: context.artist ?? result.artist ?? "",
    data: {
      lyrics: lines,
      synced: ourTier >= 1,
      wordSynced,
      duration: context.durationMs ?? result.duration ?? 0,
    },
  };

  // Mark it as sent before the request resolves, not after: a slow or failing POST
  // must not turn into one per render pass. The server refuses a repeat anyway, so
  // an optimistic mark only ever costs one redundant attempt. A forced push is a
  // button press and marks nothing -- pressing twice must send twice.
  if (!force) {
    pushedTiers.set(key, ourTier);
  }

  try {
    const response = (await chrome.runtime.sendMessage({
      action: "contributeYTMULyrics",
      payload: { key: pushKey, body },
    })) as {
      ok?: boolean;
      status?: number;
      error?: string;
      data?: { tier?: string; skipped?: boolean; error?: string };
    };
    if (!response?.ok) {
      // A refusal means the entry is already at least this good, so the mark
      // stays. A 401 means this profile may not write at all, so the mark goes
      // and a later song can try again.
      if (!force && response?.status === 401) {
        pushedTiers.delete(key);
      }
      const detail = response?.data?.error ?? response?.error ?? `status ${response?.status ?? "?"}`;
      warnCore("YT Music Ultimate lyrics not stored:", detail);
      return { ok: false, error: detail };
    }
    logCore(
      force ? "YT Music Ultimate lyrics pushed by hand" : "YT Music Ultimate upgrade pushed",
      videoId,
      response.data?.skipped ? "server already had it" : `stored ${response.data?.tier ?? ourTier}`,
      `${lines.length} lines from ${source}`
    );
    return { ok: true, tier: response.data?.tier };
  } catch (error) {
    if (!force) {
      pushedTiers.delete(key);
    }
    warnCore("YT Music Ultimate push errored:", error);
    return { ok: false, error: String(error) };
  }
}
