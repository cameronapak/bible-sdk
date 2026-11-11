// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { FreeUseBibleApi, type ApiTranslationBookChapter } from "free-use-bible-api";
import { Effect } from "effect";
import * as youversion from "@youversion/platform-core";
import { helloaoProvider, createHelloAOProvider, createYouVersionProvider, listBibleVersions, resolveProvider, type BibleProvider } from "./providers";
import { aoLabProvider, createAOLabProvider } from "./providers/ao-lab";

vi.mock("@youversion/platform-core", async (importOriginal) => ({
  ...await importOriginal<typeof youversion>(), getVersions: vi.fn(), getPassageDisplay: vi.fn(),
}));

afterEach(async () => { vi.restoreAllMocks(); await Effect.runPromise(helloaoProvider.effects.clearCache); });

// Small chapter with distinct boundary verses and formatting, not a second renderer.
function chapter() {
  vi.spyOn(FreeUseBibleApi.prototype, "getTranslationBookChapter").mockResolvedValue({
    translation: { id: "test", name: "Test Bible", shortName: "TB", language: "heb", textDirection: "rtl", licenseNotice: "Required copyright notice", licenseUrl: "https://example.com/license" },
    book: { name: "John" },
    numberOfVerses: 4,
    chapter: { number: 3, content: [
      { type: "heading", content: ["First section"] },
      { type: "hebrew_subtitle", content: ["A psalm"] },
      { type: "verse", number: 1, content: ["Outside before"] },
      { type: "heading", content: ["Selected section"] },
      { type: "verse", number: 2, content: ["One and only", { noteId: 1 }, "Son", { text: "<script>alert(1)</script>", wordsOfJesus: true }] },
      { type: "line_break" },
      { type: "verse", number: 3, content: [{ text: "A poem", poem: 2 }, { noteId: 2 }, { text: "continues", poem: 2 }, { lineBreak: true }, "Last selected"] },
      { type: "heading", content: ["Outside heading"] },
      { type: "verse", number: 4, content: ["Outside after"] },
    ] },
  } as ApiTranslationBookChapter);
}

it("renders only the inclusive range, escaping text and preserving formatting, spacing, and attribution", async () => {
  chapter();
  expect(createHelloAOProvider).toBe(createAOLabProvider);
  expect(helloaoProvider).toBe(aoLabProvider);
  expect(resolveProvider({ provider: "helloao" })).toBe(aoLabProvider);
  const provider = resolveProvider({ provider: "ao-lab" });
  expect(provider.id).toBe("helloao");
  const display = await provider.getPassage("test", "JHN.3.2-3");
  const section = document.createElement("section");
  section.innerHTML = display.html;
  expect(section.textContent).toContain("One and only Son <script>alert(1)</script>");
  expect(section.querySelector("script")).toBeNull();
  expect([...section.querySelectorAll("sup")].map((n) => n.textContent)).toEqual(["2", "3"]);
  expect(section.querySelector("h3")?.textContent).toBe("Selected section");
  expect(section.textContent).not.toMatch(/Outside|A psalm/);
  expect(section.querySelector(".scripture-jesus")?.textContent).toBe("<script>alert(1)</script>");
  // A footnote does not split a poetry line, and prose after poetry starts its own line.
  expect(section.querySelector(".scripture-poetry")?.textContent).toBe("3 A poem continues");
  expect(section.querySelector(".scripture-poetry")?.nextSibling?.textContent).toBe("Last selected");
  expect(section.querySelectorAll(".scripture-break")).toHaveLength(1);
  expect(display.attribution).toBe("Required copyright notice · Source: AO Lab Free Use Bible API");
  const attribution = document.createElement("p");
  attribution.innerHTML = display.attributionHtml!;
  expect(attribution.textContent).toBe(display.attribution);
  expect(attribution.querySelector("a")?.href).toBe("https://bible.helloao.org/docs/");
  expect(display.direction).toBe("rtl");
  expect(display.version).toEqual({ id: "test", abbreviation: "TB", title: "Test Bible" });
});

it("supports single verses and whole chapters without including the next section", async () => {
  chapter();
  const single = await helloaoProvider.getPassage("test", "JHN.3.3");
  expect(single.html).toContain("Last selected");
  expect(single.html).not.toMatch(/Outside|Selected section|One and only/);
  const whole = await helloaoProvider.getPassage("test", "JHN.3");
  // Headings and Psalm titles keep their chapter order.
  expect(whole.html.indexOf("First section")).toBeLessThan(whole.html.indexOf("A psalm"));
  expect(whole.html).toContain("Outside before");
  expect(whole.html).toContain("Outside after");
});

it("includes final verses when chapter numbering has gaps", async () => {
  vi.spyOn(FreeUseBibleApi.prototype, "getTranslationBookChapter").mockResolvedValue({
    translation: { id: "test", name: "Test Bible", language: "eng", licenseUrl: "https://example.com/license" },
    book: { name: "John" },
    numberOfVerses: 2,
    chapter: { number: 3, content: [
      { type: "verse", number: 1, content: ["First verse"] },
      { type: "verse", number: 3, content: ["Final verse after a gap"] },
    ] },
  } as ApiTranslationBookChapter);
  const whole = await helloaoProvider.getPassage("test", "JHN.3");
  const section = document.createElement("section");
  section.innerHTML = whole.html;
  expect([...section.querySelectorAll("sup")].map((verse) => verse.textContent)).toEqual(["1", "3"]);
  const single = await helloaoProvider.getPassage("test", "JHN.3.3");
  expect(single.html).toContain("Final verse after a gap");
  expect(single.html).not.toContain("First verse");
  await expect(helloaoProvider.getPassage("test", "JHN.3.2")).rejects.toThrow("not available");
  await expect(helloaoProvider.getPassage("test", "JHN.3.4")).rejects.toThrow("not available");
});

it("rejects cross-chapter and unavailable ranges rather than silently truncating them", async () => {
  chapter();
  await expect(helloaoProvider.getPassage("test", "JHN.3.2-4.1")).rejects.toThrow("cross chapters");
  await expect(helloaoProvider.getPassage("test", "JHN.3.3-6")).rejects.toThrow("not available");
});

it("requires a public app key and a numeric version only for YouVersion", async () => {
  await expect(createYouVersionProvider({}).getPassage("3034", "JHN.3.16")).rejects.toThrow("public app key");
  await expect(createYouVersionProvider({ yvpPublicAppKey: "test" }).getPassage("BSB", "JHN.3.16")).rejects.toThrow("positive YouVersion");
});

it("credits YouVersion without replacing the translation's copyright notice", async () => {
  vi.mocked(youversion.getPassageDisplay).mockResolvedValue({
    html: "Bible text",
    version: { id: 3034, localized_abbreviation: "BSB", localized_title: "Berean Standard Bible" },
    attribution: { text: "Required translation copyright" },
  } as Awaited<ReturnType<typeof youversion.getPassageDisplay>>);
  const display = await createYouVersionProvider({ yvpPublicAppKey: "test" }).getPassage("3034", "JHN.3.16");
  expect(display.attribution).toBe("Required translation copyright · Source: YouVersion Platform");
  const attribution = document.createElement("p");
  attribution.innerHTML = display.attributionHtml!;
  expect(attribution.textContent).toBe(display.attribution);
  expect(attribution.querySelector("a")?.href).toBe("https://developers.youversion.com/");
});

it("escapes license labels and never creates executable license links", async () => {
  const response = {
    translation: { id: "test", name: '<img src=x onerror="alert(1)">', language: "eng", licenseUrl: "javascript:alert(1)" },
    book: { name: "John" },
    numberOfVerses: 1, chapter: { number: 1, content: [{ type: "verse", number: 1, content: ["Text"] }] },
  } as ApiTranslationBookChapter;
  vi.spyOn(FreeUseBibleApi.prototype, "getTranslationBookChapter").mockResolvedValue(response);
  const display = await helloaoProvider.getPassage("test", "JHN.1.1");
  const attribution = document.createElement("p");
  attribution.innerHTML = display.attributionHtml!;
  expect(attribution.querySelector("img")).toBeNull();
  expect(attribution.textContent).toContain(response.translation.name);
  expect([...attribution.querySelectorAll("a")].map((a) => a.href)).toEqual(["https://bible.helloao.org/docs/"]);
});

it("lists AO Lab IDs unchanged and normalizes language tags for filtering", async () => {
  vi.spyOn(FreeUseBibleApi.prototype, "getAvailableTranslations").mockResolvedValue({ translations: [
    { id: "ENGWEBP", shortName: "WEB", name: "World English Bible", language: "eng", languageEnglishName: "English" },
    { id: "spa_rv", shortName: "RV", name: "Reina Valera", language: "spa", languageEnglishName: "Spanish" },
  ] } as Awaited<ReturnType<FreeUseBibleApi["getAvailableTranslations"]>>);
  expect(await listBibleVersions()).toEqual([
    { id: "ENGWEBP", abbreviation: "WEB", title: "World English Bible", language: "en", languageName: "English" },
    { id: "spa_rv", abbreviation: "RV", title: "Reina Valera", language: "es", languageName: "Spanish" },
  ]);
});

it("includes every YouVersion catalog page with string IDs and rejects pagination cycles", async () => {
  const page = (id: number, next: string | null) => ({
    data: [{ id, localized_abbreviation: `V${id}`, localized_title: `Version ${id}`, language_tag: "en" }], next_page_token: next,
  }) as Awaited<ReturnType<typeof youversion.getVersions>>;
  vi.mocked(youversion.getVersions).mockResolvedValueOnce(page(3034, "page-two")).mockResolvedValueOnce(page(111, null));
  expect((await listBibleVersions({ provider: createYouVersionProvider({ yvpPublicAppKey: "test" }) })).map((v) => v.id)).toEqual(["3034", "111"]);
  vi.mocked(youversion.getVersions).mockResolvedValue(page(3034, "repeated"));
  await expect(listBibleVersions({ provider: createYouVersionProvider({ yvpPublicAppKey: "test" }) })).rejects.toMatchObject({ code: "invalid_response" });
});

it("keeps catalogs scoped to provider identity and lets failed loads retry", async () => {
  let attempts = 0;
  const first: BibleProvider = { id: "custom", defaultVersionId: "a", getPassage: async () => { throw new Error("Unused"); },
    async listVersions() { if (++attempts === 1) throw new Error("Offline"); return [{ id: "a", title: "First", abbreviation: "F" }]; },
  };
  const second: BibleProvider = { ...first, async listVersions() { return [{ id: "b", title: "Second", abbreviation: "S" }]; } };
  await expect(listBibleVersions({ provider: first })).rejects.toMatchObject({ code: "network", cause: new Error("Offline") });
  expect((await listBibleVersions({ provider: first }))[0].id).toBe("a");
  expect((await listBibleVersions({ provider: second }))[0].id).toBe("b");
});
