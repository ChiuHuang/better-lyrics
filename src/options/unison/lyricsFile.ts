import { warnUnison } from "@core/logger";

const LYRICS_FILE_EXTENSIONS = [".lrc", ".ttml", ".xml", ".txt"];

const pendingReads = new WeakSet<HTMLTextAreaElement>();

function isLyricsFile(file: File): boolean {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return LYRICS_FILE_EXTENSIONS.includes(ext);
}

function readLyricsFile(file: File, textarea: HTMLTextAreaElement, onLoad: (text: string) => void): void {
  if (!isLyricsFile(file) || pendingReads.has(textarea)) return;
  const wasReadOnly = textarea.readOnly;
  pendingReads.add(textarea);
  textarea.readOnly = true;
  file
    .text()
    .then(onLoad, err => warnUnison(`Failed to read lyrics file ${file.name}`, err))
    .finally(() => {
      pendingReads.delete(textarea);
      textarea.readOnly = wasReadOnly;
    });
}

export function bindLyricsFileDrop(textarea: HTMLTextAreaElement, onLoad: (text: string) => void): void {
  textarea.addEventListener("dragover", event => {
    event.preventDefault();
    textarea.classList.add("unison-textarea--dragover");
  });
  textarea.addEventListener("dragleave", () => {
    textarea.classList.remove("unison-textarea--dragover");
  });
  textarea.addEventListener("drop", event => {
    event.preventDefault();
    textarea.classList.remove("unison-textarea--dragover");
    const file = event.dataTransfer?.files[0];
    if (file) readLyricsFile(file, textarea, onLoad);
  });
}

export function createLyricsFileInput(textarea: HTMLTextAreaElement, onLoad: (text: string) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = LYRICS_FILE_EXTENSIONS.join(",");
  input.hidden = true;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) readLyricsFile(file, textarea, onLoad);
  });
  return input;
}
