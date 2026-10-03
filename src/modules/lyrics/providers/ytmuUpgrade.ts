import { AppState } from "@core/appState";
import { logCore, warnCore } from "@core/logger";
import type { Lyric, LyricSourceResult } from "./shared";

/**
 * The upgrade path: this browser racing providers and finding something better
 * than the server did, and handing it back.
 *
 * The direction that used to exist was one-way. The extension asks the server
 * for lyrics and renders whatever comes back; the server never learns anything
 * the browser learned. That wastes the one place where a real race happens:
 * the extension tries more providers than we do (and has the song's own page to
 * read), so it regularly ends up with word-by-word timing where our pool only
 * had line-sync, or a provider we do not carry at all. That result is thrown
 * away on the next song change.
 *
 * So: remember the tier the server handed us, and when OUR race ends on a
 * strictly better tier from a different provider, POST it to
 * /api/lyrics/contribute with the push key. The server re-checks the tier
 * itself and refuses anything that does not beat what is on disk, so a stale
 * "I was better" claim from a cached response cannot downgrade an entry.
 *
 * Only the strict-improvement case is sent. A tie is not worth a write: it
 * would be the same text, and the server would refuse it anyway.
 */

// videoId:lang -> the tier the server served us. -1 = it had nothing.
//
// An ABSENT entry means "we never asked", which is not the same as -1: with the
// ytmu source disabled this map stays empty, and reading that as "the server has
// nothing" would make every provider look like an upgrade and push on every
// song. An unknown tier sends nothing.
const serverTiers = new Map<string, number>();
// videoId:lang -> the best tier we have already pushed, so a song that repeats
// (or a replay of the same page) does not re-POST on every visit.
const pushedTiers = new Map<string, number>();

function tierKey(videoId: string, lang: string): string {
  return `${videoId}:${lang}`;
}

/**
 * Our tier scale, identical to the server's rerace._tier: 2 word-by-word,
 * 1 line-synced, 0 plain, -1 nothing.
 *
 * Two parts is the test, not a flag. The server's `_wbw_line_count` works the
 * same way, and the alternative -- trusting each provider's own idea of what it
 * is -- is how a plain result ends up claiming to be richsync.
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
  // plain-text source has no timings at all.
  return lyrics.some(lyric => (lyric.startTimeMs ?? 0) > 0) ? 1 : 0;
}

/** Called by the ytmu provider with the tier of what the server just served. */
export function noteServerTier(videoId: string, lang: string, tier: number): void {
  serverTiers.set(tierKey(videoId, lang), tier);
}

/** Drops both memories for a song. Used when the language changes under us. */
export function forgetServerTier(videoId: string, lang: string): void {
  const key = tierKey(videoId, lang);
  serverTiers.delete(key);
  pushedTiers.delete(key);
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
    // An instrumental marker is OUR line, not the provider's: the server
    // derives them from the gaps (cache._insert_instrumental_gaps) and would
    // derive them again. Pushing one back would double every break.
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
    // The translation is only here if the user has translate on AND the pusher
    // is not us: for a non-YTMU result, `translations[lang]` is what
    // injectLyrics filled in, which is the wording the user is looking at.
    const translation = lyric.translations?.[lang];
    if (translation) {
      line.translations = { [lang]: translation };
    }
    lines.push(line);
  }
  return { lines, wordSynced };
}

export interface UpgradeContext {
  videoId: string;
  lang: string;
  song?: string;
  artist?: string;
  durationMs?: number;
}

/**
 * Offer a result we just won with to the server. Fire and forget: a refused
 * contribution is a normal outcome (someone else upgraded it first, or no key
 * is configured), never something the lyric display waits on or reports.
 */
export function offerUpgradeToServer(result: LyricSourceResult, context: UpgradeContext): void {
  if (!AppState.isYtmuUpgradeEnabled) return;
  const pushKey = AppState.ytmuPushKey;
  if (!pushKey) return;
  if (!result?.lyrics || result.lyrics.length === 0) return;
  // Our own provider's result IS the server's entry; sending it back would be
  // a no-op write on every play.
  if (result.source === "YT Music Ultimate") return;

  const { videoId, lang } = context;
  const key = tierKey(videoId, lang);
  const serverTier = serverTiers.get(key);
  // Never asked: we cannot claim to have beaten what we did not see.
  if (serverTier === undefined) return;

  const ourTier = tierOf(result);
  if (ourTier <= serverTier) return;
  if ((pushedTiers.get(key) ?? -1) >= ourTier) return;

  const { lines, wordSynced } = toContributeLines(result.lyrics as Lyric[], lang);
  if (lines.length === 0) return;

  const source = (result.source || "browser").slice(0, 64);
  const body = {
    video_id: videoId,
    lang,
    source,
    node_id: "better-lyrics",
    song: context.song ?? result.song ?? "",
    artist: context.artist ?? result.artist ?? "",
    data: {
      lyrics: lines,
      synced: ourTier >= 1,
      wordSynced,
      duration: context.durationMs ?? result.duration ?? 0,
    },
  };

  // Mark it as sent before the request resolves, not after: a slow or failing
  // POST must not turn into one per render pass. The server refuses a repeat
  // anyway, so an optimistic mark only ever costs one redundant attempt.
  pushedTiers.set(key, ourTier);

  // Both tiers are non-negative past this point, so a plain interpolation is
  // safe and keeps the log line readable.
  void chrome.runtime
    .sendMessage({ action: "contributeYTMULyrics", payload: { key: pushKey, body } })
    .then(
      (response: { ok?: boolean; status?: number; error?: string; data?: { tier?: string; skipped?: boolean } }) => {
        if (!response?.ok) {
          // Auth failure or a refused body: let a later song try again rather than
          // remembering this tier as pushed for good. A plain "not better" is the
          // server's answer to a claim that lost a race we did not see, and
          // keeping the mark is right -- the entry is already at least this good.
          if (response?.status === 401) {
            pushedTiers.delete(key);
          }
          warnCore("YT Music Ultimate upgrade not stored:", response?.status ?? response?.error ?? response);
          return;
        }
        logCore(
          "YT Music Ultimate upgrade pushed",
          videoId,
          response.data?.skipped ? "server already had it" : `stored ${response.data?.tier ?? ourTier}`,
          `server ${serverTier} -> ours ${ourTier}`,
          `${lines.length} lines from ${source}`
        );
      }
    )
    .catch(error => {
      pushedTiers.delete(key);
      warnCore("YT Music Ultimate upgrade push errored:", error);
    });
}
