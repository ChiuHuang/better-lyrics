const LYRICS_FILE_EXTENSIONS = [".lrc", ".ttml", ".xml", ".txt"];

function isLyricsFile(file: File): boolean {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return LYRICS_FILE_EXTENSIONS.includes(ext);
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
    if (file && isLyricsFile(file)) void file.text().then(onLoad);
  });
}

export function createLyricsFileInput(onLoad: (text: string) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = LYRICS_FILE_EXTENSIONS.join(",");
  input.hidden = true;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (file && isLyricsFile(file)) void file.text().then(onLoad);
  });
  return input;
}
