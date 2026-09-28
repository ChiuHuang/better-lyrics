export function versionedStylesheetUrl(path: string): string {
  return `${chrome.runtime.getURL(path)}?v=${chrome.runtime.getManifest().version}`;
}
