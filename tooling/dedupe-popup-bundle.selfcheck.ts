import assert from "node:assert/strict";
import { rewriteOptionsHtml, sameModuleSet } from "./dedupePopupBundle.mjs";

// -- rewriteOptionsHtml --------------------------
const html = `<head><link rel="stylesheet" href="/options/index.css"></head><body><script src="/options/index.js" type="module" defer=""></script></body>`;
{
  const out = rewriteOptionsHtml(html);
  assert.match(out, /href="\/action\/index\.css"/, "stylesheet points at the action copy");
  assert.match(out, /src="\/action\/index\.js"/, "script points at the action copy");
  assert.doesNotMatch(out, /\/options\/index\./, "no options asset reference remains");
}
{
  assert.equal(
    rewriteOptionsHtml("<p>/options/indexed</p>"),
    "<p>/options/indexed</p>",
    "only exact asset paths are rewritten"
  );
  assert.equal(
    rewriteOptionsHtml(`<script src="/options/index.js?v=1"></script>`),
    `<script src="/action/index.js?v=1"></script>`,
    "a query string after the asset path still rewrites"
  );
  assert.equal(rewriteOptionsHtml(""), "", "empty html stays empty");
  assert.equal(rewriteOptionsHtml(rewriteOptionsHtml(html)), rewriteOptionsHtml(html), "rewriting is idempotent");
}

// -- sameModuleSet --------------------------
{
  assert.equal(sameModuleSet(["a", "b"], ["b", "a"]), true, "order does not matter");
  assert.equal(sameModuleSet(["a", "b"], ["a"]), false, "a missing module means the entries differ");
  assert.equal(sameModuleSet(["a", "b"], ["a", "c"]), false, "a different module means the entries differ");
  assert.equal(sameModuleSet([], []), false, "an empty entry is never treated as a duplicate");
}
console.log("dedupe popup bundle selfcheck passed");
