import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

/**
 * Self-check for the upgrade gate.
 *
 * The thing worth protecting here is the tier comparison and the shape of what
 * we send. Everything below runs against the REAL functions with the things
 * they touch replaced: a jsdom window (AppState imports the renderer chain,
 * which builds a lyrics view at module scope), chrome (so a push can be
 * observed instead of performed), and AppState itself for the toggle and key.
 */

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://music.youtube.com/" });
const testWindow = dom.window as unknown as Window & typeof globalThis;
// braccato's engine reads matchMedia at construction, and AppState pulls the
// renderer chain in at module scope -- so these have to exist before the import
// below, not lazily.
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

type SentMessage = { action: string; payload: { key: string; body: Record<string, unknown> } };
const sent: SentMessage[] = [];
const globalRecord = globalThis as unknown as Record<string, unknown>;
globalRecord.chrome = {
  runtime: {
    getManifest: () => ({ version: "0.0.0-selfcheck" }),
    sendMessage: (message: SentMessage) => {
      sent.push(message);
      return Promise.resolve({ ok: true, data: { tier: "wbw", skipped: false } });
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

const { AppState } = await import("@core/appState");
const { tierOf, noteServerTier, forgetServerTier, offerUpgradeToServer } = await import("./ytmuUpgrade");
type Lyric = import("./shared").Lyric;

const VIDEO = "dQw4w9WgXcQ";
const LANG = "zh-TW";

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
  tierOf({ lyrics: [{ startTimeMs: 0, durationMs: 4000, words: "", isInstrumental: true }, ...plain] }),
  1,
  "an instrumental marker is not karaoke on its own"
);
assert.equal(
  tierOf({
    lyrics: [
      {
        startTimeMs: 0,
        durationMs: 4000,
        words: "",
        isInstrumental: true,
        parts: [{ startTimeMs: 0, durationMs: 4000, words: "" }],
      },
    ],
  }),
  0,
  "an instrumental marker's single part must not read as word-by-word"
);
assert.equal(
  tierOf({ lyrics: [line(1000, "one", [{ startTimeMs: 1000, words: "one" }]), line(4000, "two")] }),
  1,
  "ONE part is a line with a duration, not karaoke"
);
assert.equal(
  tierOf({ lyrics: [line(0, "one", [{ startTimeMs: 0, words: "one" }])] }),
  0,
  "a single line with one part and no other timing is plain, not line-synced"
);

// --- the gate ---
// A key and the toggle are both on for the decision table; the cases that turn
// them off are checked at the end, where the counter is known.
AppState.ytmuPushKey = "k".repeat(32);
AppState.isYtmuUpgradeEnabled = true;

// Unknown (never asked) vs known-empty are different states, and only the
// second one is an upgrade opportunity.
forgetServerTier(VIDEO, LANG);
offerUpgradeToServer({ lyrics: wbw, source: "QQ", sourceHref: "" }, { videoId: VIDEO, lang: LANG });
assert.equal(sent.length, 0, "never asked the server: nothing is claimed");

forgetServerTier(VIDEO, LANG);
noteServerTier(VIDEO, LANG, -1);
offerUpgradeToServer({ lyrics: wbw, source: "QQ", sourceHref: "" }, { videoId: VIDEO, lang: LANG });
assert.equal(sent.length, 1, "server said it had nothing: anything is an upgrade");

forgetServerTier(VIDEO, LANG);
noteServerTier(VIDEO, LANG, 2);
offerUpgradeToServer({ lyrics: wbw, source: "QQ", sourceHref: "" }, { videoId: VIDEO, lang: LANG });
assert.equal(sent.length, 1, "equal tier: a tie is not worth a write");

noteServerTier(VIDEO, LANG, 1);
offerUpgradeToServer({ lyrics: wbw, source: "QQ", sourceHref: "" }, { videoId: VIDEO, lang: LANG });
assert.equal(sent.length, 2, "line -> wbw is an upgrade and is sent");

// The same song again must not re-send: this is the per-song repeat case.
offerUpgradeToServer({ lyrics: wbw, source: "QQ", sourceHref: "" }, { videoId: VIDEO, lang: LANG });
assert.equal(sent.length, 2, "the same tier is not pushed twice for one video");

forgetServerTier(VIDEO, LANG);
noteServerTier(VIDEO, LANG, 1);
offerUpgradeToServer({ lyrics: plain, source: "QQ", sourceHref: "" }, { videoId: VIDEO, lang: LANG });
assert.equal(sent.length, 2, "line -> line is a tie, not an upgrade");

forgetServerTier(VIDEO, LANG);
noteServerTier(VIDEO, LANG, 2);
offerUpgradeToServer({ lyrics: plain, source: "QQ", sourceHref: "" }, { videoId: VIDEO, lang: LANG });
assert.equal(sent.length, 2, "never walk an entry back down a tier");

forgetServerTier(VIDEO, LANG);
noteServerTier(VIDEO, LANG, 0);
offerUpgradeToServer({ lyrics: wbw, source: "YT Music Ultimate", sourceHref: "" }, { videoId: VIDEO, lang: LANG });
assert.equal(sent.length, 2, "our own provider's result IS the server's entry");

AppState.ytmuPushKey = "";
forgetServerTier(VIDEO, LANG);
noteServerTier(VIDEO, LANG, 0);
offerUpgradeToServer({ lyrics: wbw, source: "QQ", sourceHref: "" }, { videoId: VIDEO, lang: LANG });
assert.equal(sent.length, 2, "no key: read-only");

AppState.isYtmuUpgradeEnabled = false;
AppState.ytmuPushKey = "k".repeat(32);
forgetServerTier(VIDEO, LANG);
noteServerTier(VIDEO, LANG, 0);
offerUpgradeToServer({ lyrics: wbw, source: "QQ", sourceHref: "" }, { videoId: VIDEO, lang: LANG });
assert.equal(sent.length, 2, "toggle off: nothing is sent even with a key");

AppState.isYtmuUpgradeEnabled = true;
forgetServerTier(VIDEO, LANG);
noteServerTier(VIDEO, LANG, 0);
offerUpgradeToServer({ lyrics: wbw, source: "QQ", sourceHref: "" }, { videoId: VIDEO, lang: LANG });
assert.equal(sent.length, 3, "toggle on with a key: sent");

// --- the body we send ---
const last = sent[sent.length - 1];
assert.equal(last.action, "contributeYTMULyrics");
assert.equal(last.payload.key, "k".repeat(32));
const body = last.payload.body;
assert.equal(body.video_id, VIDEO);
assert.equal(body.lang, LANG);
assert.equal(body.source, "QQ");
assert.equal(body.node_id, "better-lyrics");
const data = body.data as { lyrics: Record<string, unknown>[]; wordSynced: boolean; synced: boolean };
assert.equal(data.wordSynced, true, "the server recomputes this, but it must agree");
assert.equal(data.synced, true);
const first = data.lyrics[0];
assert.equal(first.words, "hello there", "braccato's field name, which the server accepts as-is");
assert.equal(first.startTimeMs, 0);
assert.ok(Array.isArray(first.parts), "a two-part line carries its parts");
assert.equal((first.parts as { words: string }[]).length, 2);

// Instrumental markers are OUR lines: the server derives them from the gaps and
// would derive a second copy.
forgetServerTier(VIDEO, LANG);
noteServerTier(VIDEO, LANG, 0);
const withMarker: Lyric[] = [
  { startTimeMs: 0, durationMs: 4000, words: "[instrumental]", isInstrumental: true },
  ...wbw,
];
offerUpgradeToServer({ lyrics: withMarker, source: "QQ", sourceHref: "" }, { videoId: VIDEO, lang: LANG });
const markerBody = sent[sent.length - 1].payload.body.data as { lyrics: Record<string, unknown>[] };
assert.equal(markerBody.lyrics.length, 2, "the instrumental marker is not sent back");
assert.ok(
  !markerBody.lyrics.some(l => l.isInstrumental || l.words === "[instrumental]"),
  "no marker text and no flag: the server re-derives both"
);

console.log("ytmuUpgrade selfcheck passed");
