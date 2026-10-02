import assert from "node:assert/strict";
import { findStaleTranslations, pastSourceMessages } from "./check-i18n-stale";

const msg = (message: string) => ({ message });

const current = {
  about: msg("Unison: community lyrics anyone can submit, vote on and fix."),
  title: msg("All themes"),
  stable: msg("Lyrics"),
};
const history = [
  current,
  { about: msg("Theme Marketplace with community themes."), title: msg("All Themes"), stable: msg("Lyrics") },
  { about: msg("Theme Marketplace with community themes."), title: msg("All Themes"), stable: msg("Lyrics") },
];
const past = pastSourceMessages(current, history);

// -- Happy paths --------------------------
{
  assert.deepEqual(
    findStaleTranslations(current, past, {
      de: { about: msg("Unison: Community-Lyrics."), title: msg("Alle Themes") },
    }),
    [],
    "real translations pass"
  );
  assert.deepEqual(
    findStaleTranslations(current, past, { fil: { about: current.about, title: current.title } }),
    [],
    "a copy of the current English passes"
  );
}

// -- Regressions --------------------------
{
  assert.deepEqual(
    findStaleTranslations(current, past, {
      de: { about: msg("Theme Marketplace with community themes."), title: msg("Alle Themes") },
    }),
    [
      {
        locale: "de",
        key: "about",
        stale: "Theme Marketplace with community themes.",
        current: current.about.message,
      },
    ],
    "regression: #961/#965 shipped the old English of a rewritten key"
  );
  assert.equal(
    findStaleTranslations(current, past, { cs: { title: msg("All Themes") } }).length,
    1,
    "regression: a casing-only edit still leaves a stale copy"
  );
}

// -- Edge cases --------------------------
{
  assert.equal(past.has("stable"), false, "a key whose English never changed has no past versions");
  assert.deepEqual(
    pastSourceMessages(current, [{ removed: msg("Gone") }, { about: { message: undefined } }]),
    new Map(),
    "keys no longer in the source and entries without a message are ignored"
  );
  assert.deepEqual(findStaleTranslations(current, past, { ja: {} }), [], "a locale missing the key is not stale");
  assert.deepEqual(findStaleTranslations(current, past, {}), [], "no locales, no findings");
}

// -- Invariants --------------------------
{
  const result = findStaleTranslations(current, past, {
    zh_TW: { title: msg("All Themes") },
    cs: { title: msg("All Themes"), about: msg("Theme Marketplace with community themes.") },
  });
  assert.deepEqual(
    result.map(entry => `${entry.locale}:${entry.key}`),
    ["cs:about", "cs:title", "zh_TW:title"],
    "findings sort by locale, then key"
  );
  assert.equal(past.get("about")?.size, 1, "repeated past versions collapse to one entry");
}

console.log("i18n stale check self-check passed");
