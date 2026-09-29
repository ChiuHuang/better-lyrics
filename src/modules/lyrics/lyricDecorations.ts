import type { LyricDecorations } from "@modules/lyrics/injectLyrics";
import { injectRomanization, injectTranslation, type LyricsRenderer } from "@braccato/core";

/**
 * Hangs the translated and romanized text the side panel's passes produced off another view's own
 * line elements. Both injectors no-op on a line that already carries one, so re-running after every
 * build costs a lookup per line. Free of `chrome.*`: the floating window's host runs in the page
 * world on Firefox.
 */
export function applyLyricDecorations(
  renderer: Pick<LyricsRenderer, "container" | "lines">,
  decorations: LyricDecorations
): void {
  // The container is built out of the renderer's own document, so it names the document to build in.
  const doc = renderer.container?.ownerDocument;
  if (!doc) return;

  const lines = renderer.lines;
  for (const [index, decoration] of Object.entries(decorations)) {
    const line = lines[Number(index)];
    if (!line) continue;
    if (decoration.romanization) {
      injectRomanization(doc, line.lyricElement, line, decoration.romanization, decoration.timedRomanization ?? null);
    }
    if (decoration.translation) {
      injectTranslation(doc, line.lyricElement, decoration.translation, decoration.translationLanguage);
    }
  }
}
