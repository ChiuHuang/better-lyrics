const ACTION_ENTRY = "action/index";
const OPTIONS_ENTRY = "options/index";

/** @param {string} html */
export function rewriteOptionsHtml(html) {
  return html.replace(/\/options\/index\.(js|css)(?=["'?])/g, "/action/index.$1");
}

/** @param {string[]} a @param {string[]} b */
export function sameModuleSet(a, b) {
  if (a.length === 0 || a.length !== b.length) return false;
  const set = new Set(a);
  return b.every(id => set.has(id));
}

// Both manifest fields name one HTML file, so extension-develop builds two entries from it. Their JS
// differs only in the entry chunk id, so equivalence is judged on the modules each entry bundles.
export const dedupePopupBundle = {
  apply(compiler) {
    const { Compilation, sources } = compiler.webpack;
    compiler.hooks.thisCompilation.tap("DedupePopupBundle", compilation => {
      compilation.hooks.processAssets.tap(
        { name: "DedupePopupBundle", stage: Compilation.PROCESS_ASSETS_STAGE_REPORT },
        () => {
          const moduleIds = name => {
            const chunk = compilation.namedChunks.get(name);
            return chunk ? compilation.chunkGraph.getChunkModules(chunk).map(module => module.identifier()) : [];
          };
          if (!sameModuleSet(moduleIds(ACTION_ENTRY), moduleIds(OPTIONS_ENTRY))) return;

          const actionCss = compilation.getAsset(`${ACTION_ENTRY}.css`);
          const optionsCss = compilation.getAsset(`${OPTIONS_ENTRY}.css`);
          if (Boolean(actionCss) !== Boolean(optionsCss)) return;
          if (actionCss && actionCss.source.source().toString() !== optionsCss.source.source().toString()) return;

          const html = compilation.getAsset(`${OPTIONS_ENTRY}.html`);
          if (!html || !compilation.getAsset(`${ACTION_ENTRY}.js`)) return;

          compilation.updateAsset(
            `${OPTIONS_ENTRY}.html`,
            new sources.RawSource(rewriteOptionsHtml(html.source.source().toString()))
          );
          for (const name of [".js", ".css", ".js.map", ".css.map"].map(ext => `${OPTIONS_ENTRY}${ext}`)) {
            if (compilation.getAsset(name)) compilation.deleteAsset(name);
          }
        }
      );
    });
  },
};
