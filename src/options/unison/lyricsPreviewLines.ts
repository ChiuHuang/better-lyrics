import { detectParser, type Lyric } from "@braccato/parsers";
import { LOG_PREFIX } from "@constants";

const LRC_TIMESTAMPS = /^(\[[\d:.]+\]\s*)+|<[\d:.]+>\s*/g;

export const ORIGINAL_VIEW = "original";
export const ROMANIZATION_VIEW = "romanization";

export interface PreviewLine {
  text: string;
  isBackground: boolean;
}

export function parseLyrics(text: string): Lyric[] {
  try {
    return detectParser(text)
      .parse(text)
      .filter(line => !line.isInstrumental);
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to parse lyrics preview`, error);
    return [];
  }
}

function translationOf(line: Lyric, lang: string): string | undefined {
  return line.translations?.[lang] ?? (line.translation?.lang === lang ? line.translation.text : undefined);
}

export function translationLanguages(lyrics: Lyric[]): string[] {
  const languages = new Set<string>();
  for (const line of lyrics) {
    for (const lang of Object.keys(line.translations ?? {})) languages.add(lang);
    if (line.translation) languages.add(line.translation.lang);
  }
  return [...languages];
}

export function previewLines(lyrics: Lyric[], view: string): PreviewLine[] {
  return lyrics.flatMap(line => {
    const parts = line.parts ?? [];
    const background = parts.filter(part => part.isBackground);
    const main = background.length > 0 ? parts.filter(part => !part.isBackground) : [];
    const original = (main.length > 0 ? main.map(part => part.words).join("") : line.words)
      .replace(LRC_TIMESTAMPS, "")
      .trim();
    if (view === ROMANIZATION_VIEW) return [{ text: line.romanization ?? original, isBackground: false }];
    if (view !== ORIGINAL_VIEW) return [{ text: translationOf(line, view) ?? original, isBackground: false }];
    const lines: PreviewLine[] = [{ text: original, isBackground: false }];
    const backgroundText = background
      .map(part => part.words)
      .join("")
      .trim();
    if (backgroundText) lines.push({ text: backgroundText, isBackground: true });
    return lines;
  });
}

const TTML_PARAGRAPH = /<(?:[\w-]+:)?p\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?p>/g;
const XML_TAG = /<[^>]*>/g;
const XML_ENTITY = /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi;
const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXmlEntities(text: string): string {
  return text.replace(XML_ENTITY, (match, entity: string) => {
    if (entity[0] !== "#") return NAMED_ENTITIES[entity.toLowerCase()];
    const code = entity[1].toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

export function fallbackLines(text: string, isTtml: boolean): PreviewLine[] {
  const paragraphs = isTtml ? Array.from(text.matchAll(TTML_PARAGRAPH), match => match[1]) : [];
  const texts =
    paragraphs.length > 0 ? paragraphs.map(p => decodeXmlEntities(p.replace(XML_TAG, ""))) : text.split("\n");
  return texts.map(line => ({ text: line.trim(), isBackground: false })).filter(line => line.text);
}
