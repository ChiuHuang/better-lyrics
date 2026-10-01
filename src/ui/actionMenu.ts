import { positionMenu } from "@/ui/menuPlacement";
import { prefersReducedMotion, quickDurationMs } from "@/ui/motion";
import { attachScrollFade } from "@/ui/scrollFade";

export interface ActionMenuItem {
  label: string;
  content?: Node;
  disabled?: boolean;
  onSelect: () => void;
}

interface ActionMenuConfig {
  label: string;
  items: () => ActionMenuItem[] | Promise<ActionMenuItem[]>;
  emptyLabel?: string;
  className?: string;
}

export interface ActionMenu {
  open(focus?: "first" | "last"): Promise<void>;
  close(restoreFocus?: boolean): void;
  isOpen(): boolean;
}

let menuCount = 0;

export function createActionMenu(
  trigger: HTMLElement,
  { label, items, emptyLabel, className }: ActionMenuConfig
): ActionMenu {
  const menu = document.createElement("div");
  menu.className = className ? `ui-menu ${className}` : "ui-menu";
  const list = document.createElement("div");
  list.className = "ui-menu__options";
  list.setAttribute("role", "menu");
  list.setAttribute("aria-label", label);
  list.id = `ui-action-menu-${++menuCount}`;
  menu.appendChild(list);
  attachScrollFade(list);

  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", list.id);

  let state: "closed" | "open" | "closing" = "closed";
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let openFrame = 0;
  let openSeq = 0;

  const enabledItems = (): HTMLButtonElement[] =>
    Array.from(list.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)"));

  const focusItem = (target: HTMLButtonElement | undefined): void => {
    for (const item of enabledItems()) item.tabIndex = item === target ? 0 : -1;
    target?.focus({ preventScroll: false });
  };

  function render(entries: ActionMenuItem[]): void {
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "ui-menu__empty";
      empty.textContent = emptyLabel ?? "";
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(
      ...entries.map(entry => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ui-menu__option";
        item.setAttribute("role", "menuitem");
        item.tabIndex = -1;
        item.disabled = Boolean(entry.disabled);
        if (entry.content) {
          item.setAttribute("aria-label", entry.label);
          item.append(entry.content);
        } else {
          item.textContent = entry.label;
        }
        item.addEventListener("click", () => {
          close(true);
          entry.onSelect();
        });
        return item;
      })
    );
  }

  const onOutsidePointer = (event: PointerEvent): void => {
    const target = event.target as Node;
    if (!trigger.contains(target) && !menu.contains(target)) close(false);
  };
  const onViewportChange = (event: Event): void => {
    if (event.target instanceof Node && menu.contains(event.target)) return;
    if (state === "open") positionMenu(menu, trigger);
  };

  async function open(focus: "first" | "last" = "first"): Promise<void> {
    const seq = ++openSeq;
    const entries = await items();
    if (seq !== openSeq) return;
    clearTimeout(closeTimer);
    menu.classList.remove("is-closing");
    render(entries);
    document.body.appendChild(menu);
    menu.style.minWidth = `${trigger.getBoundingClientRect().width}px`;
    positionMenu(menu, trigger);
    state = "open";
    trigger.setAttribute("aria-expanded", "true");
    openFrame = requestAnimationFrame(() => menu.classList.add("is-open"));
    document.addEventListener("pointerdown", onOutsidePointer, true);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, { capture: true, passive: true });
    const enabled = enabledItems();
    focusItem(focus === "last" ? enabled.at(-1) : enabled[0]);
  }

  function close(restoreFocus = false): void {
    openSeq++;
    if (state !== "open") return;
    state = "closing";
    cancelAnimationFrame(openFrame);
    trigger.setAttribute("aria-expanded", "false");
    menu.classList.remove("is-open");
    menu.classList.add("is-closing");
    document.removeEventListener("pointerdown", onOutsidePointer, true);
    window.removeEventListener("resize", onViewportChange);
    window.removeEventListener("scroll", onViewportChange, { capture: true });
    closeTimer = setTimeout(
      () => {
        state = "closed";
        menu.classList.remove("is-closing");
        menu.remove();
      },
      prefersReducedMotion() ? 0 : quickDurationMs()
    );
    if (restoreFocus) trigger.focus();
  }

  trigger.addEventListener("click", () => {
    if (state === "open") close(true);
    else void open();
  });
  trigger.addEventListener("keydown", event => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    void open(event.key === "ArrowUp" ? "last" : "first");
  });
  menu.addEventListener("keydown", event => {
    const enabled = enabledItems();
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const last = enabled.length - 1;
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      case "Tab":
        close(false);
        trigger.focus();
        return;
      case "ArrowDown":
        event.preventDefault();
        focusItem(enabled[index < 0 || index === last ? 0 : index + 1]);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusItem(enabled[index <= 0 ? last : index - 1]);
        return;
      case "Home":
        event.preventDefault();
        focusItem(enabled[0]);
        return;
      case "End":
        event.preventDefault();
        focusItem(enabled[last]);
        return;
    }
  });

  return { open, close, isOpen: () => state === "open" };
}
