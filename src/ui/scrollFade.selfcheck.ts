import assert from "node:assert/strict";

const { fadeEdges, fadeInlineEdges } = await import("@/ui/scrollFade");

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

// -- Inline axis --------------------------
{
  const metrics = { clientWidth: 100, scrollWidth: 300 };
  assert.deepEqual(
    fadeInlineEdges({ ...metrics, scrollLeft: 0 }),
    { start: false, end: true },
    "ltr at start: end fade only"
  );
  assert.deepEqual(
    fadeInlineEdges({ ...metrics, scrollLeft: 200 }),
    { start: true, end: false },
    "ltr at end: start fade only"
  );
  assert.deepEqual(fadeInlineEdges({ ...metrics, scrollLeft: 80 }), { start: true, end: true }, "ltr middle: both");
  assert.deepEqual(
    fadeInlineEdges({ ...metrics, scrollLeft: 0 }, true),
    { start: false, end: true },
    "rtl at start: end fade only"
  );
  assert.deepEqual(
    fadeInlineEdges({ ...metrics, scrollLeft: -200 }, true),
    { start: true, end: false },
    "rtl at end: start fade only"
  );
  assert.deepEqual(
    fadeInlineEdges({ ...metrics, scrollLeft: -80 }, true),
    { start: true, end: true },
    "rtl middle: both"
  );
  assert.deepEqual(
    fadeInlineEdges({ clientWidth: 300, scrollWidth: 300, scrollLeft: 0 }),
    { start: false, end: false },
    "fits: no fade"
  );
  assert.deepEqual(
    fadeInlineEdges({ ...metrics, scrollLeft: 199.4 }),
    { start: true, end: false },
    "sub-pixel end counts as end"
  );
}

console.log("scrollFade self-check passed");
