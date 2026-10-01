import { prettyTtml } from "@braccato/highlight";
import { detectFormat } from "@/options/unison/lyricsPreviewLines";

// Whitespace right before a structural tag is layout, never lyric text: exactly what prettyTtml inserts.
const LAYOUT_WHITESPACE =
  /\s+(?=<(?:head|body|\/head|\/body|\/tt|div|\/div)[\s>]|<(?:p|ttm:agent|iTunesMetadata)[\s>/])/g;

export function compactTtml(src: string): string {
  return src.replace(LAYOUT_WHITESPACE, "");
}

/** Readable layout for minified TTML, only when compactTtml restores the exact source; anything else stays as written. */
export function readableTtml(src: string): { text: string; readable: boolean } {
  if (detectFormat(src) !== "ttml") return { text: src, readable: false };
  const pretty = prettyTtml(src);
  if (pretty === src || compactTtml(pretty) !== src) return { text: src, readable: false };
  return { text: pretty, readable: true };
}
