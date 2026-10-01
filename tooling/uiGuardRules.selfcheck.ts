import assert from "node:assert/strict";

const { countDarkFieldWells, countNativeSelects, countRawFontSizes, countUppercase } = await import("./uiGuardRules");

// -- Native select --------------------------
{
  assert.equal(countNativeSelects(`<select id="a"></select><select>`), 2, "counts every opening select tag");
  assert.equal(countNativeSelects(`document.createElement("select")`), 1, "counts createElement(select)");
  assert.equal(countNativeSelects(`document.createElement('select')`), 1, "counts single-quoted createElement(select)");
  assert.equal(countNativeSelects("document.createElement(`select`)"), 1, "counts backtick createElement(select)");
  assert.equal(
    countNativeSelects(`document.createElement( "select" )`),
    1,
    "counts createElement(select) with inner spaces"
  );
  assert.equal(countNativeSelects(`document.createElement("select')`), 0, "ignores mismatched quotes");
  assert.equal(countNativeSelects(`document.createElement("selection")`), 0, "ignores other element names");
  assert.equal(countNativeSelects(`<selected-item>`), 0, "ignores tags that only start with select");
  assert.equal(countNativeSelects(""), 0, "empty source has none");
}

// -- Uppercase --------------------------
{
  assert.equal(
    countUppercase(`.a { text-transform: uppercase; } .b{text-transform:uppercase}`),
    2,
    "counts each declaration"
  );
  assert.equal(countUppercase(`.a { text-transform: none; }`), 0, "other values are fine");
}

// -- Dark field well: colour spellings --------------------------
{
  const spellings = [
    "rgba(0, 0, 0, 0.2)",
    "rgba(0,0,0,.2)",
    "rgba(0 0 0 / 0.2)",
    "rgb(0 0 0 / .2)",
    "rgb(0 0 0 / 20%)",
    "RGBA(0, 0, 0, 0.20)",
  ];
  for (const colour of spellings) {
    assert.equal(countDarkFieldWells(`input { background: ${colour}; }`), 1, `background: ${colour} is a well`);
    assert.equal(
      countDarkFieldWells(`.x-field { background-color: ${colour}; }`),
      1,
      `background-color: ${colour} is a well`
    );
  }
}

// -- Dark field well: scope --------------------------
{
  assert.equal(
    countDarkFieldWells(`textarea:focus { background: rgba(0, 0, 0, 0.2); }`),
    1,
    "textarea selectors count"
  );
  assert.equal(countDarkFieldWells(`.search-box { background: rgba(0, 0, 0, 0.2); }`), 1, "search selectors count");
  assert.equal(
    countDarkFieldWells(`.a, .b input { background: rgba(0, 0, 0, 0.2); }`),
    1,
    "any selector in a group counts"
  );
  assert.equal(
    countDarkFieldWells(`@media (x) { .my-field { background: rgba(0,0,0,.2); } }`),
    1,
    "rules nested in at-rules count"
  );
  assert.equal(
    countDarkFieldWells(`::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2); }`),
    0,
    "scrollbar tracks are not fields"
  );
  assert.equal(countDarkFieldWells(`.cover img { background: rgba(0, 0, 0, 0.2); }`), 0, "image covers are not fields");
  assert.equal(
    countDarkFieldWells(`.nav-link:hover { background: rgba(0, 0, 0, 0.2); }`),
    0,
    "nav links are not fields"
  );
  assert.equal(
    countDarkFieldWells(`input { box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2); border-color: rgba(0,0,0,.2); }`),
    0,
    "only backgrounds count"
  );
  assert.equal(countDarkFieldWells(`input { background: rgba(0, 0, 0, 0.25); }`), 0, "other alphas are fine");
  assert.equal(countDarkFieldWells(`/* input { background: rgba(0,0,0,.2) } */`), 0, "comments are ignored");
}

// -- Raw font size --------------------------
{
  assert.equal(countRawFontSizes(`.a { font-size: 0.875rem; } .b{font-size:13px}`), 2, "counts rem and px literals");
  assert.equal(countRawFontSizes(`.a { font-size: var(--font-size-md); }`), 0, "tokens are fine");
  assert.equal(countRawFontSizes(`.a { font-size: 0.9em; } .b { font-size: 80%; }`), 0, "relative sizes are fine");
  assert.equal(countRawFontSizes(`.a { font-size: inherit; }`), 0, "inherit is fine");
  assert.equal(countRawFontSizes(`:root { --font-size-md: 0.875rem; }`), 0, "token definitions are not declarations");
  assert.equal(countRawFontSizes(`/* .a { font-size: 12px; } */`), 0, "comments are ignored");
  assert.equal(
    countRawFontSizes(`.a { font-size: var(--font-size-md, 12px); }`),
    1,
    "a raw fallback is still a raw size"
  );
  assert.equal(countRawFontSizes(`.a { font-size: var(--card-size); }`), 1, "only type scale tokens count as tokens");
  assert.equal(countRawFontSizes(`<p style="font-size: 12px">`), 1, "inline HTML styles count");
  assert.equal(countRawFontSizes(`el.style.fontSize = "12px";`), 1, "fontSize assignments count");
  assert.equal(countRawFontSizes(`Object.assign(el.style, { fontSize: '1rem' });`), 1, "fontSize object keys count");
  assert.equal(countRawFontSizes(`el.style.setProperty("font-size", "12px");`), 1, "setProperty counts");
  assert.equal(countRawFontSizes(`el.style.fontSize = "var(--font-size-md)";`), 0, "a token in TypeScript is fine");
  assert.equal(countRawFontSizes(`const fontSize = 16;`), 0, "a plain variable is not a style");
  assert.equal(countRawFontSizes(`interface Props { fontSize: number }`), 0, "a type annotation is not a style");
  assert.equal(
    countRawFontSizes(`el.style.fontSize = size;`),
    1,
    "style assignments must use a token, even from a variable"
  );
  assert.equal(countRawFontSizes('el.style.fontSize = 12 + "px";'), 1, "built sizes count");
  assert.equal(countRawFontSizes("el.style.fontSize = `${n}px`;"), 1, "template sizes count");
  assert.equal(countRawFontSizes("el.style.setProperty('font-size', size);"), 1, "setProperty from a variable counts");
  assert.equal(countRawFontSizes(`const style = { fontSize };`), 0, "shorthand keys are not literal sizes");
  assert.equal(countRawFontSizes(`settings.fontSize = nextSize;`), 0, "a non-style object is not a style");
  assert.equal(countRawFontSizes(`el.style?.fontSize = size;`), 1, "optional style access still counts");
  assert.equal(
    countRawFontSizes(`el.style.setProperty("font-size", "var(--font-size-md)");`),
    0,
    "setProperty with a token is fine"
  );
}

console.log("uiGuardRules self-check passed");
