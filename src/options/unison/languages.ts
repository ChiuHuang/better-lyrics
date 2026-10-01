import { warnUnison } from "@core/logger";
import { findBestLanguageMatch } from "@utils";
import type { DropdownOption } from "@/ui/dropdownFilter";

// -- Languages --------------------------

const LANGUAGE_OPTIONS = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "nl",
  "sv",
  "da",
  "no",
  "fi",
  "pl",
  "cs",
  "sk",
  "hu",
  "ro",
  "el",
  "tr",
  "ru",
  "uk",
  "ja",
  "ko",
  "zh",
  "zh-Hant",
  "hi",
  "bn",
  "pa",
  "ta",
  "te",
  "ur",
  "id",
  "ms",
  "vi",
  "th",
  "fil",
  "ar",
  "he",
  "fa",
  "sw",
];

function languageDisplayNames(): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames(undefined, { type: "language" });
  } catch (err) {
    warnUnison("Intl.DisplayNames unavailable, falling back to language codes", err);
    return null;
  }
}

export function languageOptionList(opts: { leading?: DropdownOption; current?: string } = {}): DropdownOption[] {
  const names = languageDisplayNames();
  const list: DropdownOption[] = opts.leading ? [opts.leading] : [];
  for (const code of LANGUAGE_OPTIONS) list.push({ value: code, label: names?.of(code) ?? code });
  if (opts.current && !list.some(option => option.value === opts.current)) {
    list.push({ value: opts.current, label: opts.current });
  }
  return list;
}

export function matchLanguageOption(lang: string): string | null {
  return findBestLanguageMatch(lang, LANGUAGE_OPTIONS) ?? null;
}
