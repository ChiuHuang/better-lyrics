import { openSearchPanel } from "@codemirror/search";
import { GITHUB_REPO_URL } from "@constants";
import { createEditorState, createEditorView } from "./core/editor";
import { editorStateManager } from "./core/state";
import { generateDefaultFilename, importManager, saveCSSToFile } from "./features/import";
import { saveToStorage } from "./features/themes";
import { showAlert, showModal } from "./ui/feedback";
import { errorEditor, logEditor } from "@core/logger";

let mounted = false;

// -- Code editor (CodeMirror): created once, on demand in the popup --------------------------

function initializeEditorKeyboardShortcuts() {
  const editorElement = document.getElementById("editor");
  if (!editorElement) return;

  const isStandalone = document.querySelector(".theme-name-display.standalone") !== null;

  document.addEventListener("keydown", function (e) {
    const cssSection = document.getElementById("css");
    const editorIsVisible = isStandalone || (cssSection && cssSection.style.display === "block");

    if (!editorIsVisible) return;

    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveToStorage();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      if (isStandalone) {
        const view = editorStateManager.getEditor();
        if (view) {
          openSearchPanel(view);
        }
      } else {
        const message = document.createDocumentFragment();
        message.append("Find & Replace is only available in the fullscreen editor.");
        message.append(document.createElement("br"), document.createElement("br"));
        message.append("Click ");
        const strong = document.createElement("strong");
        strong.textContent = "Open Fullscreen Editor";
        message.append(strong, " to access all editor features.");

        showModal({
          title: "Find & Replace",
          message,
          confirmText: "Open Fullscreen Editor",
          cancelText: "Close",
        }).then(result => {
          if (result) {
            chrome.tabs.create({
              url: chrome.runtime.getURL("pages/standalone-editor.html"),
            });
          }
        });
      }
    }
  });
}

function initializeFileOperations() {
  document.getElementById("file-import-btn")?.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".css,.rics";
    input.onchange = async (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        await importManager.importCSSFile(file);
      } catch (err) {
        errorEditor("File import error:", err);
      }
    };
    input.click();
  });

  document.getElementById("file-export-btn")?.addEventListener("click", async () => {
    const css = editorStateManager.getContent();
    if (css === null) {
      showAlert("Editor not initialized!");
      return;
    }
    if (!css) {
      showAlert("No styles to export!");
      return;
    }

    const defaultFilename = generateDefaultFilename();
    saveCSSToFile(css, defaultFilename);
  });

  document.getElementById("styling-guide-btn")?.addEventListener("click", () => {
    window.open(`${GITHUB_REPO_URL}/blob/master/STYLING.md`, "_blank");
  });
}

function initializePopout() {
  const openStandaloneEditor = () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL("pages/standalone-editor.html"),
    });
  };

  document.getElementById("editor-popout-button")?.addEventListener("click", openStandaloneEditor);
  document.getElementById("editor-popout-link")?.addEventListener("click", e => {
    e.preventDefault();
    openStandaloneEditor();
  });
}

export function mountCodeEditor(): void {
  if (mounted) return;
  logEditor("Mounting code editor");

  const editorElement = document.getElementById("editor")!;
  const isStandalone = document.querySelector(".theme-name-display.standalone") !== null;
  const view = createEditorView(createEditorState("Loading...", { enableSearch: isStandalone }), editorElement);
  try {
    editorStateManager.setEditor(view);
  } catch (err) {
    view.destroy();
    throw err;
  }
  mounted = true;

  initializeEditorKeyboardShortcuts();
  initializeFileOperations();
  initializePopout();
}
