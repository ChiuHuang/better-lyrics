import { warnCore } from "@core/logger";
import { observeResize } from "@modules/ui/layout/layoutWidth";
import { controlIcons, parseSvgString } from "@modules/ui/lyricsDock/icons";
import { svgIcon } from "@/options/unison/icons";
import { type CardTabs, initCardTabs, rovingIndex, travelDirection } from "@/ui/cardTabs";
import { attachScrollFade, inlineWheelStep } from "@/ui/scrollFade";

// -- Version --------------------------

export function renderAppVersion(target: HTMLElement | null): void {
  if (!target) return;
  const manifest = chrome.runtime.getManifest();
  target.textContent = manifest.version_name ?? manifest.version;
}

// -- Tab pill --------------------------

function movePill(tabs: HTMLElement, animate: boolean): void {
  const pill = tabs.querySelector<HTMLElement>(".tabs__pill");
  const active = tabs.querySelector<HTMLElement>(".tab.active");
  if (!pill || !active) return;
  if (!animate) pill.style.transition = "none";
  pill.style.transform = `translateX(${active.offsetLeft}px)`;
  pill.style.width = `${active.offsetWidth}px`;
  if (!animate) {
    void pill.offsetWidth;
    pill.style.transition = "";
  }
}

function revealActiveTab(tabs: HTMLElement, animate: boolean): void {
  if (!tabs.hasAttribute("data-scrollable")) return;
  const smooth = animate && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  tabs.querySelector<HTMLElement>(".tab.active")?.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: smooth ? "smooth" : "instant",
  });
}

function scrollTabsWithWheel(tabs: HTMLElement, event: WheelEvent): void {
  if (!tabs.hasAttribute("data-scrollable")) return;
  const step = inlineWheelStep(event, tabs, getComputedStyle(tabs).direction === "rtl");
  if (step === null) return;
  event.preventDefault();
  tabs.scrollLeft += step;
}

function watchTabOverflow(tabs: HTMLElement): void {
  let hasFade = false;
  const sync = (): void => {
    const clipped = tabs.scrollWidth > tabs.clientWidth;
    if (clipped !== tabs.hasAttribute("data-scrollable")) {
      tabs.toggleAttribute("data-scrollable", clipped);
      if (clipped && !hasFade) {
        attachScrollFade(tabs, tabs, { axis: "x" });
        hasFade = true;
      }
      revealActiveTab(tabs, false);
    }
    movePill(tabs, false);
  };
  tabs.addEventListener("wheel", event => scrollTabsWithWheel(tabs, event), { passive: false });
  observeResize([tabs, ...tabs.querySelectorAll(".tab")], sync);
  void document.fonts.ready.then(sync);
}

// -- Page switching --------------------------

export function initPopupTabs(onPageShown: (page: HTMLElement) => void): void {
  const tabs = document.querySelector<HTMLElement>(".tabs");
  if (!tabs) return;
  const buttons = Array.from(tabs.querySelectorAll<HTMLButtonElement>(".tab"));

  const activate = (button: HTMLButtonElement, animate: boolean): void => {
    const direction = travelDirection(
      buttons.findIndex(b => b.classList.contains("active")),
      buttons.indexOf(button)
    );
    for (const b of buttons) {
      b.classList.toggle("active", b === button);
      b.setAttribute("aria-selected", String(b === button));
      b.tabIndex = b === button ? 0 : -1;
    }
    if (document.body.classList.contains("is-about")) setAboutChrome(false);
    movePill(tabs, animate);
    revealActiveTab(tabs, animate);
    const target = button.dataset.target ?? "";
    for (const page of document.querySelectorAll<HTMLElement>("#options > .tab-content")) {
      page.dataset.uiDir = animate ? direction : "";
      const shown = `#${page.id}` === target;
      page.classList.toggle("active", shown);
      if (shown) onPageShown(page);
    }
    if (location.hash.split("/")[0] !== target) history.replaceState(null, "", target);
  };

  tabs.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLButtonElement>(".tab");
    if (button && !button.classList.contains("active")) activate(button, true);
  });
  tabs.addEventListener("keydown", event => {
    const focused = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (focused < 0) return;
    const index = rovingIndex(focused, event.key, buttons.length, getComputedStyle(tabs).direction === "rtl");
    if (index < 0) return;
    event.preventDefault();
    buttons[index].focus();
    activate(buttons[index], true);
  });

  const restored = buttons.find(b => b.dataset.target === `#${location.hash.slice(1).split("/")[0]}`);
  activate(restored ?? buttons[0], false);
  watchTabOverflow(tabs);
}

// -- Cards --------------------------

const pageCards = new Map<HTMLElement, CardTabs>();

function hashSubTab(pageId: string): string | null {
  const [page, sub] = location.hash.slice(1).split("/");
  return page === pageId && sub ? sub : null;
}

export function initPopupCards(): void {
  for (const page of document.querySelectorAll<HTMLElement>("#options > .tab-content")) {
    const card = page.querySelector<HTMLElement>(".ui-card");
    if (!card) continue;
    const cardTabs = initCardTabs(card, {
      animateHeight: page.id !== "sources-content",
      onChange: id => history.replaceState(null, "", `#${page.id}/${id}`),
    });
    const sub = hashSubTab(page.id);
    if (sub) cardTabs.select(sub, { instant: true });
    pageCards.set(page, cardTabs);
  }
}

export function pageCard(page: HTMLElement): CardTabs | undefined {
  return pageCards.get(page);
}

// -- Icons --------------------------

const SLOT_ICONS: Record<string, { svg: () => SVGElement | null; className?: string }> = {
  chevron: { svg: () => svgIcon("chevron"), className: "ui-row__chevron" },
  refresh: { svg: () => parseSvgString(controlIcons.refresh), className: "refresh-icon" },
  info: { svg: () => svgIcon("info") },
  externalLink: { svg: () => svgIcon("externalLink") },
};

export function mountIcons(root: ParentNode): void {
  for (const slot of root.querySelectorAll<HTMLElement>("[data-icon]")) {
    const entry = SLOT_ICONS[slot.dataset.icon ?? ""];
    const svg = entry?.svg();
    if (!svg) continue;
    if (entry.className) svg.classList.add(entry.className);
    svg.setAttribute("aria-hidden", "true");
    slot.replaceWith(svg);
  }
}

// -- Footer --------------------------

const SAVED_STATUS_MS = 1400;
let savedTimer: ReturnType<typeof setTimeout> | undefined;

export function flashSaved(): void {
  const status = document.getElementById("save-status");
  if (!status) return;
  status.classList.add("is-shown");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => status.classList.remove("is-shown"), SAVED_STATUS_MS);
}

async function refreshYouTubeMusicTabs(): Promise<boolean> {
  const tabs = await chrome.tabs.query({ url: "https://music.youtube.com/*" });
  const results = await Promise.allSettled(
    tabs.flatMap(tab => (tab.id == null ? [] : [chrome.tabs.sendMessage(tab.id, { action: "refreshLyrics" })]))
  );
  for (const result of results) {
    if (result.status === "rejected") warnCore("refreshLyrics send failed:", result.reason);
  }
  return results.some(result => result.status === "fulfilled" && result.value?.success === true);
}

export function initRefreshLyricsButton(onFailed: () => void): void {
  const button = document.getElementById("refresh-lyrics-btn");
  const icon = button?.querySelector<SVGElement>(".refresh-icon");
  if (!button || !icon) return;
  let latestRefresh = 0;
  button.addEventListener("click", async () => {
    const refresh = ++latestRefresh;
    const isLatest = (): boolean => refresh === latestRefresh;
    button.classList.add("is-refreshing");
    const refreshed = await refreshYouTubeMusicTabs().catch(error => {
      warnCore("refreshLyrics failed:", error);
      return false;
    });
    if (!isLatest()) return;
    stopRefreshSpinAfterTurn(button, icon, isLatest);
    if (!refreshed) onFailed();
  });
}

function stopRefreshSpinAfterTurn(button: HTMLElement, icon: SVGElement, isLatest: () => boolean): void {
  const stop = (): void => {
    if (isLatest()) button.classList.remove("is-refreshing");
  };
  if (icon.getAnimations().length === 0) stop();
  else icon.addEventListener("animationiteration", stop, { once: true });
}

// -- About --------------------------

function setAboutChrome(open: boolean): void {
  document.body.classList.toggle("is-about", open);
  document.getElementById("about-btn")?.setAttribute("aria-pressed", String(open));
  document.querySelector<HTMLElement>(".head-slot")?.toggleAttribute("inert", open);
  const about = document.getElementById("about-content");
  if (about && !open) {
    about.hidden = true;
    about.classList.remove("active");
  }
}

export function initAboutToggle(onPageShown: (page: HTMLElement) => void): void {
  const button = document.getElementById("about-btn");
  const about = document.getElementById("about-content");
  const body = document.getElementById("options");
  if (!button || !about || !body) return;
  button.addEventListener("click", () => {
    const open = !document.body.classList.contains("is-about");
    setAboutChrome(open);
    const target = open
      ? about.id
      : (document.querySelector<HTMLElement>(".tabs .tab.active")?.dataset.target ?? "#general-content").slice(1);
    for (const page of body.querySelectorAll<HTMLElement>(":scope > .page")) {
      const shown = page.id === target;
      page.dataset.uiDir = open ? "next" : "prev";
      page.classList.toggle("active", shown);
      if (page === about) page.hidden = !shown;
      if (shown) onPageShown(page);
    }
    body.scrollTop = 0;
  });
}
