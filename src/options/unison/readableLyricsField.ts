import type { EditorHandle } from "@braccato/highlight";
import { compactTtml, readableTtml } from "@/options/unison/ttmlLayout";

export interface ReadableLyricsField {
  replace(text: string): void;
  text(): string;
}

const PASTE_INPUT_TYPES = new Set(["insertFromPaste", "insertFromDrop"]);

/** Readable TTML layout on a highlighted lyrics textarea; only a paste that replaces everything re-lays it out. */
export function bindReadableLyricsField(textarea: HTMLTextAreaElement, editor: EditorHandle): ReadableLyricsField {
  let readable = false;
  let replacesAll = false;

  const apply = (text: string): void => {
    const layout = readableTtml(text);
    readable = layout.readable;
    textarea.value = layout.text;
    editor.refresh();
  };

  textarea.addEventListener("beforeinput", () => {
    const { selectionStart, selectionEnd, value } = textarea;
    replacesAll = value === "" || (selectionStart === 0 && selectionEnd === value.length);
  });
  textarea.addEventListener("input", event => {
    const inputType = event instanceof InputEvent ? event.inputType : "";
    if (textarea.value === "") readable = false;
    else if (replacesAll && PASTE_INPUT_TYPES.has(inputType)) apply(textarea.value);
  });

  return {
    replace: apply,
    text: () => (readable ? compactTtml(textarea.value) : textarea.value).trim(),
  };
}
