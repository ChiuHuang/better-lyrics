import { AppState, reloadLyrics } from "@core/appState";
import { pinForPick, saveProviderPin } from "@modules/lyrics/providerPin";
import type { LyricSourceKey } from "@modules/lyrics/providers/shared";

// Pins a provider for this song and re-injects through the existing abort + injection queue.
// A genuine song change cancels the in-flight switch and resets the override.
export function selectProvider(key: LyricSourceKey): void {
  AppState.manualProviderKey = key;
  const videoId = AppState.lastLoadedVideoId;
  if (videoId) {
    const pinned = pinForPick(key, AppState.availableProviderKeys);
    void saveProviderPin(videoId, pinned && { key: pinned, unisonLyricsId: AppState.availableUnisonLyricsId });
  }
  reloadLyrics();
}

export function cycleProvider(direction: 1 | -1): void {
  const list = AppState.availableProviderKeys;
  if (list.length < 2) return;

  const basis = AppState.manualProviderKey ?? AppState.currentProviderKey;
  const basisIndex = list.findIndex(key => key === basis);
  const start = basisIndex === -1 ? 0 : basisIndex;
  const next = (start + direction + list.length) % list.length;

  selectProvider(list[next]);
}
