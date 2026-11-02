// @vitest-environment jsdom
import { BIBLE_CSS_STYLESHEET_URL } from "@youversion/platform-core";
import { expect, it } from "vitest";

// jsdom has no matchMedia, which the passage module reads when it loads.
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
const { BIBLE_TOKENS } = await import("./scripture-passage");

it("copies every token bible.css declares on :root, :host, with the same default", async (context) => {
  // A CDN outage says nothing about drift, so it skips instead of failing.
  const css = await fetch(BIBLE_CSS_STYLESHEET_URL)
    .then((response) => (response.ok ? response.text() : null))
    .catch(() => null);
  if (css === null) return context.skip(`Could not fetch ${BIBLE_CSS_STYLESHEET_URL}`);

  const rule = /:root,\s*:host\s*\{([^}]*)\}/.exec(css);
  expect(rule, "bible.css no longer has a :root, :host rule").not.toBeNull();
  const live = Object.fromEntries(
    rule![1]
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const colon = declaration.indexOf(":");
        return [declaration.slice(0, colon).trim().replace(/^--yv-/, ""), declaration.slice(colon + 1).trim()];
      }),
  );
  expect(BIBLE_TOKENS).toEqual(live);
});
