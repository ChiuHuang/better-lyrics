import { containsNonLatin, detectNonLatinLanguage } from "@braccato/core/text";

const LATIN_LETTERS = /\p{Script=Latin}/gu;
const LATIN_LOOKALIKE_LETTERS = /[\p{Script=Cyrillic}\p{Script=Greek}]/gu;
const NON_LETTERS = /[^\p{L}\p{M}]+/u;

interface ScriptBalance {
  latin: number;
  lookalikes: number;
}

function scriptBalance(text: string): ScriptBalance {
  return {
    latin: text.match(LATIN_LETTERS)?.length ?? 0,
    lookalikes: text.match(LATIN_LOOKALIKE_LETTERS)?.length ?? 0,
  };
}

function isStylizedLatinWord(word: string, line: ScriptBalance): boolean {
  const { latin, lookalikes } = scriptBalance(word);
  if (lookalikes === 0) return false;
  return latin > lookalikes || (latin === lookalikes && line.latin > line.lookalikes);
}

export function hasNonLatinScript(text: string): boolean {
  const line = scriptBalance(text);
  return text.split(NON_LETTERS).some(word => containsNonLatin(word) && !isStylizedLatinWord(word, line));
}

export function detectScriptLanguage(text: string): string | null {
  return hasNonLatinScript(text) ? detectNonLatinLanguage(text) : null;
}
