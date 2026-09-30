import { strict as assert } from "node:assert";
import {
  fallbackLines,
  ORIGINAL_VIEW,
  parseLyrics,
  previewLines,
  ROMANIZATION_VIEW,
  translationLanguages,
} from "@/options/unison/lyricsPreviewLines";

const ttml = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Word" xml:lang="ja"><head><metadata><iTunesMetadata xmlns="http://music.apple.com/lyric-ttml-internal"><translations><translation type="subtitle" xml:lang="en"><text for="L1">Good day</text></translation><translation type="subtitle" xml:lang="zh-Hans"><text for="L1">你好</text></translation></translations><transliterations><transliteration xml:lang="ja-Latn"><text for="L1"><span begin="1.0" end="1.5">go</span><span begin="1.5" end="2.0">kigen</span></text></transliteration></transliterations></iTunesMetadata></metadata></head><body dur="10.0"><div><p begin="1.0" end="3.0" itunes:key="L1"><span begin="1.0" end="1.5">ご</span><span begin="1.5" end="2.0">きげん</span><span ttm:role="x-bg"><span begin="2.0" end="3.0">(よう)</span></span></p><p begin="3.0" end="4.0" itunes:key="L2"><span begin="3.0" end="4.0">どうか</span></p></div></body></tt>`;

const lyrics = parseLyrics(ttml);
assert.equal(lyrics.length, 2, "instrumental outro is dropped");
assert.deepEqual(translationLanguages(lyrics), ["en", "zh-Hans"]);

assert.deepEqual(previewLines(lyrics, ORIGINAL_VIEW), [
  { text: "ごきげん", isBackground: false },
  { text: "(よう)", isBackground: true },
  { text: "どうか", isBackground: false },
]);
assert.deepEqual(
  previewLines(lyrics, ROMANIZATION_VIEW).map(line => line.text),
  ["gokigen", "どうか"],
  "romanization falls back to the original line"
);
assert.deepEqual(
  previewLines(lyrics, "zh-Hans").map(line => line.text),
  ["你好", "どうか"],
  "translation falls back to the original line"
);

const lrc = parseLyrics("[ar: X]\n[00:01.00]Hello there\n[00:03.00]World");
assert.deepEqual(
  previewLines(lrc, ORIGINAL_VIEW).map(line => line.text),
  ["Hello there", "World"]
);
assert.deepEqual(translationLanguages(lrc), []);

assert.deepEqual(
  previewLines(parseLyrics("[00:01]Hello\n[00:02]World"), ORIGINAL_VIEW).map(line => line.text),
  ["Hello", "World"],
  "regression: LRC without fractional seconds drops its timestamps"
);

const untimed = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="None"><body><div><p>First &amp; <span>only</span></p><tt:p xmlns:tt="http://www.w3.org/ns/ttml">Second &#233;&#x301;</tt:p></div></body></tt>`;
assert.deepEqual(parseLyrics(untimed), [], "braccato skips untimed paragraphs, which is why the fallback exists");
assert.deepEqual(
  fallbackLines(untimed, true).map(line => line.text),
  ["First & only", "Second \u00e9\u0301"],
  "regression: untimed TTML previews its paragraph text, not raw markup"
);
assert.deepEqual(
  fallbackLines("<tt><p>unclosed", true).map(line => line.text),
  ["<tt><p>unclosed"],
  "unparseable TTML falls back to raw lines"
);
assert.deepEqual(
  fallbackLines("<tt><body><p>Big &#99999999;</p></body></tt>", true).map(line => line.text),
  ["Big &#99999999;"],
  "out-of-range character references stay as written instead of throwing"
);
assert.deepEqual(
  fallbackLines("Plain one\n\nPlain two", false).map(line => line.text),
  ["Plain one", "Plain two"]
);

console.log("lyrics preview lines self-check passed");
