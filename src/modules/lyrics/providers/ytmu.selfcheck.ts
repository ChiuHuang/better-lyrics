import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

/**
 * Self-check for the provider's DEADLINE, which is the whole reason this provider
 * can sit first in the race.
 *
 * The deployed server answers a cold song in 11-55 seconds (measured: 23 browser
 * requests, 23 cache misses, worst 46s for a song it did not even find). The race
 * awaits providers one at a time, so an unbounded first provider means the page
 * says "still searching for synced lyrics" for the length of a fetch it does not
 * even need yet.
 *
 * So: the provider settles EMPTY at the deadline and the race moves on, while the
 * request keeps running so the server still fills its cache for the next play.
 * These assertions are about that shape -- resolve early, keep the request, do not
 * fill the sourceMap on a timeout, and do fill it when the answer beats the clock.
 */

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://music.youtube.com/" });
const testWindow = dom.window as unknown as Window & typeof globalThis;
testWindow.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
Object.defineProperty(testWindow.document, "fonts", {
  configurable: true,
  value: { ready: Promise.resolve(), check: () => true, addEventListener: () => {}, removeEventListener: () => {} },
});

type PendingFetch = { url: string; resolve: (value: unknown) => void };
const pending: PendingFetch[] = [];
let aborted = 0;
const globalRecord = globalThis as unknown as Record<string, unknown>;
globalRecord.chrome = {
  runtime: {
    getManifest: () => ({ version: "0.0.0-selfcheck" }),
    // The provider never calls fetch itself: it asks the worker, and never aborts
    // what it asked for.
    sendMessage: (message: { action: string; url?: string }) => {
      assert.equal(message.action, "fetchYTMULyrics");
      return new Promise(resolve => {
        pending.push({ url: message.url ?? "", resolve });
      });
    },
    getURL: (path: string) => `chrome-extension://self/${path}`,
  },
  storage: {
    sync: { get: (_k: unknown, cb?: (items: Record<string, unknown>) => void) => cb?.({}), set: () => {} },
    local: {
      get: (_k: unknown, cb?: (items: Record<string, unknown>) => void) => cb?.({}),
      set: () => {},
    },
    onChanged: { addListener: () => {} },
  },
};
// Aborting is the failure mode worth asserting against: an aborted request throws
// server-side work away.
(globalThis as unknown as { fetch: unknown }).fetch = ((_url: string, init?: { signal?: AbortSignal }) => {
  init?.signal?.addEventListener("abort", () => aborted++);
  throw new Error("the provider must not fetch directly");
}) as unknown as typeof fetch;

Object.assign(globalThis, {
  window: testWindow,
  document: testWindow.document,
  CustomEvent: testWindow.CustomEvent,
  Event: testWindow.Event,
  matchMedia: testWindow.matchMedia,
  DOMParser: testWindow.DOMParser,
  Node: testWindow.Node,
  MutationObserver: testWindow.MutationObserver,
  ResizeObserver:
    testWindow.ResizeObserver ??
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
});

const { AppState } = await import("@core/appState");
const { YTMU_SERVER_ORIGIN } = await import("@core/constants");
const { default: ytmu, YTMU_DEADLINE_MS } = await import("./ytmu");
type SourceMapType = import("./shared").SourceMapType;
type LyricSourceKey = import("./shared").LyricSourceKey;

AppState.translationLanguage = "zh-TW";

/**
 * A real source map, not a Proxy: the provider WRITES through it
 * (`sourceMap[key].lyricSourceResult = result`), so a stub that hands out a fresh
 * object per read would swallow every write and make the assertions below
 * meaningless.
 */
const ALL_KEYS: LyricSourceKey[] = [
  "ytmu-richsynced",
  "ytmu-synced",
  "ytmu-plain",
  "bLyrics-richsynced",
  "unison-richsynced",
  "unison-plain",
  "musixmatch-richsync",
  "portato-richsynced",
  "binimum-richsynced",
  "binimum-synced",
  "bLyrics-synced",
  "unison-wordsynced",
  "unison-synced",
  "yt-captions",
  "lrclib-synced",
  "lrclib-plain",
  "legato-synced",
  "musixmatch-synced",
  "yt-lyrics",
];

function fakeSourceMap(): SourceMapType {
  const map = {} as SourceMapType;
  for (const key of ALL_KEYS) {
    (map as Record<string, unknown>)[key] = {
      filled: false,
      resultCached: false,
      lyricSourceResult: null,
      lyricSourceFiller: async () => {},
    };
  }
  return map;
}

function parametersFor(videoId: string, sourceMap: SourceMapType) {
  return {
    videoId,
    sourceMap,
    song: "Test",
    artist: "Test",
    duration: 200,
    audioTrackData: null,
    album: null,
    alwaysFetchMetadata: false,
    signal: new AbortController().signal,
  };
}

function lastPending(): PendingFetch {
  return pending[pending.length - 1];
}

const payload = {
  lyrics: [
    {
      startTimeMs: 0,
      durationMs: 2000,
      text: "hello world",
      parts: [
        { startTimeMs: 0, durationMs: 1000, words: "hello" },
        { startTimeMs: 1000, durationMs: 1000, words: "world" },
      ],
      wordSynced: true,
    },
  ],
  synced: true,
  wordSynced: true,
};

// --- a slow server does not hold the race ---
const slowMap = fakeSourceMap();
const slow = ytmu(parametersFor("slowSong", slowMap));
await new Promise(resolve => setTimeout(resolve, YTMU_DEADLINE_MS + 250));
assert.equal(pending.length, 1, "one request went out");
assert.ok(pending[0].url.startsWith(YTMU_SERVER_ORIGIN + "/api/lyrics"), `unexpected url ${pending[0].url}`);
assert.ok(pending[0].url.includes("v=slowSong"), "the video id is in the query");
assert.ok(pending[0].url.includes("lang=zh-TW"), "the target language is in the query");
assert.ok(!pending[0].url.includes("fast=1"), "never the fast path: it is a different, worse request");

await slow;
assert.equal(slowMap["ytmu-richsynced"].lyricSourceResult, null, "a timeout fills nothing: the race moves on");
assert.equal(aborted, 0, "the request is NOT aborted, so the server still fills its cache");

// The late answer is deliberately NOT reused: it arrives after the browser has
// already displayed something else, and the whole point of letting it run is the
// server-side cache write. The next ask for that song is a ~1ms cache hit, so it
// gets a fresh request and a real answer.
lastPending().resolve({ ok: true, data: payload });
await new Promise(resolve => setTimeout(resolve, 20));
const lateMap = fakeSourceMap();
const late = ytmu(parametersFor("slowSong", lateMap));
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(pending.length, 2, "a settled request is not memoized; the next ask goes back to the server");
lastPending().resolve({ ok: true, data: payload });
await late;
const filled = lateMap["ytmu-richsynced"].lyricSourceResult as { lyrics?: { isInstrumental?: boolean }[] } | null;
assert.ok(filled, "that request is a cache hit now, so it answers inside the deadline");
assert.equal(filled?.lyrics?.[0]?.isInstrumental, undefined, "a plain line is not an instrumental marker");

// --- a fast server answers inside the deadline ---
const fastMap = fakeSourceMap();
const fast = ytmu(parametersFor("fastSong", fastMap));
await new Promise(resolve => setTimeout(resolve, 10));
lastPending().resolve({ ok: true, data: payload });
await fast;
const rich = fastMap["ytmu-richsynced"].lyricSourceResult as { source?: string; lyrics?: unknown[] } | null;
assert.ok(rich, "word-by-word fills the richsynced key");
assert.equal(rich?.source, "YT Music Ultimate");
assert.equal(fastMap["ytmu-synced"].lyricSourceResult, null, "and only that key");

// --- the instrumental marker survives the copy ---
const markerMap = fakeSourceMap();
const marker = ytmu(parametersFor("markerSong", markerMap));
await new Promise(resolve => setTimeout(resolve, 10));
lastPending().resolve({
  ok: true,
  data: {
    lyrics: [
      { startTimeMs: 0, durationMs: 4000, text: "[instrumental]", isInstrumental: true },
      { startTimeMs: 4000, durationMs: 2000, text: "after the break", translated: "休息之後" },
    ],
    synced: true,
  },
});
await marker;
const marked = markerMap["ytmu-synced"].lyricSourceResult as {
  lyrics?: { isInstrumental?: boolean; translations?: Record<string, string> }[];
} | null;
assert.equal(marked?.lyrics?.[0]?.isInstrumental, true, "the flag is the whole contract with the renderer");
assert.equal(
  marked?.lyrics?.[1]?.translations?.["zh-TW"],
  "休息之後",
  "a server translation rides along per line, so injectLyrics skips the network batch"
);

// --- the three keys share one request ---
const sharedMap = fakeSourceMap();
const before = pending.length;
await Promise.all([
  ytmu(parametersFor("sharedSong", sharedMap)),
  ytmu(parametersFor("sharedSong", sharedMap)),
  ytmu(parametersFor("sharedSong", sharedMap)),
]);
assert.equal(pending.length - before, 1, "one request for three source keys");
assert.equal(sharedMap["ytmu-plain"].filled, true, "every ytmu key is marked filled");
assert.equal(sharedMap["yt-captions"].filled, false, "and nothing else is");

// --- a miss records -1, which is what makes a database gap fillable ---
const missMap = fakeSourceMap();
const miss = ytmu(parametersFor("missSong", missMap));
await new Promise(resolve => setTimeout(resolve, 10));
lastPending().resolve({ ok: true, data: { lyrics: [], source: "none" } });
await miss;
assert.equal(missMap["ytmu-richsynced"].lyricSourceResult, null, "a not-found fills nothing");
const { tierOf } = await import("./ytmuUpgrade");
// The scale the push gate compares against, on the same input the provider would
// have turned into a source result.
assert.equal(
  tierOf({
    lyrics: [
      { startTimeMs: 0, durationMs: 2000, words: "a" },
      { startTimeMs: 3000, durationMs: 2000, words: "b" },
    ],
  }),
  1,
  "timed lines with no parts are line-synced, which beats a server that has nothing"
);

console.log("ytmu provider selfcheck passed");
