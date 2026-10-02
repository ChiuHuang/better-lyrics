import assert from "node:assert/strict";
import { copiedBeforeChange, findStaleTranslations, sourceChanges } from "@tooling/check-i18n-stale";

const msg = (message: string) => ({ message });

const OLD_ABOUT = "Theme Marketplace with community themes.";
const current = {
  about: msg("Unison: community lyrics anyone can submit, vote on and fix."),
  title: msg("All themes"),
  stable: msg("Lyrics"),
};
const history = [
  { date: 100, bundle: { about: msg(OLD_ABOUT), title: msg("All Themes"), stable: msg("Lyrics") } },
  { date: 200, bundle: { about: msg(OLD_ABOUT), title: msg("All Themes"), stable: msg("Lyrics") } },
  { date: 300, bundle: { about: msg(OLD_ABOUT), title: msg("All themes"), stable: msg("Lyrics") } },
  { date: 400, bundle: current },
];
const changes = sourceChanges(current, history);

// -- Happy paths --------------------------
{
  assert.deepEqual(
    findStaleTranslations(current, changes, {
      de: { about: msg("Unison: Community-Lyrics."), title: msg("Alle Themes") },
    }),
    [],
    "real translations pass"
  );
  assert.deepEqual(
    findStaleTranslations(current, changes, { fil: { about: current.about, title: current.title } }),
    [],
    "a copy of the current English passes"
  );
  assert.equal(changes.get("about")?.get(OLD_ABOUT), 400, "records when the English moved away from each old text");
  assert.equal(changes.get("title")?.get("All Themes"), 300, "each key keeps its own change date");
}

// -- Regressions --------------------------
{
  assert.deepEqual(
    findStaleTranslations(current, changes, { de: { about: msg(OLD_ABOUT), title: msg("Alle Themes") } }),
    [{ locale: "de", key: "about", stale: OLD_ABOUT, current: current.about.message }],
    "regression: #961/#965 shipped the old English of a rewritten key"
  );
  assert.equal(
    findStaleTranslations(current, changes, { cs: { title: msg("All Themes") } }).length,
    1,
    "regression: a casing-only edit still leaves a stale copy"
  );
  assert.equal(
    copiedBeforeChange(changes, "about", OLD_ABOUT, 150),
    true,
    "a copy Crowdin stored while the old English was live is deletable"
  );
  assert.equal(
    copiedBeforeChange(changes, "about", OLD_ABOUT, 450),
    false,
    "regression: a translation chosen after the English changed is never auto-deleted"
  );
}

// -- Edge cases --------------------------
{
  assert.equal(changes.has("stable"), false, "a key whose English never changed has no past versions");
  assert.deepEqual(
    sourceChanges(current, [
      { date: 1, bundle: { removed: msg("Gone"), about: { message: undefined } } },
      { date: 2, bundle: current },
    ]),
    new Map(),
    "keys no longer in the source and entries without a message are ignored"
  );
  assert.deepEqual(sourceChanges(current, [{ date: 1, bundle: current }]), new Map(), "one version has no changes");
  assert.deepEqual(findStaleTranslations(current, changes, { ja: {} }), [], "a locale missing the key is not stale");
  assert.deepEqual(findStaleTranslations(current, changes, {}), [], "no locales, no findings");
  assert.equal(
    copiedBeforeChange(changes, "about", OLD_ABOUT, 400),
    false,
    "created at the change instant is not before it"
  );
  assert.equal(copiedBeforeChange(changes, "stable", "Lyrics", 0), false, "an unchanged key is never deletable");
}

// -- Invariants --------------------------
{
  const shuffled = sourceChanges(current, [history[3], history[0], history[2], history[1]]);
  assert.deepEqual(shuffled, changes, "history order does not matter");

  const flipFlop = sourceChanges({ k: msg("C") }, [
    { date: 1, bundle: { k: msg("A") } },
    { date: 2, bundle: { k: msg("B") } },
    { date: 3, bundle: { k: msg("A") } },
    { date: 4, bundle: { k: msg("C") } },
  ]);
  assert.equal(flipFlop.get("k")?.get("A"), 4, "text that came back keeps its latest move-away date");
  assert.equal(flipFlop.get("k")?.get("B"), 3, "every past text is tracked");

  const result = findStaleTranslations(current, changes, {
    zh_TW: { title: msg("All Themes") },
    cs: { title: msg("All Themes"), about: msg(OLD_ABOUT) },
  });
  assert.deepEqual(
    result.map(entry => `${entry.locale}:${entry.key}`),
    ["cs:about", "cs:title", "zh_TW:title"],
    "findings sort by locale, then key"
  );
}

console.log("i18n stale check self-check passed");
