import { AppState } from "@core/appState";
import { getStorage } from "@core/storage";
import { KARAOKE_DEFAULTS } from "./defaults";

export function loadKaraokeSettings(onLoaded: () => void): void {
  getStorage(KARAOKE_DEFAULTS, items => {
    AppState.isKaraokeEnabled = items.isKaraokeEnabled === true;
    onLoaded();
  });
}
