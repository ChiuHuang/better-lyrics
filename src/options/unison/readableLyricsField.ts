import type { EditorHandle } from "@braccato/highlight";
import { lyricsForSave, readableTtml } from "@/options/unison/ttmlLayout";

export interface ReadableLyricsField {
  replace(text: string): void;
  text(original?: string): string;
}

const PASTE_INPUT_TYPES = new Set(["insertFromPaste", "insertFromDrop"]);

/** Readable TTML layout on a highlighted lyrics textarea; only a paste that replaces everything re-lays it out. */
export function bindReadableLyricsField(textarea: HTMLTextAreaElement, editor: EditorHandle): ReadableLyricsField {
  let readable = false;
  let replacesAll = false;
  let relayingOut = false;

  const apply = (text: string): void => {
    const layout = readableTtml(text);
    readable = layout.readable;
    textarea.value = layout.text;
    editor.refresh();
  };

  // Inserting through the editing pipeline keeps the paste undoable; assigning value would wipe the undo stack.
  const relayoutPaste = (): void => {
    const layout = readableTtml(textarea.value);
    readable = layout.readable;
    if (!layout.readable) return;
    relayingOut = true;
    textarea.select();
    const inserted = document.execCommand("insertText", false, layout.text);
    relayingOut = false;
    if (!inserted) apply(textarea.value);
  };

  textarea.addEventListener("beforeinput", () => {
    const { selectionStart, selectionEnd, value } = textarea;
    replacesAll = value === "" || (selectionStart === 0 && selectionEnd === value.length);
  });
  textarea.addEventListener("input", event => {
    if (relayingOut) return;
    const inputType = event instanceof InputEvent ? event.inputType : "";
    if (textarea.value === "") readable = false;
    else if (replacesAll && PASTE_INPUT_TYPES.has(inputType)) relayoutPaste();
  });

  return {
    replace: apply,
    text: original => lyricsForSave(textarea.value, { readable, original }),
  };
}
