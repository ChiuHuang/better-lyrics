export const KARAOKE_LAYOUTS = ["subtitle", "rolling"] as const;
export const KARAOKE_SIZES = ["s", "m", "l"] as const;
export const KARAOKE_BACKDROPS = ["plate", "blur", "scrim", "none"] as const;
export const KARAOKE_CREDITS = ["auto", "intro", "outro", "off"] as const;

export type KaraokeLayout = (typeof KARAOKE_LAYOUTS)[number];
export type KaraokeSize = (typeof KARAOKE_SIZES)[number];
export type KaraokeBackdrop = (typeof KARAOKE_BACKDROPS)[number];
export type KaraokeCredits = (typeof KARAOKE_CREDITS)[number];

export const KARAOKE_DEFAULTS = {
  isKaraokeEnabled: false,
  karaokeLayout: "subtitle" as KaraokeLayout,
  karaokeSize: "s" as KaraokeSize,
  karaokeBackdrop: "plate" as KaraokeBackdrop,
  karaokeCredits: "auto" as KaraokeCredits,
  isKaraokeBackgroundVocalsEnabled: true,
};
