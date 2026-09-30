import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const { window } = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement });

const { initTooltips } = await import("./tooltip");

const doc = window.document;
const makeRoot = (text: string): { root: HTMLElement; anchor: HTMLElement } => {
  const root = doc.createElement("div");
  const anchor = doc.createElement("button");
  anchor.dataset.tooltip = text;
  root.appendChild(anchor);
  doc.body.appendChild(root);
  return { root, anchor };
};
const tip = (): HTMLElement | null => doc.querySelector(".ui-tooltip");
const isVisible = (): boolean => tip()?.classList.contains("ui-tooltip--visible") ?? false;
const enter = (el: Element): boolean => el.dispatchEvent(new window.Event("pointerenter"));
const leave = (el: Element): boolean => el.dispatchEvent(new window.Event("pointerleave"));

const first = makeRoot("First");
const second = makeRoot("Second");

// -- Happy paths --------------------------
{
  initTooltips(first.root);
  enter(first.anchor);
  assert.equal(isVisible(), true, "hovering a data-tooltip element shows the tooltip");
  assert.equal(tip()?.textContent, "First", "the tooltip shows the anchor's text");
  leave(first.anchor);
  assert.equal(isVisible(), false, "leaving the anchor hides it");
}

// -- Regressions: a second root works --------------------------
{
  initTooltips(second.root);
  enter(second.anchor);
  assert.equal(isVisible(), true, "regression: a second root gets tooltips too");
  assert.equal(tip()?.textContent, "Second", "the second root shows its own text");
  leave(second.anchor);
}

// -- Invariants --------------------------
{
  initTooltips(first.root);
  initTooltips(second.root);
  assert.equal(doc.querySelectorAll(".ui-tooltip").length, 1, "one tooltip element no matter how often init runs");
  let shows = 0;
  const observer = new window.MutationObserver(records => {
    shows += records.length;
  });
  observer.observe(tip()!, { childList: true });
  enter(first.anchor);
  await new Promise(resolve => setTimeout(resolve, 0));
  observer.disconnect();
  assert.equal(shows, 1, "re-running init on a root does not add a second listener");
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(isVisible(), false, "Escape hides the tooltip");
}

console.log("tooltip self-check passed");
