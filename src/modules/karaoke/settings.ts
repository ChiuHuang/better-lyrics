import { AppState } from "@core/appState";
import { getStorage } from "@core/storage";
import { KARAOKE_BACKDROPS, KARAOKE_CREDITS, KARAOKE_DEFAULTS, KARAOKE_LAYOUTS, KARAOKE_SIZES } from "./defaults";

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function loadKaraokeSettings(onLoaded: () => void): void {
  getStorage(KARAOKE_DEFAULTS, items => {
    AppState.isKaraokeEnabled = items.isKaraokeEnabled === true;
    AppState.karaokeLayout = oneOf(KARAOKE_LAYOUTS, items.karaokeLayout, KARAOKE_DEFAULTS.karaokeLayout);
    AppState.karaokeSize = oneOf(KARAOKE_SIZES, items.karaokeSize, KARAOKE_DEFAULTS.karaokeSize);
    AppState.karaokeBackdrop = oneOf(KARAOKE_BACKDROPS, items.karaokeBackdrop, KARAOKE_DEFAULTS.karaokeBackdrop);
    AppState.karaokeCredits = oneOf(KARAOKE_CREDITS, items.karaokeCredits, KARAOKE_DEFAULTS.karaokeCredits);
    AppState.isKaraokeBackgroundVocalsEnabled = items.isKaraokeBackgroundVocalsEnabled !== false;
    onLoaded();
  });
}
