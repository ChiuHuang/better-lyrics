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

/** True only for text in exactly the readable form of compactable TTML, so the layout is read from the text, never tracked. */
export function isReadableLayout(text: string): boolean {
  const layout = readableTtml(compactTtml(text));
  return layout.readable && layout.text === text;
}

/** Text to save: unchanged text keeps its exact bytes (the server hashes them); a minified original stays compact whatever the user typed. */
export function lyricsForSave(text: string, original?: string): string {
  if (text === original) return text;
  const compact = isReadableLayout(text) || (original !== undefined && readableTtml(original).readable);
  const source = compact ? compactTtml(text) : text;
  return source === original ? source : source.trim();
}
