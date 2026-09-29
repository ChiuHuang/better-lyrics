import { strict as assert } from "node:assert";
import { type KaraokeConditions, shouldShowKaraoke, wantsKaraokeLyrics } from "./gate";

const all: KaraokeConditions = { enabled: true, fullscreen: true, videoMode: true, synced: true, adPlaying: false };

assert.equal(shouldShowKaraoke(all), true);
for (const key of ["enabled", "fullscreen", "videoMode", "synced"] as const) {
  assert.equal(shouldShowKaraoke({ ...all, [key]: false }), false, `${key} off hides karaoke`);
}
assert.equal(shouldShowKaraoke({ ...all, adPlaying: true }), false, "an ad hides karaoke");

assert.equal(wantsKaraokeLyrics({ ...all, synced: false }), true, "lyrics load before the sync type is known");
assert.equal(wantsKaraokeLyrics({ ...all, adPlaying: true }), true, "an ad does not stop the fetch");
for (const key of ["enabled", "fullscreen", "videoMode"] as const) {
  assert.equal(wantsKaraokeLyrics({ ...all, [key]: false }), false, `${key} off wants no karaoke lyrics`);
}

console.log("karaoke gate self-check passed");
