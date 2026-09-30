// -- Version --------------------------

export function renderAppVersion(target: HTMLElement | null): void {
  if (!target) return;
  const manifest = chrome.runtime.getManifest();
  target.textContent = manifest.version_name ?? manifest.version;
}
