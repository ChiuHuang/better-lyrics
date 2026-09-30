import { initI18n, loadLocaleOverride } from "@core/i18n";
import { mountCodeEditor } from "./codeEditor";
import { initializeThemes } from "./themesUi";
import { openEditCSS } from "./ui/dom";
import { logEditor } from "@core/logger";

export function initialize() {
  document.addEventListener("DOMContentLoaded", async () => {
    await loadLocaleOverride();
    initI18n();
    logEditor("DOM loaded, initializing editor");
    mountCodeEditor();
    await initializeThemes();
    document.getElementById("edit-css-btn")?.addEventListener("click", openEditCSS);
    logEditor("Editor initialization complete");
  });
}
