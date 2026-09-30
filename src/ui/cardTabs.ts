export function barTransform(tab: Pick<HTMLElement, "offsetLeft" | "offsetWidth">): string {
  return `translateX(${tab.offsetLeft}px) scaleX(${tab.offsetWidth})`;
}

export function travelDirection(from: number, to: number): "next" | "prev" | "" {
  if (from < 0 || from === to) return "";
  return to > from ? "next" : "prev";
}

export interface CardTabsOptions {
  /** Tween the body height between panels. Off for cards whose body fills the page and scrolls. */
  animateHeight?: boolean;
  onChange?: (id: string) => void;
}

const RESIZE_FALLBACK_MS = 400;

/**
 * Wires `.ui-card__tab[data-tab]` buttons to `.ui-panel[data-panel]` siblings inside one `.ui-card`.
 * Returns `place(instant)`, which the host calls whenever the card is shown after being hidden.
 */
export function initCardTabs(
  card: HTMLElement,
  { animateHeight = true, onChange }: CardTabsOptions = {}
): (instant?: boolean) => void {
  const tabs = Array.from(card.querySelectorAll<HTMLButtonElement>(".ui-card__tab[data-tab]"));
  const panels = Array.from(card.querySelectorAll<HTMLElement>(".ui-panel[data-panel]"));
  const bar = card.querySelector<HTMLElement>(".ui-card__bar");
  const body = card.querySelector<HTMLElement>(".ui-card__body");
  let endResize: (() => void) | null = null;

  const active = (): HTMLButtonElement | undefined => tabs.find(tab => tab.getAttribute("aria-selected") === "true");

  function place(instant = false): void {
    const on = active();
    if (!bar || !on || !card.offsetParent) return;
    if (instant) bar.style.transition = "none";
    bar.style.transform = barTransform(on);
    if (instant) {
      void bar.offsetWidth;
      bar.style.transition = "";
    }
  }

  function select(tab: HTMLButtonElement): void {
    const from = tabs.findIndex(t => t.getAttribute("aria-selected") === "true");
    const to = tabs.indexOf(tab);
    const direction = travelDirection(from, to);
    if (!direction) return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startHeight = body?.getBoundingClientRect().height ?? 0;
    endResize?.();

    tabs.forEach(t => t.setAttribute("aria-selected", String(t === tab)));
    panels.forEach(panel => {
      panel.dataset.uiDir = reduced ? "" : direction;
      panel.classList.toggle("is-active", panel.dataset.panel === tab.dataset.tab);
    });
    place();
    onChange?.(tab.dataset.tab ?? "");

    if (!body || !animateHeight || reduced) return;
    body.style.height = "auto";
    const endHeight = body.getBoundingClientRect().height;
    if (Math.abs(endHeight - startHeight) < 1) {
      body.style.height = "";
      return;
    }
    body.style.height = `${startHeight}px`;
    body.classList.add("is-resizing");
    void body.offsetHeight;
    body.style.height = `${endHeight}px`;
    const finish = (): void => {
      window.clearTimeout(fallback);
      body.removeEventListener("transitionend", onEnd);
      body.classList.remove("is-resizing");
      body.style.height = "";
      endResize = null;
    };
    const onEnd = (event: TransitionEvent): void => {
      if (event.target === body && event.propertyName === "height") finish();
    };
    const fallback = window.setTimeout(finish, RESIZE_FALLBACK_MS);
    body.addEventListener("transitionend", onEnd);
    endResize = finish;
  }

  tabs.forEach(tab => tab.addEventListener("click", () => select(tab)));
  requestAnimationFrame(() => place(true));
  return place;
}
