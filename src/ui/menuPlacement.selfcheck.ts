import assert from "node:assert/strict";

const { menuPlacement } = await import("./menuPlacement");

const viewportHeight = 800;

// -- Happy paths --------------------------
{
  assert.deepEqual(
    menuPlacement({ triggerTop: 100, triggerBottom: 132, menuHeight: 200, viewportHeight }),
    { placement: "below", top: 136 },
    "room below: opens below with a 4px gap"
  );
  assert.deepEqual(
    menuPlacement({ triggerTop: 700, triggerBottom: 732, menuHeight: 200, viewportHeight }),
    { placement: "above", top: 496 },
    "no room below, room above: opens above with a 4px gap"
  );
}

// -- Edge cases --------------------------
{
  assert.deepEqual(
    menuPlacement({ triggerTop: 500, triggerBottom: 532, menuHeight: 1000, viewportHeight }),
    { placement: "above", top: 8 },
    "fits neither side: top clamps to the viewport margin"
  );
  assert.deepEqual(
    menuPlacement({ triggerTop: 200, triggerBottom: 232, menuHeight: 1000, viewportHeight }),
    { placement: "below", top: 236 },
    "fits neither side, more room below: stays below"
  );
  assert.deepEqual(
    menuPlacement({ triggerTop: -40, triggerBottom: -8, menuHeight: 100, viewportHeight }),
    { placement: "below", top: 8 },
    "trigger scrolled above the viewport: top never goes above the margin"
  );
  assert.deepEqual(
    menuPlacement({ triggerTop: 100, triggerBottom: 132, menuHeight: 0, viewportHeight }),
    { placement: "below", top: 136 },
    "empty menu opens below"
  );
}

// -- Invariants --------------------------
{
  for (const triggerTop of [0, 50, 390, 760, 900]) {
    const { top } = menuPlacement({ triggerTop, triggerBottom: triggerTop + 32, menuHeight: 300, viewportHeight });
    assert.ok(top >= 8, `top ${top} stays inside the margin for trigger at ${triggerTop}`);
  }
}

console.log("menuPlacement self-check passed");
