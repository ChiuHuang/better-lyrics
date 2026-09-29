import { AppState } from "@core/appState";
import { t } from "@core/i18n";
import { parseSvgString } from "@modules/ui/lyricsDock/icons";
import { getPlayerBarRightControls } from "@modules/ui/playerControls/playerBarControls";
import { isFullscreenVideo } from "./state";

const MIC_CLASS = "blyrics-karaoke-mic";
const MIC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 12.9a5 5 0 1 0 -3.902 -3.9"/><path d="M15 12.9l-3.902 -3.899l-7.513 8.584a2 2 0 1 0 2.827 2.83l8.588 -7.515z"/></svg>`;

let button: HTMLButtonElement | null = null;
let containerObserver: MutationObserver | null = null;
let observedContainer: HTMLElement | null = null;

function createButton(onToggle: () => void): HTMLButtonElement {
  const mic = document.createElement("button");
  mic.type = "button";
  mic.className = MIC_CLASS;
  const icon = parseSvgString(MIC_ICON);
  if (icon) mic.append(icon);
  mic.addEventListener("click", onToggle);
  return mic;
}

function detach(): void {
  containerObserver?.disconnect();
  containerObserver = null;
  observedContainer = null;
  button?.remove();
}

/**
 * Keeps the karaoke toggle in YouTube Music's player bar while a music video plays fullscreen, and
 * its state in step with the setting and the loaded lyrics. The bar's controls are YouTube Music's
 * to re-render, so the button is put back whenever the container loses it.
 */
export function syncMicButton(onToggle: () => void): void {
  const container = getPlayerBarRightControls(document);
  if (!container || !isFullscreenVideo()) {
    detach();
    return;
  }

  button ??= createButton(onToggle);
  const unavailable = AppState.lyricData?.syncType === "none";
  const label = unavailable ? t("karaoke_unavailable") : t("options_display_karaoke");
  button.disabled = unavailable;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(AppState.isKaraokeEnabled));

  if (button.parentElement !== container) container.append(button);
  if (observedContainer !== container) {
    containerObserver?.disconnect();
    observedContainer = container;
    containerObserver = new MutationObserver(() => {
      if (button && button.parentElement !== container && isFullscreenVideo()) container.append(button);
    });
    containerObserver.observe(container, { childList: true });
  }
}
