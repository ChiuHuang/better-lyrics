import { containsNonLatin, detectNonLatinLanguage } from "@braccato/core/text";

const LATIN_LETTERS = /\p{Script=Latin}/gu;
const LATIN_LOOKALIKE_LETTERS = /[\p{Script=Cyrillic}\p{Script=Greek}]/gu;
const NON_LETTERS = /[^\p{L}\p{M}]+/u;

// A mostly-Latin word with Cyrillic or Greek lookalikes mixed in ("Lеt") is stylized Latin, not another script.
function isStylizedLatinWord(word: string): boolean {
  const latin = word.match(LATIN_LETTERS)?.length ?? 0;
  const lookalikes = word.match(LATIN_LOOKALIKE_LETTERS)?.length ?? 0;
  return lookalikes > 0 && latin >= lookalikes;
}

export function hasNonLatinScript(text: string): boolean {
  return text.split(NON_LETTERS).some(word => containsNonLatin(word) && !isStylizedLatinWord(word));
}

export function detectScriptLanguage(text: string): string | null {
  return hasNonLatinScript(text) ? detectNonLatinLanguage(text) : null;
}
