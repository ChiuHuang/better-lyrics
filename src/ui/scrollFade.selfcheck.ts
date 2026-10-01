import assert from "node:assert/strict";

const { fadeEdges } = await import("@/ui/scrollFade");

{
  assert.deepEqual(
    fadeEdges({ scrollTop: 0, clientHeight: 100, scrollHeight: 100 }),
    { top: false, bottom: false },
    "fits: no fade"
  );
  assert.deepEqual(
    fadeEdges({ scrollTop: 0, clientHeight: 100, scrollHeight: 300 }),
    { top: false, bottom: true },
    "at top: bottom fade only"
  );
  assert.deepEqual(
    fadeEdges({ scrollTop: 200, clientHeight: 100, scrollHeight: 300 }),
    { top: true, bottom: false },
    "at end: top fade only"
  );
  assert.deepEqual(
    fadeEdges({ scrollTop: 50, clientHeight: 100, scrollHeight: 300 }),
    { top: true, bottom: true },
    "middle: both"
  );
}

// -- Edge cases: sub-pixel scroll positions from zoom --------------------------
{
  assert.deepEqual(
    fadeEdges({ scrollTop: 0.6, clientHeight: 100, scrollHeight: 300 }),
    { top: false, bottom: true },
    "sub-pixel top counts as top"
  );
  assert.deepEqual(
    fadeEdges({ scrollTop: 199.4, clientHeight: 100, scrollHeight: 300 }),
    { top: true, bottom: false },
    "sub-pixel end counts as end"
  );
}

console.log("scrollFade self-check passed");
