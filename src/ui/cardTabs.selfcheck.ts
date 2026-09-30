import assert from "node:assert/strict";

const { barTransform, travelDirection } = await import("./cardTabs");

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

console.log("cardTabs self-check passed");
