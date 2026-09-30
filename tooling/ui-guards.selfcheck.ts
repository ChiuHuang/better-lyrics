import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const scanDirs = ["src", "pages"].map(dir => join(root, dir));

const files = scanDirs.flatMap(dir =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter(entry => /\.(ts|css|html)$/.test(entry) && !entry.endsWith(".selfcheck.ts"))
    .map(entry => join(dir, entry))
);

interface Rule {
  name: string;
  pattern: RegExp;
  appliesTo: (path: string) => boolean;
}

const RULES: Rule[] = [
  { name: "native select", pattern: /<select\b|createElement\("select"\)/g, appliesTo: p => !p.startsWith("src/ui/") },
  { name: "uppercase text", pattern: /text-transform:\s*uppercase/g, appliesTo: p => p.endsWith(".css") },
  {
    name: "dark field well",
    pattern: /background:\s*rgba\(0,\s*0,\s*0,\s*0\.2\)/g,
    appliesTo: p => p.endsWith(".css"),
  },
];

// Existing violations, removed by the plan named. Delete entries as you fix them; never add new ones.
const KNOWN: Record<string, string[]> = {
  "native select": [
    // plan 03
    "src/options/options.html",
    // plan 04
    "pages/unison.html",
    "src/options/unison/revisions/revisionEditor.ts",
  ],
  "uppercase text": [
    // plan 07
    "src/options/options.css",
    "src/options/store/store.css",
    "src/options/unison/unison.css",
  ],
  "dark field well": [
    // plan 07
    "src/options/options.css",
    "src/options/store/store.css",
  ],
};

const found: Record<string, Set<string>> = Object.fromEntries(RULES.map(rule => [rule.name, new Set<string>()]));

for (const file of files) {
  const path = relative(root, file);
  const source = readFileSync(file, "utf8");
  for (const rule of RULES) {
    if (rule.appliesTo(path) && rule.pattern.test(source)) found[rule.name].add(path);
    rule.pattern.lastIndex = 0;
  }
}

for (const rule of RULES) {
  const known = new Set(KNOWN[rule.name] ?? []);
  const offenders = [...found[rule.name]].filter(path => !known.has(path));
  assert.deepEqual(offenders, [], `${rule.name}: new violation(s). Use the src/ui primitive instead.`);
  const fixed = [...known].filter(path => !found[rule.name].has(path));
  assert.deepEqual(fixed, [], `${rule.name}: fixed, now remove from KNOWN in tooling/ui-guards.selfcheck.ts`);
}

console.log("ui guards passed");
