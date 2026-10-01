import { prefersReducedMotion, quickDurationMs } from "@/ui/motion";
import { attachScrollFade } from "@/ui/scrollFade";

export type ModalCloseReason = "escape" | "backdrop" | "dismiss" | "api";

interface ModalOptions {
  onClose?: (reason: ModalCloseReason) => void;
  onHidden?: () => void;
  initialFocus?: () => HTMLElement | null | undefined;
}

export interface Modal {
  readonly overlay: HTMLElement;
  open(): void;
  close(reason?: ModalCloseReason): void;
  isOpen(): boolean;
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");
const TEXT_FIELD = "input:not([disabled]):not([type='hidden']):not([type='checkbox']):not([type='radio']), textarea";

let titleIds = 0;
const openModals: HTMLElement[] = [];

function isShown(el: HTMLElement): boolean {
  if (el.closest("[hidden]")) return false;
  return typeof el.checkVisibility === "function" ? el.checkVisibility() : true;
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isShown);
}

export function isAnyModalOpen(): boolean {
  return openModals.length > 0;
}

function syncScrollLock(): void {
  document.documentElement.classList.toggle("ui-modal-open", openModals.length > 0);
}

export function createModal(overlay: HTMLElement, { onClose, onHidden, initialFocus }: ModalOptions = {}): Modal {
  const surface = overlay.querySelector<HTMLElement>(".ui-modal__surface");
  if (!surface) throw new Error("ui-modal needs a .ui-modal__surface");

  const backdrop = document.createElement("div");
  backdrop.className = "ui-modal__backdrop";
  overlay.prepend(backdrop);

  surface.setAttribute("role", "dialog");
  surface.setAttribute("aria-modal", "true");
  surface.tabIndex = -1;
  const title = surface.querySelector<HTMLElement>(".ui-modal__title");
  if (title) {
    if (!title.id) title.id = `ui-modal-title-${++titleIds}`;
    surface.setAttribute("aria-labelledby", title.id);
  }

  const body = surface.querySelector<HTMLElement>(".ui-modal__body[data-scroll-fade]");
  if (body && !body.classList.contains("ui-scroll-fade")) attachScrollFade(body);

  let state: "closed" | "open" | "closing" = "closed";
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let opener: HTMLElement | null = null;
  let pressStartedOnBackdrop = false;

  const finishClose = (): void => {
    hideTimer = undefined;
    state = "closed";
    overlay.classList.remove("is-closing");
    overlay.hidden = true;
    onHidden?.();
  };

  const modal: Modal = {
    overlay,
    open() {
      if (state === "open") return;
      clearTimeout(hideTimer);
      hideTimer = undefined;
      const active = document.activeElement;
      if (state === "closed") opener = active instanceof HTMLElement && !overlay.contains(active) ? active : null;
      state = "open";
      if (overlay.parentElement !== document.body || document.body.lastElementChild !== overlay) {
        document.body.appendChild(overlay);
      }
      overlay.classList.remove("is-closing");
      overlay.hidden = false;
      void overlay.offsetWidth;
      overlay.classList.add("is-open");
      if (!openModals.includes(overlay)) openModals.push(overlay);
      syncScrollLock();
      const target = initialFocus?.() ?? body?.querySelector<HTMLElement>(TEXT_FIELD) ?? surface;
      (target && isShown(target) ? target : surface).focus({ preventScroll: true });
    },
    close(reason = "api") {
      if (state !== "open") return;
      state = "closing";
      overlay.classList.remove("is-open");
      overlay.classList.add("is-closing");
      openModals.splice(openModals.indexOf(overlay), 1);
      syncScrollLock();
      const returnTo = opener;
      opener = null;
      if (overlay.contains(document.activeElement) && returnTo?.isConnected) returnTo.focus({ preventScroll: true });
      hideTimer = setTimeout(finishClose, prefersReducedMotion() ? 0 : quickDurationMs());
      onClose?.(reason);
    },
    isOpen: () => state === "open",
  };

  overlay.addEventListener("pointerdown", event => {
    pressStartedOnBackdrop = event.target === backdrop || event.target === overlay;
  });
  overlay.addEventListener("click", event => {
    const onBackdrop = event.target === backdrop || event.target === overlay;
    if (onBackdrop && pressStartedOnBackdrop) modal.close("backdrop");
    pressStartedOnBackdrop = false;
    if (event.target instanceof Element && event.target.closest("[data-modal-close]")) modal.close("dismiss");
  });
  overlay.addEventListener("keydown", event => {
    if (state !== "open" || event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.preventDefault();
      modal.close("escape");
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables(surface);
    if (items.length === 0) {
      event.preventDefault();
      surface.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === surface)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  overlay.hidden = true;
  return modal;
}
