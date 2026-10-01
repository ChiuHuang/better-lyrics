import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const { window } = new JSDOM("<!doctype html><html><body></body></html>");

// -- Fake clock --------------------------
let now = 0;
let nextId = 1;
const pending = new Map<number, { at: number; fn: () => void }>();
const advance = (ms: number): void => {
  const target = now + ms;
  for (;;) {
    const due = [...pending.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) break;
    pending.delete(due[0]);
    now = due[1].at;
    due[1].fn();
  }
  now = target;
};

Object.assign(globalThis, {
  window,
  document: window.document,
  DOMParser: window.DOMParser,
  setTimeout: (fn: () => void, ms = 0) => {
    const id = nextId++;
    pending.set(id, { at: now + ms, fn });
    return id;
  },
  clearTimeout: (id?: number) => {
    if (id !== undefined) pending.delete(id);
  },
});
Date.now = () => now;

const { toast } = await import("./toast");

const doc = window.document;
const toasts = (): HTMLElement[] => Array.from(doc.querySelectorAll<HTMLElement>(".ui-toast"));
const live = (): HTMLElement[] => toasts().filter(el => !el.classList.contains("is-leaving"));
const text = (el: HTMLElement): string => el.textContent ?? "";
const reset = (): void => {
  advance(60_000);
  doc.querySelector(".ui-toast-layer")?.replaceChildren();
};

// -- Happy paths --------------------------
{
  toast.success("Cache cleared");
  const [el] = toasts();
  assert.equal(text(el), "Cache cleared", "renders the message");
  assert.ok(el.classList.contains("ui-toast--success"), "success variant class");
  assert.equal(el.getAttribute("role"), "status", "success is a status");
  assert.equal(el.getAttribute("aria-live"), "polite", "success is polite");
  assert.ok(el.querySelector("svg.ui-toast__icon"), "success has an icon");
  advance(2499);
  assert.equal(live().length, 1, "still visible just before 2.5s");
  advance(1);
  assert.equal(live().length, 0, "auto-dismisses at 2.5s");
  advance(150);
  assert.equal(toasts().length, 0, "removed after the exit animation");
  reset();
}
{
  toast.error("No YouTube Music tab to refresh");
  const [el] = toasts();
  assert.equal(el.getAttribute("role"), "alert", "error is an alert");
  assert.equal(el.getAttribute("aria-live"), "assertive", "error is assertive");
  advance(2500);
  assert.equal(live().length, 1, "errors outlast 2.5s");
  advance(1500);
  assert.equal(live().length, 0, "errors dismiss at 4s");
  reset();
}
{
  toast.info("Nothing to clear");
  assert.ok(toasts()[0].classList.contains("ui-toast--info"), "info variant class");
  reset();
}

// -- Stacking --------------------------
{
  for (const label of ["one", "two", "three", "four"]) toast.success(label);
  assert.deepEqual(toasts().map(text), ["four", "three", "two"], "newest on top, capped at 3");
  reset();
}
{
  const first = toast.success("first");
  first.dismiss();
  toast.success("a");
  toast.success("b");
  toast.success("c");
  assert.equal(live().length, 3, "a leaving toast does not count toward the cap");
  reset();
}

// -- Hover and click --------------------------
{
  toast.success("hover me");
  const [el] = toasts();
  advance(1000);
  el.dispatchEvent(new window.Event("pointerenter"));
  advance(10_000);
  assert.equal(live().length, 1, "hover pauses the timer");
  el.dispatchEvent(new window.Event("pointerleave"));
  advance(1499);
  assert.equal(live().length, 1, "resumes with the remaining time");
  advance(1);
  assert.equal(live().length, 0, "dismisses when the remaining time runs out");
  reset();
}
{
  toast.success("click me");
  toasts()[0].dispatchEvent(new window.Event("click"));
  assert.equal(live().length, 0, "click dismisses");
  reset();
}

// -- Loading --------------------------
{
  const handle = toast.loading("Exporting key");
  const [el] = toasts();
  assert.ok(el.querySelector(".ui-spinner"), "loading shows a spinner");
  advance(30_000);
  assert.equal(live().length, 1, "loading never auto-dismisses");
  handle.update("success", "Identity key exported");
  assert.equal(text(el), "Identity key exported", "update swaps the message in place");
  assert.ok(el.classList.contains("ui-toast--success"), "update swaps the variant");
  assert.equal(el.querySelector(".ui-spinner"), null, "spinner removed after resolving");
  advance(2500);
  assert.equal(live().length, 0, "resolved toast dismisses on its new timer");
  reset();
}
{
  const handle = toast.loading("Exporting key");
  handle.update("error", "Failed to export identity");
  const [el] = toasts();
  assert.equal(el.getAttribute("role"), "alert", "resolving to error becomes an alert");
  advance(3999);
  assert.equal(live().length, 1, "resolved error uses the 4s timer");
  reset();
}

// -- Edge cases --------------------------
{
  const handle = toast.success("gone");
  handle.dismiss();
  handle.dismiss();
  handle.update("error", "late");
  assert.equal(text(toasts()[0]), "gone", "updates after dismiss are ignored");
  reset();
}
{
  toast.success("");
  assert.equal(toasts().length, 1, "empty message still renders");
  reset();
}

console.log("toast self-check passed");
