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
// braccato's fade-out for a line leaving the stage.
const OUTGOING_FADE_MS = 220;
// Below this share of the narrower plate's width, the next line is somewhere else: a new plate fades
// in there rather than the old one sliding across the screen.
const MIN_SHARED_WIDTH = 0.5;

type PlateMotion = "grow" | "shrink" | "settle";

interface OverlayParts {
  root: HTMLElement;
  stage: HTMLElement;
  plates: [HTMLElement, HTMLElement];
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
let barObserver: MutationObserver | null = null;
let isTitleCardShown = false;
let lastPlate: StageBox | null = null;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let activePlate = 0;

function contains(outer: StageBox, inner: StageBox): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function unionOf(a: StageBox, b: StageBox): StageBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function sharedWidth(a: StageBox, b: StageBox): number {
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return Math.max(overlap, 0) / Math.min(a.width, b.width);
}

function showPlate(plate: HTMLElement, rect: StageBox): void {
  plate.classList.add(SNAP_CLASS);
  placePlate(plate, rect, "grow");
  void plate.offsetWidth;
  plate.classList.remove(SNAP_CLASS);
  plate.setAttribute("data-plate", "");
}

function placePlate(plate: HTMLElement, rect: StageBox, motion: PlateMotion): void {
  plate.dataset.plateMotion = motion;
  plate.style.width = `${rect.width.toFixed(1)}px`;
  plate.style.height = `${rect.height.toFixed(1)}px`;
  plate.style.translate = `${rect.x.toFixed(1)}px ${rect.y.toFixed(1)}px`;
}

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
  const plates: [HTMLElement, HTMLElement] = [
    element("div", "blyrics-karaoke__plate blyrics-karaoke-surface"),
    element("div", "blyrics-karaoke__plate blyrics-karaoke-surface"),
  ];
  const mount = element("div", "blyrics-karaoke__mount");
  stage.append(...plates, mount);

  const titleCard = element("div", "blyrics-karaoke__title");
  const card = element("div", "blyrics-karaoke__card blyrics-karaoke-surface");
  const title = element("p", "blyrics-karaoke__card-title");
  const artist = element("p", "blyrics-karaoke__card-artist");
  const credit = element("p", "blyrics-karaoke__card-credit");
  card.append(title, artist, credit);
  titleCard.append(card);

  root.append(stage, titleCard);
  document.body.append(root);
  return { root, stage, plates, mount, title, artist, credit };
}

function ensureParts(): OverlayParts {
  if (!parts) {
    parts = build();
  }
  return parts;
}

function syncBarShown(layout: HTMLElement): void {
  parts?.root.toggleAttribute("data-bar", layout.hasAttribute("show-fullscreen-controls"));
}

function measurePlayerBar(): void {
  const barHeight = getPlayerBar(document)?.getBoundingClientRect().height;
  if (parts && barHeight) parts.root.style.setProperty("--blyrics-karaoke-bar-height", `${barHeight}px`);
}

/**
 * The fullscreen layer karaoke draws in: the plate behind the lines being sung, the mount
 * braccato builds the lines into, and the title card. Built on first use, so nothing is added to the
 * page for a listener who never turns karaoke on.
 */
export const karaokeOverlay = {
  ensureMount(): HTMLElement {
    return ensureParts().mount;
  },

  /**
   * The stage lifts clear of the player bar while YouTube Music shows it. The bar's height and the
   * stage's size are followed while shown, and `onResize` re-measures the lines the size change
   * reflowed.
   */
  setVisible(visible: boolean, onResize: () => void): void {
    if (!parts || parts.root.hidden === !visible) return;
    parts.root.hidden = !visible;
    resizeHandle?.destroy();
    resizeHandle = null;
    barObserver?.disconnect();
    barObserver = null;
    if (!visible) return;
    measurePlayerBar();
    const layout = document.getElementById("layout");
    if (layout) {
      syncBarShown(layout);
      barObserver = new MutationObserver(() => syncBarShown(layout));
      barObserver.observe(layout, { attributes: true, attributeFilter: ["show-fullscreen-controls"] });
    }
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
    const { plates, mount } = parts;
    const plate = plates[activePlate];
    const wasShown = plate.hasAttribute("data-plate");
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = null;
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
    const target: StageBox = {
      x: box.x - padX,
      y: box.y - padY,
      width: box.width + padX * 2,
      height: box.height + padY * 2,
    };
    const previous = wasShown ? lastPlate : null;
    lastPlate = target;

    if (!previous) {
      showPlate(plate, target);
    } else if (sharedWidth(previous, target) < MIN_SHARED_WIDTH) {
      plate.removeAttribute("data-plate");
      activePlate = 1 - activePlate;
      showPlate(plates[activePlate], target);
    } else if (contains(target, previous)) {
      // Reach the incoming line before it shows, and leave the outgoing one only once it has
      // faded, so neither spills past the plate's edge.
      placePlate(plate, target, "grow");
    } else if (contains(previous, target)) {
      placePlate(plate, target, "shrink");
    } else {
      placePlate(plate, unionOf(previous, target), "grow");
      settleTimer = setTimeout(() => {
        settleTimer = null;
        placePlate(plate, target, "settle");
      }, OUTGOING_FADE_MS);
    }
  },

  update(timeS: number, firstSungLineStartS: number): void {
    if (!parts) return;
    const shown = isTitleCardVisible({ firstSungLineStartS, timeS });
    if (shown === isTitleCardShown) return;
    isTitleCardShown = shown;
    parts.root.toggleAttribute("data-title-card", shown);
  },
};

function formatNames(names: readonly string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : (names[0] ?? "");
}
