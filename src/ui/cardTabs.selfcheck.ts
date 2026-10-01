import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const { window } = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
Object.assign(globalThis, {
  document: window.document,
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
});

const { barTransform, initCardTabs, rovingIndex, travelDirection } = await import("@/ui/cardTabs");

{
  assert.equal(barTransform({ offsetLeft: 20, offsetWidth: 60 }), "translateX(20px) scaleX(60)", "bar covers the tab");
  assert.equal(
    barTransform({ offsetLeft: 0, offsetWidth: 0 }),
    "translateX(0px) scaleX(0)",
    "hidden tab collapses the bar"
  );
}
{
  assert.equal(travelDirection(0, 2), "next", "moving right enters from the end");
  assert.equal(travelDirection(2, 0), "prev", "moving left enters from the start");
  assert.equal(travelDirection(1, 1), "", "same tab: no animation");
  assert.equal(travelDirection(-1, 0), "", "no previous tab: no animation");
}

// -- Roving focus --------------------------
{
  assert.equal(rovingIndex(0, "ArrowRight", 3), 1, "ArrowRight moves to the next tab");
  assert.equal(rovingIndex(2, "ArrowRight", 3), 0, "ArrowRight wraps from the last tab");
  assert.equal(rovingIndex(0, "ArrowLeft", 3), 2, "ArrowLeft wraps from the first tab");
  assert.equal(rovingIndex(2, "ArrowLeft", 3), 1, "ArrowLeft moves to the previous tab");
  assert.equal(rovingIndex(1, "Home", 3), 0, "Home goes to the first tab");
  assert.equal(rovingIndex(1, "End", 3), 2, "End goes to the last tab");
  assert.equal(rovingIndex(1, "Enter", 3), -1, "other keys are not handled");
  assert.equal(rovingIndex(0, "ArrowRight", 1), 0, "a single tab stays put");
  assert.equal(rovingIndex(-1, "ArrowRight", 3), 0, "no focused tab starts at the first");
  assert.equal(rovingIndex(0, "ArrowRight", 0), -1, "no tabs: nothing to move to");
}

// -- DOM wiring --------------------------
function buildCard(withAction: boolean): HTMLElement {
  const card = window.document.createElement("div");
  card.className = "ui-card";
  const head = window.document.createElement("div");
  head.className = "ui-card__head";
  for (const id of ["a", "b", "c"]) {
    const tab = window.document.createElement("button");
    tab.className = "ui-card__tab";
    tab.dataset.tab = id;
    tab.textContent = id;
    head.appendChild(tab);
  }
  const bar = window.document.createElement("span");
  bar.className = "ui-card__bar";
  head.appendChild(bar);
  if (withAction) {
    const action = window.document.createElement("button");
    action.className = "ui-card__action";
    head.appendChild(action);
  }
  const body = window.document.createElement("div");
  body.className = "ui-card__body";
  for (const id of ["a", "b", "c"]) {
    const panel = window.document.createElement("div");
    panel.className = "ui-panel";
    panel.dataset.panel = id;
    body.appendChild(panel);
  }
  card.append(head, body);
  window.document.body.appendChild(card);
  return card;
}

{
  const card = buildCard(false);
  const changes: string[] = [];
  const cardTabs = initCardTabs(card, { onChange: id => changes.push(id) });
  const tabs = Array.from(card.querySelectorAll<HTMLButtonElement>(".ui-card__tab"));
  const panels = Array.from(card.querySelectorAll<HTMLElement>(".ui-panel"));
  const selected = () => tabs.map(tab => tab.getAttribute("aria-selected"));

  assert.equal(
    card.querySelector(".ui-card__head")?.getAttribute("role"),
    "tablist",
    "a head holding only tabs is the tablist"
  );
  assert.equal(card.querySelector(".ui-card__bar")?.getAttribute("aria-hidden"), "true", "the bar is decorative");
  assert.deepEqual(
    tabs.map(tab => tab.getAttribute("role")),
    ["tab", "tab", "tab"],
    "every tab gets role=tab"
  );
  assert.deepEqual(
    panels.map(panel => panel.getAttribute("role")),
    ["tabpanel", "tabpanel", "tabpanel"],
    "panels are tabpanels"
  );
  tabs.forEach((tab, i) => {
    assert.equal(tab.getAttribute("aria-controls"), panels[i].id, `tab ${i} controls its panel`);
    assert.equal(panels[i].getAttribute("aria-labelledby"), tab.id, `panel ${i} is labelled by its tab`);
  });
  assert.deepEqual(selected(), ["true", "false", "false"], "first tab starts selected when none is");
  assert.deepEqual(
    tabs.map(tab => tab.tabIndex),
    [0, -1, -1],
    "only the selected tab is in the tab order"
  );
  assert.ok(panels[0].classList.contains("is-active"), "the selected panel starts active");

  tabs[0].focus();
  tabs[0].dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
  assert.equal(window.document.activeElement, tabs[1], "ArrowRight moves focus to the next tab");
  assert.deepEqual(selected(), ["false", "true", "false"], "ArrowRight selects the focused tab");
  assert.deepEqual(
    tabs.map(tab => tab.tabIndex),
    [-1, 0, -1],
    "the tab order follows the selection"
  );
  assert.equal(panels[1].dataset.uiDir, "next", "moving right enters from the end");

  tabs[1].dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
  assert.deepEqual(selected(), ["false", "false", "true"], "End selects the last tab");

  cardTabs.select("a", { instant: true });
  assert.deepEqual(selected(), ["true", "false", "false"], "select(id) selects by id");
  assert.equal(panels[0].dataset.uiDir, "", "instant select skips the enter animation");
  assert.deepEqual(changes, ["b", "c", "a"], "onChange reports every change");

  cardTabs.select("missing");
  assert.deepEqual(selected(), ["true", "false", "false"], "unknown ids are ignored");

  cardTabs.destroy();
  tabs[2].click();
  assert.deepEqual(selected(), ["true", "false", "false"], "destroy removes the listeners");
}

{
  const card = buildCard(true);
  initCardTabs(card);
  assert.equal(
    card.querySelector(".ui-card__head")?.hasAttribute("role"),
    false,
    "a head that also holds an action is not marked as a tablist"
  );
  assert.equal(card.querySelector(".ui-card__tab")?.getAttribute("role"), "tab", "tabs keep their role anyway");
}

console.log("cardTabs self-check passed");
