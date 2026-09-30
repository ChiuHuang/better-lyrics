import { strict as assert } from "node:assert";
import { detectScriptLanguage, hasNonLatinScript } from "@modules/lyrics/nonLatinScript";

// -- Stylized Latin --------------------------

assert.equal(hasNonLatinScript("I need some dick for Tuesday, let me go"), false, "plain Latin");
assert.equal(hasNonLatinScript("Lеt me get you right"), false, "regression: Cyrillic e inside a Latin word");
assert.equal(hasNonLatinScript("Hе wanna link later"), false, "regression: Cyrillic e after a Latin capital");
assert.equal(hasNonLatinScript("Sofiα in the city"), false, "Greek alpha inside a Latin word");
assert.equal(hasNonLatinScript("Lеt's go"), false, "stylized word next to an apostrophe");
assert.equal(detectScriptLanguage("Lеt me get you right"), null, "stylized Latin reports no script language");

// -- Real non-Latin text --------------------------

assert.equal(hasNonLatinScript("Привет, как дела"), true, "Cyrillic");
assert.equal(hasNonLatinScript("Καλημέρα"), true, "Greek");
assert.equal(hasNonLatinScript("мо́й"), true, "Cyrillic with a combining stress mark");
assert.equal(hasNonLatinScript("ごきげんよう"), true, "Japanese");
assert.equal(hasNonLatinScript("Tシャツ"), true, "Latin mixed with katakana");
assert.equal(hasNonLatinScript("I love 你"), true, "separate non-Latin word in an English line");
assert.equal(hasNonLatinScript("Lеt me say Привет"), true, "stylized word does not hide a real Cyrillic word");
assert.equal(detectScriptLanguage("Привет"), "ru");

// -- Regressions --------------------------

assert.equal(hasNonLatinScript("Hello—Привет"), true, "regression: punctuation joins Latin and Cyrillic words");
assert.equal(hasNonLatinScript("Rock-н-ролл forever"), true, "regression: hyphenated mixed-script phrase");
assert.equal(hasNonLatinScript("YouTube-канал"), true, "regression: hyphenated brand and Cyrillic word");
assert.equal(hasNonLatinScript("Привiт"), true, "regression: Ukrainian typed with a Latin i");
assert.equal(hasNonLatinScript("Мiй свiт"), true, "regression: several Latin i in Cyrillic words");
assert.equal(hasNonLatinScript("Нi"), true, "regression: short Cyrillic word with a Latin i, tied letter counts");
assert.equal(hasNonLatinScript("Нi, нi, нi"), true, "regression: tied words in a Cyrillic line");

// -- Edge cases --------------------------

assert.equal(hasNonLatinScript(""), false, "empty");
assert.equal(hasNonLatinScript("♪"), false, "symbol only");
assert.equal(hasNonLatinScript("123 !!"), false, "digits and punctuation");

console.log("non-Latin script self-check passed");
