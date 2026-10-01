import { initI18n, loadLocaleOverride } from "@core/i18n";
import { mountCodeEditor } from "@/options/editor/codeEditor";
import { initializeThemes } from "@/options/editor/themesUi";
import { openEditCSS } from "@/options/editor/ui/dom";
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
