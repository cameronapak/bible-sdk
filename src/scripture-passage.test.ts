// @vitest-environment jsdom
import { BIBLE_CSS_STYLESHEET_URL } from "@youversion/platform-core";
import { afterEach, expect, it, vi } from "vitest";
import { FreeUseBibleApi, type ApiTranslationBookChapter } from "free-use-bible-api";
import type { BibleProvider } from "./providers";

// jsdom has no matchMedia, which the passage module reads when it loads.
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
const { BIBLE_TOKENS, defineScripturePassage } = await import("./scripture-passage");
defineScripturePassage();

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  defineScripturePassage({ provider: "helloao", bibleVersionId: undefined, yvpPublicAppKey: undefined, yvpBibleVersionId: undefined });
});

// Keep animation/font timing out of these component contract checks.
Object.defineProperty(document, "fonts", { value: { ready: Promise.resolve() } });
HTMLElement.prototype.animate = () => ({ finished: Promise.resolve() }) as unknown as Animation;

function nextEvent(element: HTMLElement, name = "scripture-load"): Promise<CustomEvent> {
  return new Promise((resolve) => element.addEventListener(name, (event) => resolve(event as CustomEvent), { once: true }));
}

it("loads HelloAO/BSB without a key and emits provider-neutral metadata", async () => {
  vi.spyOn(FreeUseBibleApi.prototype, "getTranslationBookChapter").mockResolvedValue({
    translation: { id: "BSB", shortName: "BSB", name: "Berean Standard Bible", language: "eng", textDirection: "ltr", licenseUrl: "https://berean.bible/" },
    book: { name: "John" },
    numberOfVerses: 36,
    chapter: { number: 3, content: [{ type: "verse", number: 16, content: ["For God so loved the world"] }] },
  } as ApiTranslationBookChapter);
  const passage = document.createElement("si-passage");
  passage.setAttribute("passage-id", "JHN.3.16");
  // A leftover key must not implicitly opt the page into YouVersion.
  passage.setAttribute("yvp-public-app-key", "old-key");
  const loaded = nextEvent(passage);
  document.body.append(passage);
  expect((await loaded).detail).toMatchObject({ provider: "helloao", bibleVersionId: "BSB", passageId: "JHN.3.16" });
  expect(passage.shadowRoot?.querySelector('[part="text"]')?.textContent).toContain("For God so loved the world");
  const attribution = passage.shadowRoot!.querySelector('[part="attribution"]')!;
  expect(attribution.textContent).toBe("Berean Standard Bible. · Source: HelloAO Free Use Bible API");
  expect([...attribution.querySelectorAll("a")].map((a) => [a.textContent, a.href])).toEqual([
    ["Berean Standard Bible", "https://berean.bible/"],
    ["HelloAO Free Use Bible API", "https://bible.helloao.org/docs/"],
  ]);
  expect(passage.shadowRoot?.querySelector("link")).toBeNull();
});

it("does not resurrect cleared Scripture when display attributes change", async () => {
  const passage = document.createElement("si-passage");
  passage.bibleProvider = { id: "fixture", defaultVersionId: "fixture", async getPassage() { return { html: "Previous text", version: { id: "fixture", title: "Fixture", abbreviation: "F" }, attribution: "Owner" }; } };
  passage.setAttribute("passage-id", "JHN.3.16");
  const loaded = nextEvent(passage);
  document.body.append(passage);
  await loaded;
  passage.removeAttribute("passage-id");
  await new Promise((resolve) => setTimeout(resolve));
  expect(passage.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain("Set passage-id");
  passage.setAttribute("reference", "quote");
  passage.setAttribute("dir", "rtl");
  expect(passage.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain("Set passage-id");
  expect(passage.shadowRoot?.textContent).not.toContain("Previous text");
});

it("switches same-ID providers without reusing another provider's cached passage or version default", async () => {
  const makeProvider = (id: string): BibleProvider => ({
    id: "custom", defaultVersionId: `${id}-default`,
    async getPassage(versionId) {
      return { html: `<p>${id} ${versionId}</p>`, version: { id: versionId, abbreviation: id, title: id }, attribution: `${id} license` };
    },
  });
  const first = makeProvider("first");
  const second = makeProvider("second");
  defineScripturePassage({ provider: first, bibleVersionId: "page-version" });
  const passage = document.createElement("si-passage");
  passage.setAttribute("passage-id", "ROM.8.28");
  let loaded = nextEvent(passage);
  document.body.append(passage);
  await loaded;
  expect(passage.shadowRoot?.querySelector('[part="text"]')?.textContent).toBe("first page-version");
  loaded = nextEvent(passage);
  passage.bibleProvider = second;
  expect((await loaded).detail).toMatchObject({ provider: "custom", bibleVersionId: "second-default" });
  expect(passage.shadowRoot?.querySelector('[part="text"]')?.textContent).toBe("second second-default");
});

it("prefers generic page versions over legacy defaults, while component attributes override page settings", async () => {
  const provider: BibleProvider = {
    id: "youversion", defaultVersionId: "3034",
    async getPassage(id) { return { html: id, version: { id, abbreviation: id, title: id }, attribution: "License" }; },
  };
  defineScripturePassage({ provider, bibleVersionId: "111", yvpBibleVersionId: 3034 });
  const passage = document.createElement("si-passage");
  passage.setAttribute("passage-id", "JHN.3.16");
  let loaded = nextEvent(passage);
  document.body.append(passage);
  expect((await loaded).detail.bibleVersionId).toBe("111");
  loaded = nextEvent(passage);
  passage.setAttribute("yvp-bible-version-id", "12");
  expect((await loaded).detail.bibleVersionId).toBe("12");
  loaded = nextEvent(passage);
  passage.setAttribute("bible-version-id", "59");
  expect((await loaded).detail.bibleVersionId).toBe("59");
});

it("discards late results after a provider change and retries rejected requests", async () => {
  let finish!: (value: Awaited<ReturnType<BibleProvider["getPassage"]>>) => void;
  const old: BibleProvider = { id: "old", defaultVersionId: "old", getPassage: () => new Promise((resolve) => { finish = resolve; }) };
  let attempts = 0;
  const current: BibleProvider = {
    id: "current", defaultVersionId: "current",
    async getPassage() {
      if (++attempts === 1) throw new Error("Temporary outage");
      return { html: "Current text", version: { id: "current", abbreviation: "C", title: "Current" }, attribution: "Current license" };
    },
  };
  const passage = document.createElement("si-passage");
  passage.bibleProvider = old;
  passage.setAttribute("passage-id", "PSA.23.1");
  document.body.append(passage);
  await Promise.resolve();
  const failed = nextEvent(passage, "scripture-error");
  passage.bibleProvider = current;
  await failed;
  expect(passage.shadowRoot?.querySelector('[role="alert"]')).not.toBeNull();
  const loaded = nextEvent(passage);
  passage.bibleProvider = current;
  await loaded;
  finish({ html: "Stale text", version: { id: "old", abbreviation: "O", title: "Old" }, attribution: "Old license" });
  await new Promise((resolve) => setTimeout(resolve));
  expect(passage.shadowRoot?.querySelector('[part="text"]')?.textContent).toBe("Current text");
});

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
