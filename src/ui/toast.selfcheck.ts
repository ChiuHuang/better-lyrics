import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const { window } = new JSDOM("<!doctype html><html><body></body></html>");

let reducedMotion = false;

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
  Node: window.Node,
  getComputedStyle: window.getComputedStyle.bind(window),
  matchMedia: (query: string) => ({ matches: query.includes("reduce") && reducedMotion }),
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

const { toast } = await import("@/ui/toast");

const doc = window.document;
const toasts = (): HTMLElement[] => Array.from(doc.querySelectorAll<HTMLElement>(".ui-toast"));
const live = (): HTMLElement[] => toasts().filter(el => !el.classList.contains("is-leaving"));
const text = (el: HTMLElement): string => el.textContent ?? "";
const politeRegion = (): HTMLElement | null => doc.querySelector('[role="status"][aria-live="polite"]');
const assertiveRegion = (): HTMLElement | null => doc.querySelector('[role="alert"][aria-live="assertive"]');
const reset = (): void => {
  advance(60_000);
  doc.querySelector(".ui-toast-layer")?.replaceChildren();
};

// -- Live regions --------------------------
{
  assert.ok(politeRegion(), "polite region exists before the first toast");
  assert.ok(assertiveRegion(), "assertive region exists before the first toast");
  assert.equal(politeRegion()?.getAttribute("aria-atomic"), "true", "polite region is atomic");
  assert.equal(doc.querySelectorAll("[aria-live]").length, 2, "exactly two live regions");
}

// -- Happy paths --------------------------
{
  toast.success("Cache cleared");
  const [el] = toasts();
  assert.equal(text(el), "Cache cleared", "renders the message");
  assert.ok(el.classList.contains("ui-toast--success"), "success variant class");
  assert.equal(el.getAttribute("role"), null, "visual toast carries no role");
  assert.equal(el.getAttribute("aria-live"), null, "visual toast is not a live region");
  advance(50);
  assert.equal(politeRegion()?.textContent, "Cache cleared", "success is announced politely");
  assert.ok(el.querySelector("svg.ui-toast__icon"), "success has an icon");
  advance(2449);
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
  assert.equal(el.getAttribute("role"), null, "error toast carries no role");
  advance(50);
  assert.equal(assertiveRegion()?.textContent, "No YouTube Music tab to refresh", "error is announced assertively");
  advance(2450);
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
  assert.deepEqual(live().map(text), ["four", "three", "two"], "newest on top, capped at 3");
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

// -- Dedupe --------------------------
{
  const first = toast.success("Cache cleared");
  advance(2000);
  const second = toast.success("Cache cleared");
  assert.equal(live().length, 1, "the same message twice stays one toast");
  assert.equal(second, first, "a repeat returns the live handle");
  advance(2499);
  assert.equal(live().length, 1, "a repeat restarts the full duration");
  advance(1);
  assert.equal(live().length, 0, "the restarted timer still dismisses");
  reset();
}
{
  toast.success("Done");
  toast.error("Done");
  assert.equal(live().length, 2, "different kinds with the same text are separate toasts");
  reset();
}
{
  const exporting = toast.loading("Exporting key", { id: "export" });
  const resolved = toast.success("Identity key exported", { id: "export" });
  assert.equal(resolved, exporting, "an explicit id dedupes across messages");
  assert.deepEqual(live().map(text), ["Identity key exported"], "the id re-renders the live toast");
  reset();
}
{
  const handle = toast.success("Again");
  handle.dismiss();
  toast.success("Again");
  assert.equal(live().length, 1, "a dismissed key can be shown again");
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

// -- Keyboard --------------------------
{
  toast.success("focus me");
  const [el] = toasts();
  assert.equal(el.tabIndex, 0, "a toast is reachable with the keyboard");
  advance(1000);
  el.dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));
  advance(10_000);
  assert.equal(live().length, 1, "focus pauses the timer");
  el.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true, relatedTarget: el.firstElementChild }));
  advance(10_000);
  assert.equal(live().length, 1, "focus moving inside the toast keeps the pause");
  el.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
  advance(1499);
  assert.equal(live().length, 1, "blur resumes with the remaining time");
  advance(1);
  assert.equal(live().length, 0, "dismisses when the remaining time runs out after blur");
  reset();
}
{
  toast.success("hover and focus");
  const [el] = toasts();
  el.dispatchEvent(new window.Event("pointerenter"));
  el.dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));
  el.dispatchEvent(new window.Event("pointerleave"));
  advance(10_000);
  assert.equal(live().length, 1, "leaving with the pointer keeps the pause while focused");
  el.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
  advance(2500);
  assert.equal(live().length, 0, "the timer runs once neither hover nor focus holds it");
  reset();
}
for (const key of ["Escape", "Enter", " "]) {
  toast.error(`press ${key}`);
  const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  toasts()[0].dispatchEvent(event);
  assert.equal(live().length, 0, `${JSON.stringify(key)} dismisses the focused toast`);
  assert.ok(event.defaultPrevented, `${JSON.stringify(key)} does not also activate the page`);
  reset();
}
{
  toast.info("ignore tab");
  toasts()[0].dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  assert.equal(live().length, 1, "other keys leave the toast alone");
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
  advance(50);
  assert.equal(
    assertiveRegion()?.textContent,
    "Failed to export identity",
    "resolving to error is announced assertively"
  );
  advance(3949);
  assert.equal(live().length, 1, "resolved error uses the 4s timer");
  reset();
}

{
  toast.info("Nothing new");
  advance(50);
  toast.info("Nothing new");
  assert.equal(politeRegion()?.textContent, "", "a repeat clears the region first");
  advance(50);
  assert.equal(politeRegion()?.textContent, "Nothing new", "a repeat is announced again");
  reset();
}

// -- Regressions --------------------------
{
  const loading = toast.loading("Exporting key");
  for (const label of ["a", "b", "c"]) toast.success(label);
  assert.deepEqual(live().map(text), ["c", "b", "a"], "regression: the oldest toast is evicted at the cap");
  assert.ok(
    toasts().some(el => text(el) === "Exporting key" && el.classList.contains("is-leaving")),
    "regression: eviction plays the exit"
  );
  loading.update("success", "Identity key exported");
  assert.equal(
    toasts().filter(el => text(el) === "Identity key exported").length,
    0,
    "regression: an evicted loading toast does not come back on update"
  );
  advance(60_000);
  assert.equal(pending.size, 0, "regression: no timer is left pending after eviction");
  reset();
}

{
  for (let i = 0; i < 4; i++) toast.success("Cache cleared successfully!");
  assert.equal(live().length, 1, "regression: four quick clear-cache clicks give one toast");
  reset();
}
{
  const handle = toast.loading("Exporting key");
  toasts()[0].dispatchEvent(new window.Event("pointerenter"));
  handle.update("success", "Identity key exported");
  advance(10_000);
  assert.equal(live().length, 1, "regression: update while hovered does not start the timer");
  toasts()[0].dispatchEvent(new window.Event("pointerleave"));
  advance(2499);
  assert.equal(live().length, 1, "regression: leaving after an update runs the full new duration");
  advance(1);
  assert.equal(live().length, 0, "regression: the updated toast then dismisses");
  reset();
}
{
  const first = toast.success("Saved");
  toasts()[0].dispatchEvent(new window.Event("pointerenter"));
  toast.success("Saved");
  advance(10_000);
  assert.equal(live().length, 1, "regression: a repeat while hovered keeps the pause");
  toasts()[0].dispatchEvent(new window.Event("pointerleave"));
  advance(2500);
  assert.equal(live().length, 0, "regression: a repeat while hovered restarts the full duration on leave");
  first.dismiss();
  reset();
}

// -- Reduced motion --------------------------
{
  reducedMotion = true;
  toast.success("calm");
  toasts()[0].dispatchEvent(new window.Event("click"));
  advance(0);
  assert.equal(toasts().length, 0, "reduced motion removes the toast without waiting for the exit");
  reducedMotion = false;
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
