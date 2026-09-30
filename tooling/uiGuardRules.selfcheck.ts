import assert from "node:assert/strict";

const { countDarkFieldWells, countNativeSelects, countUppercase } = await import("./uiGuardRules");

// -- Native select --------------------------
{
  assert.equal(countNativeSelects(`<select id="a"></select><select>`), 2, "counts every opening select tag");
  assert.equal(countNativeSelects(`document.createElement("select")`), 1, "counts createElement(select)");
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

console.log("uiGuardRules self-check passed");
