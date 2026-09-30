import assert from "node:assert/strict";

const { syncTypeForLyric } = await import("./syncTag");

// -- Happy paths --------------------------
{
  assert.equal(syncTypeForLyric("richsync", "ttml"), "syllable", "rich TTML reads Syllable");
  assert.equal(syncTypeForLyric("richsync", "lrc"), "word", "word-timed LRC reads Word");
  assert.equal(syncTypeForLyric("richsync", "qrc"), "word", "word-timed QRC reads Word");
  assert.equal(syncTypeForLyric("linesync", "lrc"), "line", "line LRC reads Line");
  assert.equal(syncTypeForLyric("linesync", "ttml"), "line", "line TTML reads Line");
  assert.equal(syncTypeForLyric("plain", "plain"), "unsynced", "plain reads Unsynced");
}

// -- Edge cases --------------------------
{
  assert.equal(syncTypeForLyric("plain", "lrc"), "unsynced", "plain sync wins over any format");
  assert.equal(syncTypeForLyric("richsync", "TTML"), "syllable", "format is case-insensitive");
  assert.equal(syncTypeForLyric("richsync", undefined), "word", "unknown format with rich sync falls back to Word");
}

// -- Regressions --------------------------
{
  // Owner rule 2026-10-01: TTML that declares word timing still reads Syllable; timing is never parsed.
  assert.equal(syncTypeForLyric("richsync", "ttml"), "syllable", "regression: TTML word timing is not Word");
}

console.log("syncTag self-check passed");
