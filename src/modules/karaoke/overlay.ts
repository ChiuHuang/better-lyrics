import { AppState } from "@core/appState";
import { t } from "@core/i18n";
import type { StageBox } from "@braccato/core";
import { CREDITS_CLASS } from "@braccato/core/constants";
import { type ObserverHandle, observeResize } from "@modules/ui/layout/layoutWidth";
import { getPlayerBar } from "@modules/ui/playerControls/playerBarControls";
import { isTitleCardVisible } from "./titleCard";

const OVERLAY_ID = "blyrics-karaoke";
const SNAP_CLASS = "is-snap";
const PLATE_PAD_EM = { x: 0.55, y: 0.18 };
const CARD_PAD_EM = { x: 0.8, y: 0.36 };

interface OverlayParts {
  root: HTMLElement;
  stage: HTMLElement;
  plate: HTMLElement;
  mount: HTMLElement;
  title: HTMLElement;
  artist: HTMLElement;
  credit: HTMLElement;
}

interface TitleCardText {
  title: string;
  artist: string;
  songwriters: readonly string[];
}

let parts: OverlayParts | null = null;
let resizeHandle: ObserverHandle | null = null;
let isTitleCardShown = false;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function build(): OverlayParts {
  const root = element("div", "");
  root.id = OVERLAY_ID;
  root.hidden = true;

  const stage = element("div", "blyrics-karaoke__stage");
  const plate = element("div", "blyrics-karaoke__plate blyrics-karaoke-surface");
  const mount = element("div", "blyrics-karaoke__mount");
  stage.append(plate, mount);

  const titleCard = element("div", "blyrics-karaoke__title");
  const card = element("div", "blyrics-karaoke__card blyrics-karaoke-surface");
  const title = element("p", "blyrics-karaoke__card-title");
  const artist = element("p", "blyrics-karaoke__card-artist");
  const credit = element("p", "blyrics-karaoke__card-credit");
  card.append(title, artist, credit);
  titleCard.append(card);

  root.append(element("div", "blyrics-karaoke__scrim"), stage, titleCard);
  document.body.append(root);
  return { root, stage, plate, mount, title, artist, credit };
}

function writeSettings(root: HTMLElement): void {
  root.dataset.size = AppState.karaokeSize;
  root.dataset.backdrop = AppState.karaokeBackdrop;
  root.dataset.bgVocals = String(AppState.isKaraokeBackgroundVocalsEnabled);
}

function ensureParts(): OverlayParts {
  if (!parts) {
    parts = build();
    writeSettings(parts.root);
  }
  return parts;
}

function measurePlayerBar(): void {
  const barHeight = getPlayerBar(document)?.getBoundingClientRect().height;
  if (parts && barHeight) parts.root.style.setProperty("--blyrics-karaoke-bar-height", `${barHeight}px`);
}

/**
 * The fullscreen layer karaoke draws in: a scrim, the plate behind the lines being sung, the mount
 * braccato builds the lines into, and the title card. Built on first use, so nothing is added to the
 * page for a listener who never turns karaoke on.
 */
export const karaokeOverlay = {
  ensureMount(): HTMLElement {
    return ensureParts().mount;
  },

  applySettings(): void {
    if (parts) writeSettings(parts.root);
  },

  /**
   * YouTube Music keeps its player bar up in this fullscreen, so the stage always sits above it.
   * The bar's height and the stage's size are followed while shown, and `onResize` re-measures
   * the lines the size change reflowed.
   */
  setVisible(visible: boolean, onResize: () => void): void {
    if (!parts || parts.root.hidden === !visible) return;
    parts.root.hidden = !visible;
    resizeHandle?.destroy();
    resizeHandle = null;
    if (!visible) return;
    measurePlayerBar();
    const bar = getPlayerBar(document);
    resizeHandle = observeResize(bar ? [parts.stage, bar] : [parts.stage], () => {
      measurePlayerBar();
      onResize();
    });
  },

  setTitleCard({ title, artist, songwriters }: TitleCardText): void {
    const { title: titleText, artist: artistText, credit } = ensureParts();
    titleText.textContent = title;
    artistText.textContent = artist;
    credit.textContent = songwriters.length > 0 ? `${t("lyrics_writtenBy")} ${formatNames(songwriters)}` : "";
  },

  /**
   * Fits the plate to the box braccato reports, padded more when the end card is the focus. A plate
   * coming back from hidden snaps to its new place rather than sliding from where it last was.
   */
  setPlateBox(box: StageBox | null): void {
    if (!parts) return;
    const { plate, mount } = parts;
    const wasShown = plate.hasAttribute("data-plate");
    if (!box) {
      plate.removeAttribute("data-plate");
      return;
    }

    const container = mount.firstElementChild;
    const fontSize = container ? Number.parseFloat(getComputedStyle(container).fontSize) || 16 : 16;
    const isCard = mount.querySelector(`.${CREDITS_CLASS}[data-stage-role="current"]`) !== null;
    const pad = isCard ? CARD_PAD_EM : PLATE_PAD_EM;
    const padX = fontSize * pad.x;
    const padY = fontSize * pad.y;

    if (!wasShown) plate.classList.add(SNAP_CLASS);
    plate.style.width = `${(box.width + padX * 2).toFixed(1)}px`;
    plate.style.height = `${(box.height + padY * 2).toFixed(1)}px`;
    plate.style.translate = `${(box.x - padX).toFixed(1)}px ${(box.y - padY).toFixed(1)}px`;
    if (!wasShown) {
      void plate.offsetWidth;
      plate.classList.remove(SNAP_CLASS);
    }
    plate.setAttribute("data-plate", "");
  },

  update(timeS: number, firstSungLineStartS: number): void {
    if (!parts) return;
    const shown = isTitleCardVisible({ credits: AppState.karaokeCredits, firstSungLineStartS, timeS });
    if (shown === isTitleCardShown) return;
    isTitleCardShown = shown;
    parts.root.toggleAttribute("data-title-card", shown);
  },
};

function formatNames(names: readonly string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : (names[0] ?? "");
}
