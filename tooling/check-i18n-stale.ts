import { execFileSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

type Bundle = Record<string, { message?: string }>;

export type StaleTranslation = { locale: string; key: string; stale: string; current: string };

// -- Detection --------------------------

export function pastSourceMessages(current: Bundle, history: Bundle[]): Map<string, Set<string>> {
  const past = new Map<string, Set<string>>();
  for (const version of history) {
    for (const [key, entry] of Object.entries(version)) {
      const message = entry?.message;
      const now = current[key]?.message;
      if (typeof message !== "string" || typeof now !== "string" || message === now) continue;
      const seen = past.get(key) ?? new Set<string>();
      seen.add(message);
      past.set(key, seen);
    }
  }
  return past;
}

export function findStaleTranslations(
  current: Bundle,
  past: Map<string, Set<string>>,
  locales: Record<string, Bundle>
): StaleTranslation[] {
  const stale: StaleTranslation[] = [];
  for (const [locale, bundle] of Object.entries(locales)) {
    for (const [key, oldMessages] of past) {
      const translated = bundle[key]?.message;
      const now = current[key]?.message;
      if (typeof translated !== "string" || typeof now !== "string") continue;
      if (oldMessages.has(translated)) stale.push({ locale, key, stale: translated, current: now });
    }
  }
  return stale.sort((a, b) => a.locale.localeCompare(b.locale) || a.key.localeCompare(b.key));
}

// -- CLI --------------------------

const SOURCE_LOCALE = "en";
const SOURCE_PATH = `_locales/${SOURCE_LOCALE}/messages.json`;

function sourceHistory(repoRoot: string): Bundle[] {
  const git = (args: string[]): string =>
    execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const commits = git(["log", "--format=%H", "--", SOURCE_PATH]).split("\n").filter(Boolean);
  if (commits.length < 2)
    throw new Error(`Only ${commits.length} commit(s) of ${SOURCE_PATH} found; fetch full history`);
  return commits.map(commit => JSON.parse(git(["show", `${commit}:${SOURCE_PATH}`])));
}

function main(): void {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const localesDir = join(repoRoot, "_locales");
  const load = (locale: string): Bundle => JSON.parse(readFileSync(join(localesDir, locale, "messages.json"), "utf8"));

  const current = load(SOURCE_LOCALE);
  const locales = Object.fromEntries(
    readdirSync(localesDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== SOURCE_LOCALE && existsSync(join(localesDir, d.name, "messages.json")))
      .map(d => [d.name, load(d.name)])
  );

  const history = sourceHistory(repoRoot);
  const stale = findStaleTranslations(current, pastSourceMessages(current, history), locales);

  if (stale.length === 0) {
    console.log(
      `i18n stale check passed: no leftover English across ${Object.keys(locales).length} locales (${history.length} source versions)`
    );
    return;
  }

  console.error(
    `i18n stale check FAILED: ${stale.length} translation(s) still hold an older English version of their key.\n`
  );
  let locale = "";
  for (const entry of stale) {
    if (entry.locale !== locale) {
      locale = entry.locale;
      console.error(`_locales/${locale}/messages.json`);
    }
    console.error(`  ${entry.key}`);
    console.error(`    ${locale}: ${entry.stale}`);
    console.error(`    en now: ${entry.current}`);
  }
  console.error("\nThe English text of these keys changed, but Crowdin kept the old copy.");
  console.error("Fix: delete the translations of these keys in the Crowdin Editor for each locale above, then sync.");
  console.error("Next time a string changes meaning, give it a new key instead of editing it in place.");
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
