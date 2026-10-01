import { type IconKey, svgIcon } from "@/options/unison/icons";

export type ToastKind = "success" | "error" | "info" | "loading";

export interface ToastOptions {
  id?: string;
}

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

const ANNOUNCE_DELAY_MS = 50;

type Politeness = "polite" | "assertive";

let layer: HTMLElement | undefined;
const dismissers = new WeakMap<HTMLElement, () => void>();
const liveToasts = new Map<string, ToastHandle>();
const liveRegions: Partial<Record<Politeness, HTMLElement>> = {};
const announceTimers: Partial<Record<Politeness, ReturnType<typeof setTimeout>>> = {};

function whenDomReady(run: () => void): void {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
}

// -- Live regions --------------------------

function liveRegion(politeness: Politeness): HTMLElement {
  const existing = liveRegions[politeness];
  if (existing?.isConnected) return existing;
  const region = document.createElement("div");
  region.className = "ui-visually-hidden";
  region.setAttribute("role", politeness === "assertive" ? "alert" : "status");
  region.setAttribute("aria-live", politeness);
  region.setAttribute("aria-atomic", "true");
  document.body.appendChild(region);
  liveRegions[politeness] = region;
  return region;
}

whenDomReady(() => {
  liveRegion("polite");
  liveRegion("assertive");
});

function announce(kind: ToastKind, message: string): void {
  const politeness: Politeness = kind === "error" ? "assertive" : "polite";
  whenDomReady(() => {
    const region = liveRegion(politeness);
    region.textContent = "";
    clearTimeout(announceTimers[politeness]);
    announceTimers[politeness] = setTimeout(() => {
      region.textContent = message;
    }, ANNOUNCE_DELAY_MS);
  });
}

// -- Toasts --------------------------

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
  const text = document.createElement("span");
  text.textContent = message;
  el.replaceChildren(toastIcon(kind), text);
  announce(kind, message);
}

function show(kind: ToastKind, message: string, { id }: ToastOptions = {}): ToastHandle {
  const key = id ?? `${kind}:${message}`;
  const existing = liveToasts.get(key);
  if (existing) {
    existing.update(kind, message);
    return existing;
  }
  const host = ensureLayer();
  const el = document.createElement("div");
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
    if (liveToasts.get(key) === handle) liveToasts.delete(key);
    el.classList.remove("is-entering");
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), TOAST_EXIT_MS);
  }

  el.addEventListener("pointerenter", pause);
  el.addEventListener("pointerleave", resume);
  el.addEventListener("click", dismiss);

  const handle: ToastHandle = {
    update(nextKind, nextMessage) {
      if (closed) return;
      render(el, nextKind, nextMessage);
      remaining = DISMISS_AFTER_MS[nextKind];
      run();
    },
    dismiss,
  };
  liveToasts.set(key, handle);
  dismissers.set(el, dismiss);
  host.prepend(el);
  const live = host.querySelectorAll<HTMLElement>(".ui-toast:not(.is-leaving)");
  for (const stale of Array.from(live).slice(TOAST_MAX_VISIBLE)) dismissers.get(stale)?.();
  run();
  return handle;
}

export const toast = {
  success: (message: string, options?: ToastOptions): ToastHandle => show("success", message, options),
  error: (message: string, options?: ToastOptions): ToastHandle => show("error", message, options),
  info: (message: string, options?: ToastOptions): ToastHandle => show("info", message, options),
  loading: (message: string, options?: ToastOptions): ToastHandle => show("loading", message, options),
};
