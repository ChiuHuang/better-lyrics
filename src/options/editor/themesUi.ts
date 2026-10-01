import { storageManager } from "@/options/editor/features/storage";
import {
  closeThemeModal,
  handleDeleteTheme,
  handleRenameTheme,
  handleSaveTheme,
  initStoreThemeListener,
  loadFeaturedThemes,
  openThemeModal,
  preloadInstalledThemeImages,
  setThemeName,
} from "@/options/editor/features/themes";
import {
  deleteThemeBtn,
  editThemeBtn,
  themeModalClose,
  themeModalOverlay,
  themeNameText,
  themeSelectorBtn,
} from "@/options/editor/ui/dom";
import { logEditor } from "@core/logger";

// -- Theme picker, theme actions, storage sync (no CodeMirror) --------------------------

function initializeThemeModal() {
  themeSelectorBtn?.addEventListener("click", openThemeModal);

  themeModalClose?.addEventListener("click", closeThemeModal);

  themeModalOverlay?.addEventListener("click", e => {
    if (e.target === themeModalOverlay) {
      closeThemeModal();
    }
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && themeModalOverlay?.classList.contains("active")) {
      closeThemeModal();
    }
  });
}

function initializeThemeActions() {
  document.getElementById("save-theme-btn")?.addEventListener("click", handleSaveTheme);

  deleteThemeBtn?.addEventListener("click", handleDeleteTheme);

  editThemeBtn?.addEventListener("click", handleRenameTheme);
  themeNameText?.addEventListener("click", handleRenameTheme);
}

export async function initializeThemes(): Promise<void> {
  initializeThemeModal();
  initializeThemeActions();
  storageManager.initialize();
  initStoreThemeListener();

  logEditor("Loading theme name and initial CSS");
  await Promise.allSettled([setThemeName(), storageManager.loadInitialCSS()]);
  preloadInstalledThemeImages();
  loadFeaturedThemes();
}
