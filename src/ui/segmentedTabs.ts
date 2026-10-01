import { observeResize } from "@modules/ui/layout/layoutWidth";
import { rovingIndex, travelDirection } from "@/ui/cardTabs";

interface SegmentedTabsOptions {
  onChange?: (tab: HTMLButtonElement, direction: "next" | "prev" | "") => void;
}

export interface SegmentedTabs {
  readonly tabs: HTMLButtonElement[];
  select(tab: HTMLButtonElement, options?: { animate?: boolean; notify?: boolean }): void;
  selected(): HTMLButtonElement | undefined;
  place(animate?: boolean): void;
}

export function initSegmentedTabs(list: HTMLElement, { onChange }: SegmentedTabsOptions = {}): SegmentedTabs {
  const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>(".ui-segmented__tab"));
  const pill = list.querySelector<HTMLElement>(".ui-segmented__pill");
  list.setAttribute("role", "tablist");

  const selected = (): HTMLButtonElement | undefined =>
    tabs.find(tab => tab.getAttribute("aria-selected") === "true") ?? tabs[0];

  function place(animate = true): void {
    const current = selected();
    if (!pill || !current) return;
    if (!animate) pill.style.transition = "none";
    pill.style.transform = `translateX(${current.offsetLeft}px)`;
    pill.style.width = `${current.offsetWidth}px`;
    if (!animate) {
      void pill.offsetWidth;
      pill.style.transition = "";
    }
  }

  function select(tab: HTMLButtonElement, { animate = true, notify = true } = {}): void {
    const direction = travelDirection(tabs.indexOf(selected() ?? tab), tabs.indexOf(tab));
    for (const candidate of tabs) {
      const isSelected = candidate === tab;
      candidate.setAttribute("aria-selected", String(isSelected));
      candidate.tabIndex = isSelected ? 0 : -1;
    }
    place(animate);
    if (notify) onChange?.(tab, direction);
  }

  for (const tab of tabs) {
    tab.setAttribute("role", "tab");
    if (!tab.hasAttribute("type")) tab.type = "button";
  }
  select(selected() ?? tabs[0], { animate: false, notify: false });

  list.addEventListener("click", event => {
    const tab = (event.target as Element).closest<HTMLButtonElement>(".ui-segmented__tab");
    if (tab && tabs.includes(tab) && tab !== selected()) select(tab);
  });
  list.addEventListener("keydown", event => {
    const focused = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (focused < 0) return;
    const index = rovingIndex(focused, event.key, tabs.length, getComputedStyle(list).direction === "rtl");
    if (index < 0) return;
    event.preventDefault();
    tabs[index].focus();
    select(tabs[index]);
  });
  observeResize([list, ...tabs], () => place(false));

  return { tabs, select, selected, place };
}
