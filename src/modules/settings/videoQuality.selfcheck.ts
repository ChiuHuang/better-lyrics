import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import {
  DEFAULT_VIDEO_QUALITY_SETTINGS,
  normalizeVideoQualitySettings,
  selectVideoQuality,
  VIDEO_QUALITY_SETTINGS_EVENT,
} from "./videoQuality";
import { patchVideoQualityPlayer, startVideoQualityPlayer, type VideoQualityPlayer } from "./videoQualityPlayer";
import { syncVideoQualityControls } from "../../options/videoQualityControls";
import { startVideoQualitySettingsBridge } from "./videoQualityBridge";
import { VIDEO_QUALITY_REQUEST_EVENT } from "./videoQuality";

const defaults = { ...DEFAULT_VIDEO_QUALITY_SETTINGS };
assert.deepEqual(normalizeVideoQualitySettings({}), defaults);
assert.equal(normalizeVideoQualitySettings({ preferredVideoQuality: "toString" }).preferredVideoQuality, "auto");
assert.equal(
  normalizeVideoQualitySettings({ isHighResolutionVideoEnabled: false }).isHighResolutionVideoEnabled,
  false
);
assert.equal(selectVideoQuality(defaults, ["hd2160", "hd1080"]), "auto");
assert.equal(
  selectVideoQuality({ ...defaults, preferredVideoQuality: "hd2160" }, ["hd1440", "hd1080", "auto"]),
  "hd1440"
);
assert.equal(
  selectVideoQuality({ isHighResolutionVideoEnabled: false, preferredVideoQuality: "hd4320" }, ["hd2160", "hd1080"]),
  "hd1080"
);
assert.equal(selectVideoQuality({ ...defaults, preferredVideoQuality: "tiny" }, ["hd720", "large"]), "large");
assert.equal(
  selectVideoQuality({ isHighResolutionVideoEnabled: false, preferredVideoQuality: "hd2160" }, ["hd2160"]),
  "auto",
  "never explicitly select a disabled quality"
);

let enabled = true;
let received: unknown[] = [];
let receiver: unknown;
const result = Promise.resolve("native return");
const original = function (this: unknown, ...args: unknown[]) {
  receiver = this;
  received = args;
  return result;
};
const api = { loadVideoByPlayerVars: original, preloadVideoByPlayerVars: original, queueNextVideo: original };
const cleanup = patchVideoQualityPlayer(api, () => ({ ...defaults, isHighResolutionVideoEnabled: enabled }));
const vars = { video_id: "video", prefer_gapless: true, aac_high: true, player_params: "opaque", pause_at_start: true };
assert.equal(api.loadVideoByPlayerVars(vars, 1, "remaining args"), result);
assert.equal(receiver, api);
assert.deepEqual(received, [{ ...vars, prefer_gapless: false }, 1, "remaining args"]);
assert.equal(vars.prefer_gapless, true, "must not mutate cached Music arguments");
for (const audio_only of [true, 1, "1", "True"]) {
  const audio = { ...vars, audio_only };
  api.preloadVideoByPlayerVars(audio);
  assert.equal(received[0], audio, "album audio retains gapless and the original object");
}
enabled = false;
api.queueNextVideo(vars);
assert.equal(received[0], vars, "disabling restores native arguments without reloading the bridge");
const otherWrapper = () => {};
api.preloadVideoByPlayerVars = otherWrapper as typeof original;
cleanup();
assert.equal(api.loadVideoByPlayerVars, original);
assert.equal(api.preloadVideoByPlayerVars, otherWrapper, "cleanup must not overwrite another owner");
const frozenApi = Object.freeze({ loadVideoByPlayerVars: original });
assert.doesNotThrow(() => patchVideoQualityPlayer(frozenApi, () => defaults)());

const dom = new JSDOM(`<ytmusic-player></ytmusic-player>
  <input id="isHighResolutionVideoEnabled" type="checkbox" checked>
  <select id="preferredVideoQuality"><option value="auto">Auto</option><option value="hd2160">4K</option><option value="hd1080">1080p</option></select>
  <span id="videoQualityLimitHint" hidden></span>`);
const doc = dom.window.document;
const toggle = doc.getElementById("isHighResolutionVideoEnabled") as HTMLInputElement;
const select = doc.getElementById("preferredVideoQuality") as HTMLSelectElement;
select.value = "hd2160";
toggle.checked = false;
syncVideoQualityControls(doc);
assert.equal(select.value, "hd1080");
assert.equal(select.options[1].disabled, true);
assert.equal(select.options[2].disabled, false);
assert.equal(doc.getElementById("videoQualityLimitHint")?.hidden, false);
toggle.checked = true;
syncVideoQualityControls(doc);
assert.equal(select.options[1].disabled, false);

Object.assign(globalThis, { MutationObserver: dom.window.MutationObserver, Event: dom.window.Event });
let qualityCalls: string[] = [];
let qualities = ["hd2160", "hd1080", "auto"];
let nextApi: VideoQualityPlayer = {
  loadVideoByPlayerVars: original,
  getVideoData: () => ({ video_id: "video" }),
  getAvailableQualityLevels: () => qualities,
  setPlaybackQualityRange: quality => {
    qualityCalls.push(quality);
  },
};
const host = doc.querySelector("ytmusic-player")!;
Object.assign(host, { getPlayer: () => Promise.resolve(nextApi) });
const stop = startVideoQualityPlayer(doc, dom.window as unknown as Window);
const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
};
const settings = (preferredVideoQuality: string) =>
  doc.dispatchEvent(
    new dom.window.CustomEvent(VIDEO_QUALITY_SETTINGS_EVENT, { detail: JSON.stringify({ preferredVideoQuality }) })
  );
settings("hd2160");
await settle();
assert.deepEqual(qualityCalls, ["hd2160"]);
doc.dispatchEvent(new dom.window.Event("loadedmetadata"));
assert.equal(qualityCalls.length, 1, "do not force the same preference on every tick");
qualities = ["hd1080", "auto"];
doc.dispatchEvent(new dom.window.Event("loadedmetadata"));
assert.equal(qualityCalls.at(-1), "hd1080");
qualities = ["auto"];
doc.dispatchEvent(new dom.window.Event("loadedmetadata"));
assert.equal(qualityCalls.length, 2, "audio-only playback must not be pinned");
qualities = ["hd2160", "hd1080"];
doc.querySelector("ytmusic-player")?.classList.add("ad-showing");
settings("hd1080");
await settle();
assert.equal(qualityCalls.length, 2, "ads keep native quality selection");
doc.querySelector("ytmusic-player")?.classList.remove("ad-showing");
const oldApi = nextApi;
nextApi = { ...nextApi, loadVideoByPlayerVars: original };
doc.dispatchEvent(new dom.window.Event("yt-navigate-finish"));
await settle();
assert.equal(oldApi.loadVideoByPlayerVars, original, "replacement restores old API");
assert.notEqual(nextApi.loadVideoByPlayerVars, original);
settings("auto");
await settle();
assert.equal(qualityCalls.at(-1), "auto");
qualities = ["hd1080", "auto"];
let refreshes = 0;
nextApi.getPlayerResponse = () => ({ streamingData: { adaptiveFormats: [{ height: 2160 }] } });
nextApi.updateVideoData = (vars, refresh) => {
  assert.deepEqual(vars, { prefer_gapless: false }, "initial refresh preserves all other current video data");
  assert.equal(refresh, true, "request format refiltering, not a metadata-only update");
  refreshes++;
  qualities = ["hd2160", "hd1080", "auto"];
};
settings("hd2160");
await settle();
doc.dispatchEvent(new dom.window.Event("loadedmetadata"));
assert.equal(refreshes, 1);
assert.equal(qualityCalls.at(-1), "hd2160", "first playback unlocks high resolution without a second load");
qualities = ["hd1080", "auto"];
doc.dispatchEvent(new dom.window.Event("loadedmetadata"));
assert.equal(refreshes, 1, "a failed/filtered initial refresh must not retry forever");
stop();
assert.equal(nextApi.loadVideoByPlayerVars, original);
qualityCalls = [];
settings("hd2160");
await settle();
assert.deepEqual(qualityCalls, [], "disposed bridges ignore settings and async callbacks");

// Storage/page startup can happen in either order. Ignore stale async reads and
// stop publishing after disposal; unrelated storage changes must not pin quality.
const reads: ((value: unknown) => void)[] = [];
const storageListeners = new Set<(changes: Record<string, unknown>, area: string) => void>();
Object.assign(globalThis, {
  document: doc,
  CustomEvent: dom.window.CustomEvent,
  chrome: {
    storage: {
      sync: { get: () => new Promise(resolve => reads.push(resolve)) },
      onChanged: {
        addListener: (fn: (changes: Record<string, unknown>, area: string) => void) => storageListeners.add(fn),
        removeListener: (fn: (changes: Record<string, unknown>, area: string) => void) => storageListeners.delete(fn),
      },
    },
  },
});
const published: unknown[] = [];
doc.addEventListener(VIDEO_QUALITY_SETTINGS_EVENT, event => {
  published.push(JSON.parse((event as CustomEvent<string>).detail));
});
const stopStorage = startVideoQualitySettingsBridge();
doc.dispatchEvent(new dom.window.Event(VIDEO_QUALITY_REQUEST_EVENT));
reads[1]({ preferredVideoQuality: "hd2160" });
await settle();
reads[0]({ preferredVideoQuality: "hd720" });
await settle();
assert.deepEqual(published, [{ ...defaults, preferredVideoQuality: "hd2160" }]);
for (const fn of storageListeners) fn({ otherSetting: {} }, "sync");
assert.equal(reads.length, 2);
for (const fn of storageListeners) fn({ preferredVideoQuality: {} }, "sync");
assert.equal(reads.length, 3);
stopStorage();
reads[2]({});
await settle();
assert.equal(published.length, 1);
assert.equal(storageListeners.size, 0);
dom.window.close();
console.log("videoQuality selfcheck passed");
