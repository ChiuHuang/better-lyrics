import { type IconKey, svgIcon } from "@/options/unison/icons";

export type ToastKind = "success" | "error" | "info" | "loading";

export interface ToastHandle {
  update(kind: ToastKind, message: string): void;
  dismiss(): void;
}

const TOAST_MAX_VISIBLE = 3;
const TOAST_EXIT_MS = 150;
const DISMISS_AFTER_MS: Record<ToastKind, number | null> = {
  success: 2500,
  info: 2500,
  error: 4000,
  loading: null,
};
const KIND_ICONS: Record<Exclude<ToastKind, "loading">, IconKey> = {
  success: "ok",
  error: "bad",
  info: "info",
};

let layer: HTMLElement | undefined;

function ensureLayer(): HTMLElement {
  if (layer?.isConnected) return layer;
  layer = document.createElement("div");
  layer.className = "ui-toast-layer";
  document.body.appendChild(layer);
  return layer;
}

function toastIcon(kind: ToastKind): Element {
  if (kind === "loading") {
    const spinner = document.createElement("span");
    spinner.className = "ui-spinner ui-toast__spinner";
    spinner.setAttribute("aria-hidden", "true");
    return spinner;
  }
  const icon = svgIcon(KIND_ICONS[kind]);
  icon.classList.add("ui-toast__icon");
  return icon;
}

function render(el: HTMLElement, kind: ToastKind, message: string): void {
  el.className = `ui-toast ui-toast--${kind}`;
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
  const text = document.createElement("span");
  text.textContent = message;
  el.replaceChildren(toastIcon(kind), text);
}

function show(kind: ToastKind, message: string): ToastHandle {
  const host = ensureLayer();
  const el = document.createElement("div");
  el.setAttribute("aria-atomic", "true");
  render(el, kind, message);
  el.classList.add("is-entering");

  let remaining = DISMISS_AFTER_MS[kind];
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hovered = false;
  let closed = false;

  const run = (): void => {
    clearTimeout(timer);
    if (remaining === null || hovered || closed) return;
    startedAt = Date.now();
    timer = setTimeout(dismiss, remaining);
  };

  const pause = (): void => {
    hovered = true;
    if (timer === undefined || remaining === null) return;
    clearTimeout(timer);
    timer = undefined;
    remaining = Math.max(0, remaining - (Date.now() - startedAt));
  };

  const resume = (): void => {
    hovered = false;
    run();
  };

  function dismiss(): void {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    el.classList.remove("is-entering");
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), TOAST_EXIT_MS);
  }

  el.addEventListener("pointerenter", pause);
  el.addEventListener("pointerleave", resume);
  el.addEventListener("click", dismiss);

  host.prepend(el);
  const live = host.querySelectorAll(".ui-toast:not(.is-leaving)");
  for (const stale of Array.from(live).slice(TOAST_MAX_VISIBLE)) stale.remove();
  run();

  return {
    update(nextKind, nextMessage) {
      if (closed) return;
      render(el, nextKind, nextMessage);
      remaining = DISMISS_AFTER_MS[nextKind];
      run();
    },
    dismiss,
  };
}

export const toast = {
  success: (message: string): ToastHandle => show("success", message),
  error: (message: string): ToastHandle => show("error", message),
  info: (message: string): ToastHandle => show("info", message),
  loading: (message: string): ToastHandle => show("loading", message),
};
