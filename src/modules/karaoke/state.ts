import { AppState } from "@core/appState";
import { isAdPlaying } from "@modules/ui/playerControls/playerBarControls";
import { type KaraokeConditions, shouldShowKaraoke, wantsKaraokeLyrics } from "./gate";

const KARAOKE_ATTRIBUTE = "blyrics-karaoke";

function appLayout(): Element | null {
  return document.querySelector("ytmusic-app-layout");
}

let lastKnownSynced = false;

// Between songs there are no lyrics loaded, and the last song's answer stands until the next song's
// arrives, so a fullscreen video does not flip layouts twice on every track change.
function readSynced(): boolean {
  const syncType = AppState.lyricData?.syncType;
  if (syncType !== undefined) lastKnownSynced = syncType !== "none";
  return lastKnownSynced;
}

function readConditions(): KaraokeConditions {
  const layout = appLayout();
  return {
    enabled: AppState.isKaraokeEnabled,
    fullscreen: layout?.hasAttribute("player-fullscreened") ?? false,
    videoMode: layout?.hasAttribute("blyrics-video-mode") ?? false,
    synced: readSynced(),
    adPlaying: isAdPlaying(document),
  };
}

export function isKaraokeActive(): boolean {
  return appLayout()?.hasAttribute(KARAOKE_ATTRIBUTE) ?? false;
}

export function isKaraokeWanted(): boolean {
  return wantsKaraokeLyrics(readConditions());
}

/** The one writer of the attribute every karaoke rule, in code and in CSS, reads. */
export function syncKaraokeAttribute(): boolean {
  const active = shouldShowKaraoke(readConditions());
  appLayout()?.toggleAttribute(KARAOKE_ATTRIBUTE, active);
  document.querySelector("#player-page")?.toggleAttribute(KARAOKE_ATTRIBUTE, active);
  return active;
}
