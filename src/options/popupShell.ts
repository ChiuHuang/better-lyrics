import { rovingIndex, travelDirection } from "@/ui/cardTabs";

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
    movePill(tabs, animate);
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
    const index = rovingIndex(focused, event.key, buttons.length);
    if (index < 0) return;
    event.preventDefault();
    buttons[index].focus();
    activate(buttons[index], true);
  });

  const restored = buttons.find(b => b.dataset.target === `#${location.hash.slice(1).split("/")[0]}`);
  activate(restored ?? buttons[0], false);
  void document.fonts.ready.then(() => movePill(tabs, false));
}
