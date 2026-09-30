import { type SyncType } from "@constants";
import { parseSvgString, syncTypeIcons } from "@modules/ui/lyricsDock/icons";

export type LyricFormat = "ttml" | "lrc" | "qrc" | "srt" | "plain";
export type LyricSyncLevel = "richsync" | "linesync" | "plain";

// -- Rule --------------------------

export function syncTypeForLyric(sync: LyricSyncLevel, format: string | undefined): SyncType {
  if (sync === "plain") return "unsynced";
  if (sync === "linesync") return "line";
  return format?.toLowerCase() === "ttml" ? "syllable" : "word";
}

// -- Element --------------------------

export interface SyncTagOptions {
  label: string;
  tooltip?: string;
}

export function createSyncIcon(type: SyncType): SVGElement | null {
  const icon = parseSvgString(syncTypeIcons[type]);
  if (!icon) return null;
  icon.removeAttribute("width");
  icon.removeAttribute("height");
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

export function createSyncTag(type: SyncType, { label, tooltip }: SyncTagOptions): HTMLSpanElement {
  const tag = document.createElement("span");
  tag.className = `ui-sync-tag ui-sync-tag--${type}`;
  if (tooltip) tag.dataset.tooltip = tooltip;
  const icon = createSyncIcon(type);
  if (icon) tag.appendChild(icon);
  const text = document.createElement("span");
  text.textContent = label;
  tag.appendChild(text);
  return tag;
}
