import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

/**
 * Self-check for the upgrade gate and the manual push.
 *
 * What is worth protecting here:
 *   * the tier comparison (the scale must match the server's rerace._tier),
 *   * "never asked" vs "the server had nothing" -- only the second is an upgrade,
 *   * a forced push ignores the gate AND does not mark the tier as pushed,
 *   * the instrumental marker is never sent back.
 *
 * Everything runs against the REAL functions with the things they touch replaced:
 * a jsdom window (AppState imports the renderer chain, which builds a lyrics view
 * at module scope), chrome (so a push is observed rather than performed), and
 * AppState itself for the toggle, the key and the current lyrics.
 */

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://music.youtube.com/" });
const testWindow = dom.window as unknown as Window & typeof globalThis;
// braccato's engine reads matchMedia at construction, and AppState pulls the
// renderer chain in at module scope -- so these must exist before the imports.
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
// jsdom has no font loading; braccato only awaits the promise.
Object.defineProperty(testWindow.document, "fonts", {
  configurable: true,
  value: { ready: Promise.resolve(), check: () => true, addEventListener: () => {}, removeEventListener: () => {} },
});

type SentMessage = { action: string; payload: { key: string; body: Record<string, unknown> } };
const sent: SentMessage[] = [];
let nextResponse: { ok?: boolean; status?: number; error?: string; data?: Record<string, unknown> } = {
  ok: true,
  data: { tier: "wbw", skipped: false },
};
const globalRecord = globalThis as unknown as Record<string, unknown>;
globalRecord.chrome = {
  runtime: {
    getManifest: () => ({ version: "0.0.0-selfcheck" }),
    sendMessage: (message: SentMessage) => {
      sent.push(message);
      return Promise.resolve(nextResponse);
    },
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
const { tierOf, noteServerTier, offerUpgradeToServer, pushCurrentLyrics } = await import("./ytmuUpgrade");
type Lyric = import("./shared").Lyric;

const LANG = "zh-TW";
const KEY = "k".repeat(32);

const line = (startTimeMs: number, words: string, parts?: { startTimeMs: number; words: string }[]): Lyric => ({
  startTimeMs,
  durationMs: 2000,
  words,
  ...(parts ? { parts: parts.map(p => ({ ...p, durationMs: 1000 })) } : {}),
});

const plain: Lyric[] = [line(0, "hello there"), line(3000, "second line")];
const wbw: Lyric[] = [
  line(0, "hello there", [
    { startTimeMs: 0, words: "hello" },
    { startTimeMs: 1000, words: "there" },
  ]),
  line(3000, "second line"),
];

// --- tierOf: the scale must match the server's rerace._tier ---
assert.equal(tierOf({ lyrics: [] }), -1, "no lyrics is -1");
assert.equal(tierOf(null), -1, "a null result is -1");
assert.equal(tierOf({ lyrics: plain }), 1, "timed lines with no parts are line-synced");
assert.equal(tierOf({ lyrics: wbw }), 2, "a line with two parts is word-by-word");
assert.equal(
  tierOf({ lyrics: [{ startTimeMs: 0, durationMs: 0, words: "untimed" }] }),
  0,
  "no timings at all is plain"
);
assert.equal(
  tierOf({ lyrics: [line(1000, "one", [{ startTimeMs: 1000, words: "one" }]), line(4000, "two")] }),
  1,
  "ONE part is a line with a duration, not karaoke"
);
assert.equal(
  tierOf({ lyrics: [{ startTimeMs: 0, durationMs: 4000, words: "", isInstrumental: true }, ...plain] }),
  1,
  "an instrumental marker is not karaoke on its own"
);

// --- the automatic gate ---
// Each scenario gets its own video: the tier memory is per videoId+lang, and a
// server tier cannot walk backwards for one song anyway.
let videoCount = 0;
const freshVideo = (): string => `vid${(++videoCount).toString().padStart(2, "0")}`;
AppState.ytmuPushKey = KEY;
AppState.isYtmuUpgradeEnabled = true;

const offerAt = (videoId: string, result: { lyrics: Lyric[]; source: string; sourceHref: string }) =>
  offerUpgradeToServer(result, { videoId, lang: LANG });

const unknown = freshVideo();
offerAt(unknown, { lyrics: wbw, source: "QQ", sourceHref: "" });
assert.equal(sent.length, 0, "never asked the server: nothing is claimed");

const empty = freshVideo();
noteServerTier(empty, LANG, -1);
offerAt(empty, { lyrics: wbw, source: "QQ", sourceHref: "" });
assert.equal(sent.length, 1, "server said it had nothing: anything is an upgrade");

const tie = freshVideo();
noteServerTier(tie, LANG, 2);
offerAt(tie, { lyrics: wbw, source: "QQ", sourceHref: "" });
assert.equal(sent.length, 1, "equal tier: a tie is not worth a write");

const up = freshVideo();
noteServerTier(up, LANG, 1);
offerAt(up, { lyrics: wbw, source: "QQ", sourceHref: "" });
assert.equal(sent.length, 2, "line -> wbw is an upgrade and is sent");
offerAt(up, { lyrics: wbw, source: "QQ", sourceHref: "" });
assert.equal(sent.length, 2, "the same tier is not pushed twice for one video");

const down = freshVideo();
noteServerTier(down, LANG, 2);
offerAt(down, { lyrics: plain, source: "QQ", sourceHref: "" });
assert.equal(sent.length, 2, "never walk an entry back down a tier");

const ours = freshVideo();
noteServerTier(ours, LANG, 0);
offerAt(ours, { lyrics: wbw, source: "YT Music Ultimate", sourceHref: "" });
assert.equal(sent.length, 2, "our own provider's result IS the server's entry");

const keyless = freshVideo();
noteServerTier(keyless, LANG, 0);
AppState.ytmuPushKey = "";
offerAt(keyless, { lyrics: wbw, source: "QQ", sourceHref: "" });
assert.equal(sent.length, 2, "no key: read-only");

const toggledOff = freshVideo();
noteServerTier(toggledOff, LANG, 0);
AppState.isYtmuUpgradeEnabled = false;
AppState.ytmuPushKey = KEY;
offerAt(toggledOff, { lyrics: wbw, source: "QQ", sourceHref: "" });
assert.equal(sent.length, 2, "toggle off: nothing is sent even with a key");
AppState.isYtmuUpgradeEnabled = true;

// --- the body we send ---
const last = sent[sent.length - 1];
assert.equal(last.action, "contributeYTMULyrics");
assert.equal(last.payload.key, KEY);
const body = last.payload.body;
assert.equal(body.video_id, up, "the body carries the video we asked about");
assert.equal(body.lang, LANG);
assert.equal(body.source, "QQ");
assert.equal(body.node_id, "better-lyrics");
assert.equal(body.force, false, "the automatic path never forces");
const data = body.data as { lyrics: Record<string, unknown>[]; wordSynced: boolean; synced: boolean };
assert.equal(data.wordSynced, true, "the server recomputes this, but it must agree");
assert.equal(data.synced, true);
const first = data.lyrics[0];
assert.equal(first.words, "hello there", "braccato's field name, which the server accepts as-is");
assert.equal(first.startTimeMs, 0);
assert.equal((first.parts as { words: string }[]).length, 2);

// Instrumental markers are OUR lines: the server derives them from the gaps and
// would derive a second copy.
const marker = freshVideo();
noteServerTier(marker, LANG, 0);
offerAt(marker, {
  lyrics: [{ startTimeMs: 0, durationMs: 4000, words: "[instrumental]", isInstrumental: true }, ...wbw],
  source: "QQ",
  sourceHref: "",
});
const markerBody = sent[sent.length - 1].payload.body.data as { lyrics: Record<string, unknown>[] };
assert.equal(markerBody.lyrics.length, 2, "the instrumental marker is not sent back");
assert.ok(
  !markerBody.lyrics.some(l => l.isInstrumental || l.words === "[instrumental]"),
  "no marker text and no flag: the server re-derives both"
);

// --- the manual push ---
// "I am looking at it" beats every gate: it does not compare tiers, it does not
// need the toggle, and it does not mark the tier as pushed (press twice, send
// twice).
const VIDEO = freshVideo();
const beforeManual = sent.length;
noteServerTier(VIDEO, LANG, 2);
AppState.isYtmuUpgradeEnabled = false;
AppState.lastLoadedVideoId = VIDEO;
AppState.translationLanguage = LANG;
AppState.currentProviderKey = "unison-richsynced";
AppState.lastVideoDetails = { song: "Never Gonna Give You Up", artist: "Rick Astley", duration: "212" };
AppState.parsedLyrics = { lyrics: plain, segmentMap: null };

const forced = await pushCurrentLyrics();
assert.equal(sent.length, beforeManual + 1, "the manual push sends with the toggle OFF");
assert.equal(forced.ok, true);
assert.equal(sent[beforeManual].payload.body.force, true, "the manual push forces");
assert.equal(sent[beforeManual].payload.body.song, "Never Gonna Give You Up");
assert.equal(sent[beforeManual].payload.body.artist, "Rick Astley");

await pushCurrentLyrics();
assert.equal(sent.length, beforeManual + 2, "a forced push marks nothing, so pressing twice sends twice");

// A forced push must also not consume the automatic mark for that tier.
AppState.isYtmuUpgradeEnabled = true;
noteServerTier(VIDEO, LANG, 1);
offerUpgradeToServer({ lyrics: wbw, source: "QQ", sourceHref: "" }, { videoId: VIDEO, lang: LANG });
assert.equal(sent.length, beforeManual + 3, "the forced push did not mark the wbw tier as pushed");

// Failures are answers, not crashes.
const unauthenticated = freshVideo();
nextResponse = { ok: false, status: 401 };
noteServerTier(unauthenticated, LANG, 1);
offerUpgradeToServer({ lyrics: wbw, source: "QQ", sourceHref: "" }, { videoId: unauthenticated, lang: LANG });
await Promise.resolve();
assert.equal(sent.length, beforeManual + 4, "a 401 still attempts");
noteServerTier(unauthenticated, LANG, 1);
offerUpgradeToServer({ lyrics: wbw, source: "QQ", sourceHref: "" }, { videoId: unauthenticated, lang: LANG });
assert.equal(sent.length, beforeManual + 5, "a 401 clears the mark so a later song can try again");

nextResponse = { ok: true, data: { tier: "wbw", skipped: false } };

// Nothing loaded, nothing playing, no key: all refused before any request.
const before = sent.length;
AppState.parsedLyrics = null;
assert.equal((await pushCurrentLyrics()).ok, false, "no lyrics loaded");
AppState.parsedLyrics = { lyrics: plain, segmentMap: null };
AppState.lastLoadedVideoId = null;
AppState.lastVideoId = null;
assert.equal((await pushCurrentLyrics()).ok, false, "no song playing");
AppState.lastLoadedVideoId = VIDEO;
AppState.ytmuPushKey = "";
assert.equal((await pushCurrentLyrics()).ok, false, "no key");
assert.equal(sent.length, before, "none of those sent anything");

console.log("ytmuUpgrade selfcheck passed");
