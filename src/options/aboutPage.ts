import { t } from "@core/i18n";

const REPO_URL = "https://github.com/better-lyrics/better-lyrics";
const LINK_MARKER = "\u2063";

interface Link {
  href: string;
  text: string;
}

export function linkPlaceholders(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${LINK_MARKER}${i}${LINK_MARKER}`);
}

export function splitLinked(message: string): (string | number)[] {
  return message.split(LINK_MARKER).map((part, i) => (i % 2 === 0 ? part : Number(part)));
}

function fillLinked(el: HTMLElement, key: string, links: Link[]): void {
  el.replaceChildren(
    ...splitLinked(t(key, linkPlaceholders(links.length))).map(part => {
      if (typeof part === "string") return document.createTextNode(part);
      const link = links[part];
      const anchor = document.createElement("a");
      anchor.href = link.href;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = link.text;
      return anchor;
    })
  );
}

export function renderAboutLinks(root: ParentNode): void {
  const slots: Record<string, [string, Link[]]> = {
    openSource: ["options_about_openSourceBody", [{ href: REPO_URL, text: "GitHub" }]],
    discord: ["options_about_communityDiscord", [{ href: "https://discord.gg/UsHE3d5fWF", text: "Discord" }]],
    issue: [
      "options_about_communityIssue",
      [{ href: `${REPO_URL}/issues/new/choose`, text: t("options_about_fileIssue") }],
    ],
    madeBy: [
      "options_about_madeByBody",
      [
        { href: "https://boidu.dev", text: "Boidu" },
        { href: "https://adalie.me/", text: "Adalie" },
      ],
    ],
  };
  for (const [name, [key, links]] of Object.entries(slots)) {
    const el = root.querySelector<HTMLElement>(`[data-linked="${name}"]`);
    if (el) fillLinked(el, key, links);
  }
}
