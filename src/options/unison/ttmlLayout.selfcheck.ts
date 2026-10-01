import assert from "node:assert/strict";
import { prettyTtml } from "@braccato/highlight";
import { compactTtml, readableTtml } from "@/options/unison/ttmlLayout";

// -- Fixtures --------------------------

// Shape of lyric 388 as Unison stores it: one line, composer metadata, word spans with inline spaces.
const MINIFIED_388 =
  '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" xmlns:composer="https://composer.boidu.dev/ttml" ttp:timeBase="media" xml:lang="en" composer:timing="Word"><head><metadata><ttm:title>01 - Self Aware</ttm:title><ttm:agent xml:id="v1" type="person"><ttm:name>Lead</ttm:name></ttm:agent><composer:groups><composer:group id="g1" label="Group 1" color="#f472b6" templateVersion="1"/></composer:groups></metadata></head><body dur="3:00.740"><div><p begin="0:15.110" end="0:16.936" ttm:agent="v1"><span begin="0:15.110" end="0:15.415">No</span> <span begin="0:15.415" end="0:15.847">smoke</span> <span begin="0:15.847" end="0:16.106">with</span></p><p begin="2:49.971" end="2:52.246" ttm:agent="v1"><span begin="2:49.971" end="2:50.342">I\'m</span> <span begin="2:50.974" end="2:51.392">self-</span><span begin="2:51.392" end="2:51.659">a</span><span begin="2:51.659" end="2:52.246">ware</span></p></div></body></tt>';

// Background vocals, an Apple metadata block with translations, and nested agents.
const MINIFIED_BG =
  '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Word" xml:lang="ja"><head><metadata><ttm:agent type="person" xml:id="v1"/><ttm:agent type="person" xml:id="v2"/><iTunesMetadata xmlns="http://music.apple.com/lyric-ttml-internal"><translations><translation type="subtitle" xml:lang="es"><text for="L1">bajo el cielo</text></translation></translations><songwriters><songwriter>Traditional</songwriter></songwriters></iTunesMetadata></metadata></head><body dur="0:48.000"><div begin="0:08.000" end="0:42.500"><p begin="0:08.000" end="0:12.500" itunes:key="L1" ttm:agent="v1"><span begin="0:08.000" end="0:09.000">さくら</span> <span begin="0:09.000" end="0:10.000">さくら</span><span ttm:role="x-bg"><span begin="0:10.000" end="0:11.000">(ooh</span> <span begin="0:11.000" end="0:12.000">yeah)</span></span></p><p begin="0:13.000" end="0:16.000" ttm:agent="v2">  spaced  line  </p></div><div><p begin="0:20.000" end="0:22.000">tail</p></div></body></tt>';

// Already formatted, like the dev fixtures: prettyTtml would rewrite its whitespace, so it must stay as written.
const FORMATTED = [
  '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xml:lang="en">',
  '  <head><metadata><ttm:agent type="person" xml:id="v1"/></metadata></head>',
  '  <body dur="0:30.000">',
  '    <div begin="0:01.000" end="0:10.000">',
  '      <p begin="0:01.000" end="0:04.600" ttm:agent="v1"><span begin="0:01.000" end="0:02.000">Amazing</span> <span begin="0:02.000" end="0:03.000">grace</span></p>',
  "    </div>",
  "  </body>",
  "</tt>",
].join("\n");

const spans = (src: string): string[] => src.match(/<span\b[^>]*>[^<]*<\/span>[^<]*/g) ?? [];

// -- Round trip --------------------------

for (const [name, src] of [
  ["lyric 388 shape", MINIFIED_388],
  ["background vocals and metadata", MINIFIED_BG],
] as const) {
  const pretty = prettyTtml(src);
  assert.notEqual(pretty, src, `${name}: prettyTtml adds line breaks`);
  assert.ok(pretty.split("\n").length > 4, `${name}: the pretty form is multi-line`);
  assert.equal(compactTtml(pretty), src, `${name}: compact(pretty(x)) restores the exact source`);
  assert.deepEqual(readableTtml(src), { text: pretty, readable: true }, `${name}: readable layout is offered`);
  assert.deepEqual(
    spans(compactTtml(pretty)),
    spans(src),
    `${name}: word spans and the spaces between them are untouched`
  );
  assert.equal(compactTtml(src), src, `${name}: compacting minified TTML is a no-op`);
}

// -- Lyric whitespace is content --------------------------

{
  const pretty = prettyTtml(MINIFIED_BG);
  assert.ok(pretty.includes("</span> <span"), "the space between word spans survives the pretty form");
  assert.ok(
    compactTtml(pretty).includes('<p begin="0:13.000" end="0:16.000" ttm:agent="v2">  spaced  line  </p>'),
    "inline whitespace inside a line is untouched"
  );
  assert.ok(!/\n\s*<span/.test(pretty), "no break is ever inserted before a span");
}

// -- Left as written --------------------------

assert.deepEqual(
  readableTtml(FORMATTED),
  { text: FORMATTED, readable: false },
  "already formatted TTML stays as written"
);
assert.deepEqual(
  readableTtml("[00:01.00]Never gonna\n[00:02.00]give you up"),
  { text: "[00:01.00]Never gonna\n[00:02.00]give you up", readable: false },
  "LRC is untouched"
);
assert.deepEqual(
  readableTtml("plain words\nmore words"),
  { text: "plain words\nmore words", readable: false },
  "plain text is untouched"
);
assert.deepEqual(readableTtml(""), { text: "", readable: false }, "empty text is untouched");
{
  const spaced = MINIFIED_388.replace("</p><p", "</p> <p");
  assert.equal(
    readableTtml(spaced).readable,
    false,
    "a source with its own whitespace before a line is never rewritten"
  );
}

// -- Edits keep their layout neutral --------------------------

{
  const edited = prettyTtml(MINIFIED_388).replace(">smoke<", ">smog<");
  assert.equal(
    compactTtml(edited),
    MINIFIED_388.replace(">smoke<", ">smog<"),
    "an edit in the pretty form compacts to the same edit"
  );
}

// -- Partial pastes keep the layout --------------------------

for (const src of [MINIFIED_388, MINIFIED_BG]) {
  const shown = readableTtml(src).text;
  const pastedWord = shown.replace(">smoke<", ">smoke again<").replace(">tail<", ">tail end<");
  assert.equal(
    readableTtml(compactTtml(pastedWord)).readable,
    true,
    "an edit inside the readable text still compacts to readable TTML"
  );
  const twoChunks = shown.replace("</div>", '<p begin="0:30.000" end="0:31.000">new</p></div>');
  assert.equal(
    readableTtml(compactTtml(twoChunks)).readable,
    true,
    "a pasted minified line inside the readable text keeps the layout"
  );
  assert.equal(
    readableTtml(pastedWord).readable,
    false,
    "the readable text is not minified, so it is never laid out again"
  );
}

console.log("ttml layout self-check passed");
