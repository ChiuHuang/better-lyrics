const countMatches = (source: string, pattern: RegExp): number => source.match(pattern)?.length ?? 0;

const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

const FIELD_SELECTOR = /input|textarea|field|search/i;
const DARK_WELL_COLOUR = String.raw`rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0*\.20*\s*\)|rgba?\(\s*0\s+0\s+0\s*\/\s*(?:0*\.20*|20%)\s*\)`;
const DARK_WELL_BACKGROUND = new RegExp(String.raw`background(?:-color)?\s*:[^;}]*(?:${DARK_WELL_COLOUR})`, "gi");
const INNERMOST_RULE = /([^{}]+)\{([^{}]*)\}/g;

export function countNativeSelects(source: string): number {
  return countMatches(source, /<select\b|createElement\("select"\)/g);
}

export function countUppercase(css: string): number {
  return countMatches(css, /text-transform:\s*uppercase/gi);
}

export function countDarkFieldWells(css: string): number {
  let count = 0;
  for (const [, selector, body] of stripCssComments(css).matchAll(INNERMOST_RULE)) {
    if (FIELD_SELECTOR.test(selector)) count += countMatches(body, DARK_WELL_BACKGROUND);
  }
  return count;
}
