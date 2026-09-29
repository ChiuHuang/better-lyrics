import { KARAOKE_ACTIVE_ATTR } from "@constants";
import { AppState } from "@core/appState";
import { isAdPlaying } from "@modules/ui/playerControls/playerBarControls";
import { type KaraokeConditions, shouldShowKaraoke, wantsKaraokeLyrics } from "./gate";

function appLayout(): Element | null {
  return document.querySelector("ytmusic-app-layout");
}

let lastKnownSynced = false;

// Between songs there are no lyrics loaded, or only YouTube's provisional ones, and the last song's
// answer stands until the next song's arrives, so a fullscreen video does not flip layouts twice on
// every track change.
function readSynced(): boolean {
  const lyricData = AppState.lyricData;
  if (lyricData && !lyricData.isProvisional) lastKnownSynced = lyricData.syncType !== "none";
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
  return appLayout()?.hasAttribute(KARAOKE_ACTIVE_ATTR) ?? false;
}

export function isKaraokeWanted(): boolean {
  return wantsKaraokeLyrics(readConditions());
}

/** The one writer of the attribute every karaoke rule, in code and in CSS, reads. */
export function syncKaraokeAttribute(): boolean {
  const active = shouldShowKaraoke(readConditions());
  appLayout()?.toggleAttribute(KARAOKE_ACTIVE_ATTR, active);
  document.querySelector("#player-page")?.toggleAttribute(KARAOKE_ACTIVE_ATTR, active);
  return active;
}
