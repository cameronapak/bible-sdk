import { afterEach, expect, vi } from "vitest";
import { it } from "@effect/vitest";
import { Effect, Fiber, Layer, Schema, Tracer } from "effect";
import { TestClock } from "effect/testing";
import { FreeUseBibleApi, type ApiTranslationBookChapter } from "free-use-bible-api";
import * as youversion from "@youversion/platform-core";
import { BibleSource, RequestPolicy, ScriptureError, createScriptureClient, scripture, type BibleDataProvider } from "./data-effect";
import { createScriptureClient as createAsyncClient, ScriptureError as AsyncScriptureError } from "./data";
import { createYouVersionProvider, type BibleProvider } from "./providers";
import { createFetchBibleProvider } from "./providers/fetch-bible";

vi.mock("@youversion/platform-core", async (original) => ({
  ...await original<typeof youversion>(), getPassage: vi.fn(), getVersion: vi.fn(), getVerses: vi.fn(), getBooks: vi.fn(), getChapters: vi.fn(),
}));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.effect("returns clean default-provider text and actionable RTL guidance without a DOM", () => Effect.gen(function*() {
  expect(typeof document).toBe("undefined");
  vi.spyOn(FreeUseBibleApi.prototype, "getTranslationBookChapter").mockResolvedValue({
    translation: { id: "BSB", name: "Test Bible", shortName: "TB", language: "heb", textDirection: "rtl", licenseNotice: "Copyright notice", licenseUrl: "https://example.com/license" },
    book: { name: "John" },
    chapter: { number: 3, content: [
      { type: "hebrew_subtitle", content: ["Scriptural title"] },
      { type: "verse", number: 1, content: ["Outside before"] },
      { type: "heading", content: ["Editorial heading"] },
      { type: "verse", number: 2, content: ["Word", { noteId: 1 }, "next", { lineBreak: true }, { text: "Poetry", poem: 1 }, "Selah", { text: "Second line", poem: 2 }, { noteId: 3 }, "After poem. ", "Cl", { text: "ose" }, "d."] },
      { type: "line_break" },
      { type: "verse", number: 3, content: ["Last selected", { noteId: 2 }, "."] },
      { type: "verse", number: 4, content: ["Outside after"] },
    ] },
  } as ApiTranslationBookChapter);
  const client = createScriptureClient();
  const passage = yield* client.getPassage({ passageId: "JHN.3.2-3" });
  expect(passage.text).toBe("Word next\nPoetry\nSelah\nSecond line\nAfter poem. Closed.\n\nLast selected.");
  expect(passage).toMatchObject({ provider: "helloao", reference: "John 3:2-3", version: { id: "BSB", sourceLanguage: "heb" }, numbering: "unknown" });
  expect(passage.attribution.text).toBe("Copyright notice · Source: AO Lab Free Use Bible API");
  expect(passage.licenses).toEqual([{ url: "https://example.com/license" }]);
  expect(passage.display).toMatchObject({ format: "text", direction: "rtl", whitespace: "pre-wrap", attributionPlacement: "after-passage" });
  expect(passage.instructions).toContainEqual(expect.objectContaining({ code: "display-attribution", level: "required", appliesTo: "all" }));
  expect((yield* client.getPassage({ passageId: "JHN.3.1" })).text).toBe("Scriptural title\n\nOutside before");
  expect(yield* Effect.flip(client.getPassage({ passageId: "JHN.3.4-5" }))).toMatchObject({ code: "unavailable" });
}));

it.effect("keeps poetry on one line across footnotes without merging separate lines at the same indent", () => Effect.gen(function*() {
  vi.spyOn(FreeUseBibleApi.prototype, "getTranslationBookChapter").mockResolvedValue({
    translation: { id: "BSB", name: "Berean Standard Bible", language: "eng", licenseUrl: "https://berean.bible/" },
    book: { name: "Psalms" },
    chapter: { number: 119, content: [{ type: "verse", number: 1, content: [
      { text: "Blessed", poem: 1 }, { noteId: 258 },
      { text: "are those whose way is blameless,", poem: 1 },
      { text: "who walk in the Law of the LORD.", poem: 2 },
      { text: "A separate line at the same indent.", poem: 2 },
    ] }] },
  } as ApiTranslationBookChapter);
  const passage = yield* createScriptureClient().getPassage({ passageId: "PSA.119.1" });
  expect(passage.text).toBe("Blessed are those whose way is blameless,\nwho walk in the Law of the LORD.\nA separate line at the same indent.");
}));

it.effect("discovers AO Lab and YouVersion books and chapters through the same public API", () => Effect.gen(function*() {
  vi.spyOn(FreeUseBibleApi.prototype, "getTranslationBooks").mockResolvedValue({ books: [
    { id: "JHN", name: "John", firstChapterNumber: 2, lastChapterNumber: 3 },
  ] } as Awaited<ReturnType<FreeUseBibleApi["getTranslationBooks"]>>);
  const helloao = createScriptureClient();
  expect(yield* helloao.listBooks()).toEqual([{ id: "JHN", title: "John" }]);
  expect(yield* helloao.listChapters({ bookId: "JHN" })).toEqual([{ number: 2, passageId: "JHN.2" }, { number: 3, passageId: "JHN.3" }]);
  expect(yield* Effect.flip(helloao.listChapters({ bookId: "GEN" }))).toMatchObject({ code: "unavailable" });
  vi.mocked(youversion.getBooks).mockResolvedValue({ data: [{ id: "JHN", title: "John" }] } as Awaited<ReturnType<typeof youversion.getBooks>>);
  vi.mocked(youversion.getChapters).mockResolvedValue({ data: [{ id: "2", passage_id: "JHN.2" }] } as Awaited<ReturnType<typeof youversion.getChapters>>);
  const yv = createScriptureClient({ provider: createYouVersionProvider({ yvpPublicAppKey: "test" }) });
  expect(yield* yv.listBooks()).toEqual([{ id: "JHN", title: "John" }]);
  expect(yield* yv.listChapters({ bookId: "JHN" })).toEqual([{ number: 2, passageId: "JHN.2" }]);
}));

it("classifies source HTTP failures without exposing upstream diagnostics in the message", async () => {
  for (const [status, code] of [[401, "authentication"], [404, "unavailable"], [429, "rate_limit"], [503, "network"]] as const) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Upstream diagnostics", { status })));
    const error = await Effect.runPromise(Effect.flip(createScriptureClient().listBooks()));
    expect(error).toMatchObject({ code, message: `Bible provider request failed (${code}).`, cause: expect.any(Error) });
  }
});

// Real upstream resource formats, deliberately tiny and asymmetric. The client library,
// collection filtering, passage extraction, and adapter all run, not mocked book getters.
function fetchResources() {
  const restrictions = { forbid_limitless: false, forbid_commercial: false, forbid_derivatives: false, forbid_attributionless: false, forbid_other: false };
  const resource = (licenses: string[]) => ({
    name: { local: "Test Bible", local_abbrev: "TB", english: "Test Bible", english_abbrev: "TB" },
    year: 2020, books_ot: ["psa"], books_nt: ["3jn"], direction: "rtl", tags: [],
    copyright: { attribution: "Required owner credit", attribution_url: "https://example.com/owner", licenses: licenses.map((license) => ({ license, url: `https://example.com/${license}` })) },
  });
  const manifest = {
    bibles: { eng_bsb: resource(["nc", "public"]), eng_nc: resource(["nc"]) }, glosses: {}, notes: {},
    languages: { eng: { local: "English", english: "English", pop: 1, direction: "ltr" } },
    language2to3: { en: "eng" }, languages_most_spoken: ["eng"], books_ordered: ["psa", "3jn"], book_names_english: { psa: "Psalms", "3jn": "3 John" },
    licenses: { public: { name: "Public domain", restrictions }, nc: { name: "Noncommercial", restrictions: { ...restrictions, forbid_commercial: true } } },
  };
  const name = { normal: "Third John", long: "Third John", abbrev: "3Jn" };
  const txt = { book: "3jn", name, contents: [[], [[], ["Before. "], [{ type: "heading", level: 1, contents: "Editorial title" }, "Selected ", { type: "note", contents: "Footnote" }, "words.\n\n"], [], ["After."]]] };
  const html = { book: "3jn", name, contents: [[], [["", "", ""], ["", "<p>Before.</p>", ""], ["", '<h4 class="fb-s1">Editorial title</h4><p onclick="bad()"><sup data-v="1:2">2</sup>Selected <span class="fb-note"><span>Footnote</span></span>words.<script>bad()</script><a href="javascript:bad()">link</a>', "</p>"], ["", "", ""], ["", "<p>After.</p>", ""]]] };
  const counts = new Map<string, number>();
  let failBook = false;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    counts.set(url, (counts.get(url) ?? 0) + 1);
    if (url.endsWith("manifest.json")) return Response.json(manifest);
    if (url.endsWith("extra.json")) return Response.json({ book_names: { "3jn": name, psa: { normal: "Psalms", long: "Psalms", abbrev: "Ps" } }, chapter_headings: {}, sections: {}, wj_markup: false });
    if (url.endsWith("/txt/jer.json")) return Response.json({ book: "jer", name, contents: Array.from({ length: 53 }, (_, chapter) => chapter >= 24 ? [[], ...Array.from({ length: 34 }, () => ["Verse."])] : []) });
    if (url.endsWith("/txt/psa.json")) return Response.json({ book: "psa", name, contents: [[], [[], [{ type: "heading", level: 1, contents: "Editorial" }, { type: "heading", level: 3, contents: "A Psalm of David & Asaph." }, "First verse. "], ["Second verse."]]] });
    if (url.endsWith("/html/psa.json")) return Response.json({ book: "psa", name, contents: [[], [["", "", ""], ["", '<h3 class="fb-s1">Editorial</h3><p class="fb-d">A Psalm of <em>David &amp; Asaph</em>.<span class="fb-note">Note</span></p><p><sup>1</sup>First verse.</p>', ""], ["", "<p>Second verse.</p>", ""]]] });
    if (url.endsWith("/txt/3jn.json")) {
      if (failBook) { failBook = false; return new Response("Unavailable", { status: 503 }); }
      return Response.json(txt);
    }
    if (url.endsWith("/html/3jn.json")) return Response.json(html);
    throw new Error(`Unexpected URL: ${url}`);
  }));
  return { counts, txt, manifest, failNextBook: () => { failBook = true; } };
}

it.effect("discovers fetch.bible versions/books/chapters and returns source-scoped text, licenses, and display requirements", () => Effect.gen(function*() {
  fetchResources();
  const client = createScriptureClient({ provider: createFetchBibleProvider({ usage: { commercial: true } }) });
  expect((yield* client.listVersions()).map((version) => version.id)).toEqual(["eng_bsb"]);
  expect((yield* client.getPassage({ passageId: "3JN.1.2" })).reference).toBe("Third John 1:2");
  expect(yield* client.listBooks()).toEqual([{ id: "PSA", title: "Psalms" }, { id: "3JN", title: "Third John" }]);
  expect(yield* client.listChapters({ bookId: "3JN" })).toEqual([{ number: 1, passageId: "3JN.1" }]);
  const passage = yield* client.getPassage({ passageId: "3JN.1.2-3" });
  expect(passage.text).toBe("Selected words.");
  expect(passage).toMatchObject({ provider: "fetch-bible", numbering: "kjv", reference: "Third John 1:2-3", source: { url: "https://v1.fetch.bible/bibles/eng_bsb/txt/3jn.json", versionId: "eng_bsb" } });
  expect(passage.attribution.text).toBe("[Public domain - Required owner credit] · Source: fetch.bible");
  expect(passage.licenses).toEqual([expect.objectContaining({ name: "Public domain", url: "https://example.com/public", restrictions: expect.objectContaining({ forbid_commercial: false }) })]);
  expect(passage.display.direction).toBe("rtl");
  expect(passage.display.nativeHtml?.containerAttributes.class).toContain("fetch-bible");
  expect(passage.display.nativeHtml?.stylesheets[0].href).toContain("@gracious.tech/fetch-client@2.6.0");
  expect(passage.instructions).toContainEqual(expect.objectContaining({ code: "fetch-bible-native-html", level: "required", appliesTo: "html" }));
  expect((yield* client.getPassage({ passageId: "3JN.1" })).text).toBe("Before. Selected words.\n\nAfter.");
  expect((yield* client.getPassage({ passageId: "PSA.1" })).text).toBe("A Psalm of David & Asaph.\n\nFirst verse. Second verse.");
  expect((yield* client.getPassage({ passageId: "PSA.1.1" })).text).toBe("A Psalm of David & Asaph.\n\nFirst verse.");
  expect((yield* client.getPassage({ passageId: "PSA.1.2" })).text).toBe("Second verse.");
}));

it("offers async discovery, passages, cache clearing, and original typed errors without running Effects", async () => {
  fetchResources();
  const client = createAsyncClient({ provider: createFetchBibleProvider({ usage: { commercial: true } }) });
  expect(client.provider).toBe("fetch-bible");
  expect((await client.listVersions()).map((version) => version.id)).toEqual(["eng_bsb"]);
  expect(await client.listBooks()).toEqual([{ id: "PSA", title: "Psalms" }, { id: "3JN", title: "Third John" }]);
  expect(await client.listChapters({ bookId: "3JN" })).toEqual([{ number: 1, passageId: "3JN.1" }]);
  const passage = await client.getPassage({ passageId: "3JN.1.2-3" });
  expect(passage.text).toBe("Selected words.");
  expect(passage.attribution.text).toBe("[Public domain - Required owner credit] · Source: fetch.bible");
  expect(passage.instructions).toContainEqual(expect.objectContaining({ code: "display-attribution", level: "required" }));
  const native = createScriptureClient({ provider: createFetchBibleProvider({ usage: { commercial: true } }) });
  expect(passage).toEqual(await Effect.runPromise(native.getPassage({ passageId: "3JN.1.2-3" })));
  await client.clearCache();
  expect((await client.getPassage({ passageId: "3JN.1.3" })).text).toBe("");
  await expect(client.getPassage({ passageId: "3JN.1.5" })).rejects.toBeInstanceOf(AsyncScriptureError);
  await expect(client.getPassage({ passageId: "3JN.1.5" })).rejects.toMatchObject({ code: "unavailable" });
  await expect(client.getPassage({ passageId: "3JN.1.3-2" })).rejects.toMatchObject({ code: "invalid_reference" });
});

it.effect("preserves a valid empty verse slot but rejects nonexistent chapters, books, versions, and endpoints", () => Effect.gen(function*() {
  fetchResources();
  const client = createScriptureClient({ provider: createFetchBibleProvider({ usage: { commercial: true } }) });
  expect((yield* client.getPassage({ passageId: "3JN.1.3" })).text).toBe("");
  for (const passageId of ["3JN.1.5", "3JN.1.2-5", "3JN.2", "JHN.1.1"]) {
    expect(yield* Effect.flip(client.getPassage({ passageId }))).toMatchObject({ code: "unavailable" });
  }
  expect(yield* Effect.flip(client.getPassage({ versionId: "missing", passageId: "3JN.1.2" }))).toMatchObject({ code: "unavailable" });
  expect(yield* Effect.flip(client.getPassage({ versionId: "__proto__", passageId: "3JN.1.2" }))).toMatchObject({ code: "unavailable" });
}));

it.effect("does not let direct IDs or mutated configuration bypass usage filtering", () => Effect.gen(function*() {
  fetchResources();
  const usage = { commercial: true };
  const client = createScriptureClient({ provider: createFetchBibleProvider({ usage }) });
  usage.commercial = false;
  expect(yield* Effect.flip(client.getPassage({ versionId: "eng_nc", passageId: "3JN.1.2" }))).toMatchObject({ code: "unavailable" });
  const noncommercial = createScriptureClient({ provider: createFetchBibleProvider({ usage: { commercial: false } }) });
  expect((yield* noncommercial.listVersions()).map((version) => version.id).sort()).toEqual(["eng_bsb", "eng_nc"]);
  expect((yield* noncommercial.getPassage({ versionId: "eng_nc", passageId: "3JN.1.2" })).licenses[0].name).toBe("Noncommercial");
}));

it("sanitizes native fetch.bible HTML, omits notes and inline attribution, and retains required display resources", async () => {
  fetchResources();
  const provider = createFetchBibleProvider({ usage: { commercial: true } });
  const display = await provider.getPassage("eng_bsb", "3JN.1.2");
  expect(display.html).toContain('<sup data-v="1:2">2</sup>');
  expect(display.html).toContain('class="fb-s1"');
  expect(display.html).not.toMatch(/onclick|javascript:|script|Footnote|Required owner credit|Before|After/);
  expect(display.attribution).toContain("Required owner credit");
  expect(display.containerAttributes?.class).toContain("fetch-bible");
  expect(display.stylesheets).toHaveLength(1);
});

it.live("deduplicates book downloads, retries failures, and clears caches", () => Effect.gen(function*() {
  const resources = fetchResources();
  resources.failNextBook();
  const client = createScriptureClient({ provider: createFetchBibleProvider({ usage: { commercial: true } }) });
  expect((yield* Effect.all([client.getPassage({ passageId: "3JN.1.2" }), client.getPassage({ passageId: "3JN.1.4" })], { concurrency: 2 })).map((result) => result.text)).toEqual(["Selected words.", "After."]);
  const url = "https://v1.fetch.bible/bibles/eng_bsb/txt/3jn.json";
  expect(resources.counts.get(url)).toBe(2); // One failed download, one shared success.
  yield* client.clearCache();
  expect((yield* client.getPassage({ passageId: "3JN.1.4" })).text).toBe("After.");
  expect(resources.counts.get(url)).toBe(3);
}));

it.effect("rejects malformed, descending, unsafe, and cross-chapter references before requesting data", () => Effect.gen(function*() {
  const client = createScriptureClient();
  for (const passageId of ["JHN.3.0", "JHN.3.3-2", "JHN.3.2-4.1", "JHN.3.9007199254740992", "jhn.3.1", "../JHN.3.1"]) {
    expect(yield* Effect.flip(client.getPassage({ passageId }))).toMatchObject({ code: "invalid_reference" });
  }
}));

it.effect("identifies documented trimming only for the selected edition and overlapping ranges", () => Effect.gen(function*() {
  const resources = fetchResources();
  const edition = { ...resources.manifest.bibles.eng_bsb, books_ot: ["jer"] };
  Object.assign(resources.manifest.bibles, { eng_bst: edition, eng_bstj: edition });
  const client = createScriptureClient({ provider: createFetchBibleProvider({ usage: { commercial: true } }) });
  for (const [passageId, overlaps] of [["JER.24.1", false], ["JER.25.13", false], ["JER.25.14", true], ["JER.25.13-14", true], ["JER.25", true], ["JER.26.1", true], ["JER.52.34", true]] as const) {
    expect((yield* client.getPassage({ versionId: "eng_bst", passageId })).sourceLimitations).toEqual([
      { kind: "source-trimming", startPassageId: "JER.25.14", endPassageId: "JER.52.34", appliesToRequest: overlaps },
    ]);
  }
  expect((yield* client.getPassage({ versionId: "eng_bstj", passageId: "JER.25.14" })).sourceLimitations?.map((limit) => limit.appliesToRequest)).toEqual([false, true]);
  expect((yield* client.getPassage({ passageId: "3JN.1.2" })).sourceLimitations).toEqual([]);
}));

it.effect("recovers from malformed fetch.bible payloads without manual cache clearing", () => Effect.gen(function*() {
  const resources = fetchResources();
  const valid = resources.txt.contents;
  resources.txt.contents = null as unknown as typeof valid;
  const client = createScriptureClient({ provider: createFetchBibleProvider({ usage: { commercial: true } }) });
  expect(yield* Effect.flip(client.getPassage({ passageId: "3JN.1.2" }))).toMatchObject({ code: "invalid_response" });
  resources.txt.contents = valid;
  expect((yield* client.getPassage({ passageId: "3JN.1.2" })).text).toBe("Selected words.");
  expect(resources.counts.get("https://v1.fetch.bible/bibles/eng_bsb/txt/3jn.json")).toBe(2);
}));

it.effect("evicts source payloads rather than retaining them in upstream transport caches", () => Effect.gen(function*() {
  const transport = vi.fn(async () => Response.json({ books: [{ id: "JHN", name: "John", firstChapterNumber: 1, lastChapterNumber: 21 }] }));
  vi.stubGlobal("fetch", transport);
  const helloao = createScriptureClient();
  for (let i = 0; i < 260; i++) yield* helloao.listBooks({ versionId: `version-${i}` });
  yield* helloao.listBooks({ versionId: "version-0" });
  expect(transport).toHaveBeenCalledTimes(261);
  const resources = fetchResources();
  Object.assign(resources.manifest.bibles, Object.fromEntries(Array.from({ length: 260 }, (_, i) => [`eng_test${i}`, resources.manifest.bibles.eng_bsb])));
  const client = createScriptureClient({ provider: createFetchBibleProvider({ usage: { commercial: true } }) });
  for (let i = 0; i < 260; i++) yield* client.getPassage({ versionId: `eng_test${i}`, passageId: "3JN.1.2" });
  yield* client.getPassage({ versionId: "eng_test0", passageId: "3JN.1.2" });
  expect(resources.counts.get("https://v1.fetch.bible/bibles/eng_test0/txt/3jn.json")).toBe(2);
}));

it.live("does not retry YouVersion attribution or schema failures through its actual display SDK", () => Effect.gen(function*() {
  let malformed = false;
  const transport = vi.fn(async (input: string | URL | Request) => Response.json(String(input).includes("/passages/")
    ? malformed ? { content: 42 } : { id: "JHN.3.16", reference: "John 3:16", content: "<p>Words.</p>" }
    : { id: 3034, title: "Test", abbreviation: "T", localized_title: "Test", localized_abbreviation: "T", language_tag: "en", books: ["JHN"], youversion_deep_link: "https://bible.com/bible/3034" }));
  vi.stubGlobal("fetch", transport);
  const provider = createYouVersionProvider({ yvpPublicAppKey: "test-public-key" });
  expect(yield* Effect.flip(provider.effects.getPassageDisplay("3034", "JHN.3.16"))).toMatchObject({ code: "unavailable", retryable: false });
  expect(transport).toHaveBeenCalledTimes(2);
  malformed = true;
  expect(yield* Effect.flip(provider.effects.getPassageDisplay("3034", "JHN.3.16"))).toMatchObject({ code: "invalid_response", retryable: false });
  expect(transport).toHaveBeenCalledTimes(4);
}));

it("keeps display-only custom providers compatible and reports unsupported data operations", async () => {
  const provider: BibleProvider = { id: "custom", defaultVersionId: "custom-version", async getPassage() { return { html: "Safe text", version: { id: "custom-version", title: "Custom", abbreviation: "C" }, attribution: "Owner" }; } };
  expect((await provider.getPassage("custom-version", "JHN.3.16")).html).toBe("Safe text");
  const client = createScriptureClient({ provider });
  expect(await Effect.runPromise(Effect.flip(client.listBooks()))).toMatchObject({ code: "unsupported" });
  expect(await Effect.runPromise(Effect.flip(client.getPassage({ passageId: "JHN.3.16" })))).toMatchObject({ code: "unsupported" });
});

it.effect("uses YouVersion's text API and fresh attribution, never HTML scraping or cached copyright", () => Effect.gen(function*() {
  vi.mocked(youversion.getVerses).mockResolvedValue({ data: [{ id: "16" }, { id: "17" }] } as Awaited<ReturnType<typeof youversion.getVerses>>);
  vi.mocked(youversion.getPassage).mockImplementation(async (_client, _version, _passage, format, headings, notes) => ({
    id: "JHN.3.16-17", reference: "John 3:16-17",
    content: format === "text" && headings === false && notes === false ? "Exact words.\nNext line." : "<h1>Editorial heading</h1><p>Wrong representation</p>",
  }));
  const version = { id: 3034, localized_title: "Berean Standard Bible", localized_abbreviation: "BSB", language_tag: "en", copyright: "First copyright" } as Awaited<ReturnType<typeof youversion.getVersion>>;
  vi.mocked(youversion.getVersion).mockResolvedValueOnce(version).mockResolvedValueOnce({ ...version, copyright: "Updated copyright" });
  const client = createScriptureClient({ provider: createYouVersionProvider({ yvpPublicAppKey: "test-public-key", yvpApiHost: "api.example.test" }) });
  const first = yield* client.getPassage({ passageId: "JHN.3.16-17" });
  expect(first.text).toBe("Exact words.\nNext line.");
  expect(first.source.url).toBe("https://api.example.test/v1");
  expect(first.attribution.text).toContain("First copyright");
  expect(first.display.nativeHtml?.stylesheets.map((sheet) => sheet.kind)).toEqual(["bible", "font"]);
  expect(first.instructions).toContainEqual(expect.objectContaining({ code: "youversion-commercial-use", level: "required" }));
  expect(first.instructions).toContainEqual(expect.objectContaining({ code: "youversion-ai-use", level: "required" }));
  expect((yield* client.getPassage({ passageId: "JHN.3.16-17" })).attribution.text).toContain("Updated copyright");
  for (const malformed of [{ copyright: 42 }, { copyright: "", promotional_content: 42 }, { publisher_url: 42 }]) {
    vi.mocked(youversion.getVersion).mockResolvedValue({ ...version, ...malformed } as unknown as typeof version);
    expect(yield* Effect.flip(client.getPassage({ passageId: "JHN.3.16" }))).toMatchObject({ code: "invalid_response", retryable: false });
  }
  vi.mocked(youversion.getVersion).mockResolvedValue({ ...version, copyright: null, promotional_content: "Fallback attribution" });
  expect((yield* client.getPassage({ passageId: "JHN.3.16" })).attribution.text).toContain("Fallback attribution");
  vi.mocked(youversion.getVersion).mockResolvedValue({ ...version, copyright: "", promotional_content: null });
  expect(yield* Effect.flip(client.getPassage({ passageId: "JHN.3.16" }))).toMatchObject({ code: "unavailable" });
  expect(yield* Effect.flip(createScriptureClient({ provider: createYouVersionProvider({}) }).getPassage({ passageId: "JHN.3.16" }))).toMatchObject({ code: "authentication" });
}));

it.effect("injects a DOM-free source with a Layer and rejects invalid provider output through the typed channel", () => Effect.gen(function*() {
  const unsupported = () => Effect.fail(new ScriptureError({ code: "unsupported", message: "Not supplied by this fixture." }));
  const provider: BibleDataProvider = {
    id: "fixture", defaultVersionId: "fixture",
    listVersions: () => Effect.succeed([{ id: "fixture", title: "Fixture", abbreviation: "F" }]),
    listBooks: unsupported, listChapters: unsupported, getPassageData: unsupported, clearCache: Effect.void,
  };
  expect(yield* scripture.listVersions().pipe(Effect.provide(Layer.succeed(BibleSource, provider)))).toEqual([{ id: "fixture", title: "Fixture", abbreviation: "F" }]);
  let id = "";
  const client = createScriptureClient({ provider: { ...provider, listVersions: () => Effect.sync(() => [{ id, title: "Fixture", abbreviation: "F" }]) } });
  expect(yield* Effect.flip(client.listVersions())).toMatchObject({ _tag: "ScriptureError", code: "invalid_response", retryable: false });
  id = "recovered";
  expect(yield* client.listVersions()).toEqual([{ id: "recovered", title: "Fixture", abbreviation: "F" }]);
  const error = yield* Schema.decodeUnknownEffect(ScriptureError)({ _tag: "ScriptureError", code: "network", message: "Example" });
  expect(error).toBeInstanceOf(ScriptureError);
  expect(error).toMatchObject({ code: "network", message: "Example", retryable: true });
}));

it.effect("reports malformed upstream structures as invalid responses rather than defects", () => Effect.gen(function*() {
  let payload: unknown = { books: null };
  const transport = vi.fn(async () => Response.json(payload));
  vi.stubGlobal("fetch", transport);
  const client = createScriptureClient();
  expect(yield* Effect.flip(client.listBooks())).toMatchObject({ code: "invalid_response" });
  payload = { books: [{ id: "JHN", name: "John" }] };
  expect(yield* Effect.flip(client.listChapters({ bookId: "JHN" }))).toMatchObject({ code: "invalid_response" });
  payload = { books: [{ id: "JHN", name: "John", firstChapterNumber: 2, lastChapterNumber: 3 }] };
  expect(yield* client.listChapters({ bookId: "JHN" })).toHaveLength(2);
  expect(transport).toHaveBeenCalledTimes(3);
  payload = { translations: null };
  expect(yield* Effect.flip(client.listVersions())).toMatchObject({ code: "invalid_response" });
  payload = { translations: [{ id: "bad", name: "Bad", language: "not_valid" }] };
  expect(yield* Effect.flip(client.listVersions())).toMatchObject({ code: "invalid_response" });
  payload = { translations: [{ id: "good", name: "Good", language: "spa" }] };
  expect(yield* client.listVersions()).toMatchObject([{ id: "good", language: "es" }]);
  vi.mocked(youversion.getBooks).mockResolvedValue({ data: null } as unknown as Awaited<ReturnType<typeof youversion.getBooks>>);
  const yv = createScriptureClient({ provider: createYouVersionProvider({ yvpPublicAppKey: "test" }) });
  expect(yield* Effect.flip(yv.listBooks())).toMatchObject({ code: "invalid_response" });
}));

it.effect("retries transient failures on the clock, never retries authentication, and evicts exhausted failures", () => Effect.gen(function*() {
  const books = vi.spyOn(FreeUseBibleApi.prototype, "getTranslationBooks").mockRejectedValue({ status: 503 });
  const client = createScriptureClient();
  expect(books).not.toHaveBeenCalled();
  const fiber = yield* client.listBooks().pipe(Effect.flip, Effect.forkChild);
  yield* TestClock.adjust("99 millis");
  expect(books).toHaveBeenCalledTimes(1);
  yield* TestClock.adjust("1 millis");
  expect(books).toHaveBeenCalledTimes(2);
  yield* TestClock.adjust("200 millis");
  expect(yield* Fiber.join(fiber)).toMatchObject({ code: "network" });
  expect(books).toHaveBeenCalledTimes(3);
  books.mockRejectedValue({ status: 401 });
  expect(yield* Effect.flip(client.listBooks())).toMatchObject({ code: "authentication" });
  expect(books).toHaveBeenCalledTimes(4);
  books.mockResolvedValue({ books: [{ id: "JHN", name: "John", firstChapterNumber: 1, lastChapterNumber: 21 }] } as Awaited<ReturnType<FreeUseBibleApi["getTranslationBooks"]>>);
  expect(yield* client.listBooks()).toEqual([{ id: "JHN", title: "John" }]);
}));

it.effect("bounds the entire retry sequence and aborts supported transports when their consumer is interrupted", () => Effect.gen(function*() {
  const signals: AbortSignal[] = [];
  vi.spyOn(FreeUseBibleApi.prototype, "getTranslationBooks").mockImplementation((_id, _cache, options) => {
    signals.push(options!.signal!);
    return new Promise(() => {});
  }).mockRejectedValueOnce({ status: 503 });
  const client = createScriptureClient();
  const deadline = yield* client.listBooks().pipe(
    Effect.provideService(RequestPolicy, { timeout: "1 second", retries: 2 }), Effect.flip, Effect.forkChild,
  );
  yield* TestClock.adjust("1 second");
  expect(yield* Fiber.join(deadline)).toMatchObject({ code: "timeout" });
  expect(signals[0].aborted).toBe(true);
  const cancelled = yield* client.listBooks().pipe(Effect.forkChild);
  yield* Effect.yieldNow;
  yield* Fiber.interrupt(cancelled);
  expect(signals[1].aborted).toBe(true);
}));

it.effect("emits nested SDK, provider, and request spans to the application's tracer", () => Effect.gen(function*() {
  vi.spyOn(FreeUseBibleApi.prototype, "getTranslationBooks").mockResolvedValue({ books: [{ id: "JHN", name: "John", firstChapterNumber: 1, lastChapterNumber: 21 }] } as Awaited<ReturnType<FreeUseBibleApi["getTranslationBooks"]>>);
  const spans: Tracer.Span[] = [];
  const tracer = Tracer.make({ span(options) { const span = Tracer.nativeTracer.span(options); spans.push(span); return span; } });
  yield* createScriptureClient().listBooks().pipe(Effect.withSpan("application"), Effect.withTracer(tracer));
  const names = spans.map((span) => span.name);
  expect(names).toEqual(expect.arrayContaining(["application", "scripture.listBooks", "helloao.listBooks", "scripture.request"]));
  const requestSpan = spans.find((span) => span.name === "scripture.request")!;
  expect(requestSpan.attributes.get("operation")).toBe("helloao.books");
  expect(requestSpan.parent).toMatchObject({ _tag: "Some", value: { name: "helloao.listBooks" } });
  expect(spans.every((span) => span.status._tag === "Ended")).toBe(true);
}));

it.effect("keeps a shared discovery result available when one waiting consumer is interrupted", () => Effect.gen(function*() {
  let finish!: (value: Awaited<ReturnType<FreeUseBibleApi["getTranslationBooks"]>>) => void;
  vi.spyOn(FreeUseBibleApi.prototype, "getTranslationBooks").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const client = createScriptureClient();
  const first = yield* client.listBooks().pipe(Effect.forkChild);
  yield* Effect.yieldNow;
  const second = yield* client.listBooks().pipe(Effect.forkChild);
  yield* Effect.yieldNow;
  yield* Fiber.interrupt(first);
  finish({ books: [{ id: "JHN", name: "John", firstChapterNumber: 1, lastChapterNumber: 21 }] } as Awaited<ReturnType<FreeUseBibleApi["getTranslationBooks"]>>);
  expect(yield* Fiber.join(second)).toEqual([{ id: "JHN", title: "John" }]);
}));
