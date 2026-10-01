const NON_TEXT_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "range",
  "color",
  "file",
  "image",
]);

/** True when keystrokes on `element` type text, so page shortcuts must stand down. */
export function isTextEntry(element: Element | null): boolean {
  if (element instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(element.type);
  if (element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLElement && element.isContentEditable;
}
