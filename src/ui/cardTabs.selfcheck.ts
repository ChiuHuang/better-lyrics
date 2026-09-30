import assert from "node:assert/strict";

const { barTransform, rovingIndex, travelDirection } = await import("./cardTabs");

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

console.log("cardTabs self-check passed");
