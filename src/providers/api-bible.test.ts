import { afterEach, expect, vi } from "vitest";
import { it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { FreeUseBibleApi } from "free-use-bible-api";
import { TestClock } from "effect/testing";
import { createScriptureClient } from "../data.js";
import { createScriptureClient as createEffectClient, RequestPolicy } from "../data-effect.js";
import { createApiBibleProvider, type ApiBibleClient } from "./api-bible.js";
import { fetchDisplayEffect } from "../providers.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const bible = {
  id: "edition", name: "Test Bible", abbreviation: "TB", language: { id: "heb", name: "Hebrew", scriptDirection: "rtl" },
  copyright: "Test copyright", info: '<p>Publisher <a href="https://example.com">information</a></p>',
};
const text = (value: string, verseId?: string) => ({ type: "text", text: value, attrs: { verseId } });
const para = (style: string, ...items: unknown[]) => ({ type: "tag", name: "para", attrs: { style }, items });
const content = (id: string, nodes: unknown[], verseCount?: number) => ({
  data: { id, bibleId: "edition", reference: "Test reference", copyright: "Passage copyright", content: nodes, verseCount },
  meta: { fumsToken: "invented-reporting-token" },
});
function setup(options: { copyrightUrl?: string } = {}) {
  const client = {
    bibles: { list: vi.fn(async () => ({ data: [bible] })), get: vi.fn(async () => ({ data: bible })) },
    books: { list: vi.fn(async () => ({ data: [{ id: "PSA", name: "Psalms" }] })) },
    chapters: {
      list: vi.fn(async () => ({ data: [{ id: "PSA.intro", number: "intro" }, { id: "PSA.3", number: "3" }] })),
      get: vi.fn<ApiBibleClient["chapters"]["get"]>(async () => content("PSA.3", [
        para("s1", text("Editorial")), para("r", text("Cross reference")),
        para("sp", text("Speaker label")), para("qa", text("Acrostic label", "PSA.3.1")),
        para("d", text("Scriptural superscription.")),
        para("q1", text("First ", "PSA.3.1"), { type: "tag", name: "char", attrs: { style: "it" }, items: [text("line.", "PSA.3.1")] }),
        para("q2", text("Second line.", "PSA.3.2")),
        para("p", text("Cl", "PSA.3.3"), { type: "tag", name: "note", items: [text("Footnote")] }, text("osed.", "PSA.3.3")),
      ])),
    },
    passages: { get: vi.fn<ApiBibleClient["passages"]["get"]>(async () => content("JHN.3.16-JHN.3.18", [para("p", text("Selected. ", "JHN.3.16"), text("Last.", "JHN.3.18"))])) },
  } satisfies ApiBibleClient;
  const provider = createApiBibleProvider({ client, defaultVersionId: "edition", ...options });
  return { upstream: client, provider, client: createScriptureClient({ provider }), native: createEffectClient({ provider }) };
}

it("discovers provider-specific editions and numbered chapters through both data clients", async () => {
  const { client, native } = setup();
  expect(await client.listVersions()).toEqual([{ id: "edition", title: "Test Bible", abbreviation: "TB", language: "he", languageName: "Hebrew" }]);
  expect(await client.listBooks()).toEqual([{ id: "PSA", title: "Psalms" }]);
  expect(await Effect.runPromise(native.listChapters({ bookId: "PSA" }))).toEqual([{ passageId: "PSA.3", number: 3 }]);
});

it("preserves superscriptions, poetry, publisher notices and FUMS through the shared passage schema", async () => {
  const { client, native } = setup();
  const passage = await client.getPassage({ passageId: "PSA.3" });
  expect(passage.text).toBe("Scriptural superscription.\n\nFirst line.\nSecond line.\nClosed.");
  expect(passage).toMatchObject({
    numbering: "unknown", publisher: { copyrightHtml: "Test copyright", infoHtml: bible.info },
    reporting: { kind: "api-bible-fums", token: "invented-reporting-token" },
    attribution: { text: "Passage copyright · TB · Source: API.Bible", urls: expect.arrayContaining(["https://api.bible/"]) },
    display: { direction: "rtl", language: "he" }, cache: { expiresAt: expect.any(Number) },
  });
  expect(passage.instructions).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "api-bible-fums", level: "required" }),
    expect.objectContaining({ code: "api-bible-usage", level: "required" }),
  ]));
  expect(await Effect.runPromise(native.getPassage({ passageId: "PSA.3" }))).toEqual(passage);
});

it("opts into a reference calendar without losing daily passage reporting or publisher obligations", async () => {
  const { client } = setup();
  expect(client.capabilities.verseOfTheDay).toBe(false);
  await expect(client.getVerseOfTheDay({ date: "2026-12-25" })).rejects.toMatchObject({ code: "unsupported" });
  vi.spyOn(FreeUseBibleApi.prototype, "getVerseOfTheDay").mockResolvedValue({ book: "JHN", chapter: 3, verse: 16, endVerse: 18, categories: [] });
  const daily = await client.getVerseOfTheDay({ calendarSource: "ao-lab", date: "2026-12-25" });
  expect(daily.calendarSource.provider).toBe("helloao");
  expect(daily.passage).toMatchObject({
    provider: "api-bible", passageId: "JHN.3.16-18", text: "Selected. Last.",
    publisher: { copyrightHtml: "Test copyright", infoHtml: bible.info },
    reporting: { kind: "api-bible-fums", token: "invented-reporting-token" },
    cache: { expiresAt: expect.any(Number) },
  });
  expect(daily.passage.instructions).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "api-bible-fums", level: "required" }),
    expect.objectContaining({ code: "api-bible-cache", level: "required" }),
  ]));
});

it("expands compact ranges and rejects incomplete coverage even when the resolved ID claims success", async () => {
  const { client, upstream } = setup();
  // Make success depend on sending the actual API.Bible range and render flags.
  upstream.passages.get.mockImplementation(async (...args: unknown[]) => {
    const [, id, params] = args;
    if (id !== "JHN.3.16-JHN.3.18" || !(params as { includeTitles: boolean }).includeTitles) throw { statusCode: 400 };
    return content(String(id), [para("p", text("Selected. ", "JHN.3.16"), text("Last.", "JHN.3.18"))]);
  });
  expect((await client.getPassage({ passageId: "JHN.3.16-18" })).text).toBe("Selected. Last.");
  upstream.passages.get.mockResolvedValue(content("JHN.3.16-JHN.3.18", [para("p", text("Truncated.", "JHN.3.16"))]));
  await expect(client.getPassage({ passageId: "JHN.3.16-18" })).rejects.toMatchObject({ code: "unavailable" });
  upstream.passages.get.mockResolvedValue(content("JHN.3.16", [para("p", text("One verse.", "JHN.3.16"))]));
  expect((await client.getPassage({ passageId: "JHN.3.16" })).text).toBe("One verse.");
  expect((await client.getPassage({ passageId: "JHN.3.16-16" })).passageId).toBe("JHN.3.16");
  await expect(client.getPassage({ passageId: "JHN.3.18-16" })).rejects.toMatchObject({ code: "invalid_reference" });
});

it("accepts grouped verse coverage and exactly 200 verses without assuming truncation", async () => {
  const { client, upstream } = setup();
  upstream.passages.get.mockResolvedValue(content("JHN.3.16-JHN.3.18", [para("p", text("Grouped verses.", "JHN.3.16-JHN.3.18"))]));
  expect((await client.getPassage({ passageId: "JHN.3.16-18" })).text).toBe("Grouped verses.");
  upstream.passages.get.mockResolvedValue(content("TST.1.1-TST.1.200", [
    para("p", ...Array.from({ length: 200 }, (_, n) => text(`Verse ${n + 1}. `, `TST.1.${n + 1}`))),
  ], 200));
  const passage = await client.getPassage({ passageId: "TST.1.1-200" });
  expect(passage.text).toBe(Array.from({ length: 200 }, (_, n) => `Verse ${n + 1}.`).join(" "));
});

it("rejects missing reporting data, string content and missing copyright instead of discarding obligations", async () => {
  const { client, upstream } = setup();
  for (const response of [
    { ...content("PSA.3", []), meta: {} },
    { ...content("PSA.3", []), data: { ...content("PSA.3", []).data, content: "Unexpected HTML" } },
  ]) {
    upstream.chapters.get.mockResolvedValue(response as ReturnType<typeof content>);
    const error = await client.getPassage({ passageId: "PSA.3" }).catch((error) => error);
    expect(error).toMatchObject({ code: "invalid_response" });
    expect(error.cause).toBeUndefined();
  }
  await client.clearCache();
  upstream.bibles.get.mockResolvedValue({ data: { ...bible, copyright: "" } });
  await expect(client.getPassage({ passageId: "PSA.3" })).rejects.toMatchObject({ code: "invalid_response" });
});

it.effect("expires outer discovery and publisher caches, and exposes the earliest refresh deadline", () => Effect.gen(function*() {
  const { native, upstream } = setup();
  const initial = yield* native.getPassage({ passageId: "PSA.3" });
  yield* native.listVersions();
  yield* native.listBooks();
  yield* native.listChapters({ bookId: "PSA" });
  upstream.bibles.list.mockResolvedValue({ data: [{ ...bible, name: "Updated edition" }] });
  upstream.bibles.get.mockResolvedValue({ data: { ...bible, copyright: "Updated copyright" } });
  upstream.books.list.mockResolvedValue({ data: [{ id: "JHN", name: "John" }] });
  upstream.chapters.list.mockResolvedValue({ data: [{ id: "PSA.4", number: "4" }] });
  yield* TestClock.adjust("13 days");
  expect((yield* native.listVersions())[0].title).toBe("Test Bible");
  expect((yield* native.getPassage({ passageId: "PSA.3" })).cache).toEqual(initial.cache);
  yield* TestClock.adjust("1 day");
  expect((yield* native.listVersions())[0].title).toBe("Updated edition");
  expect(yield* native.listBooks()).toEqual([{ id: "JHN", title: "John" }]);
  expect(yield* native.listChapters({ bookId: "PSA" })).toEqual([{ passageId: "PSA.4", number: 4 }]);
  const refreshed = yield* native.getPassage({ passageId: "PSA.3" });
  expect(refreshed.publisher?.copyrightHtml).toBe("Updated copyright");
  expect(refreshed.cache!.expiresAt - initial.cache!.expiresAt).toBe(14 * 24 * 60 * 60 * 1000);
}));

it.effect("classifies SDK statusCode failures without retaining private diagnostics", () => Effect.gen(function*() {
  const { native, upstream } = setup();
  for (const [statusCode, code] of [[401, "authentication"], [403, "authentication"], [404, "unavailable"], [429, "rate_limit"], [503, "network"]] as const) {
    upstream.books.list.mockRejectedValue({ statusCode, message: "secret-credential", body: "secret-credential", cause: new Error("secret-credential") });
    const error = yield* Effect.flip(native.listBooks().pipe(Effect.provideService(RequestPolicy, { timeout: "1 second", retries: 0 })));
    expect(error).toMatchObject({ code });
    expect(error.cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain("secret-credential");
  }
}));

it.effect("propagates interruption to the upstream AbortSignal", () => Effect.gen(function*() {
  const { native, upstream } = setup();
  let aborted = false;
  upstream.books.list.mockImplementation((...args: unknown[]) => new Promise((_, reject) => {
    const signal = args[2] as AbortSignal;
    signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); }, { once: true });
  }));
  const fiber = yield* native.listBooks().pipe(Effect.forkChild);
  yield* Effect.yieldNow;
  yield* Fiber.interrupt(fiber);
  expect(aborted).toBe(true);
}));

it("refuses browser construction without making requests", () => {
  vi.stubGlobal("window", {});
  expect(() => setup()).toThrow("API.Bible requires a server-side client");
});

const displayContent = (html = '<p class="s1">Editorial</p><p class="d">Scriptural title</p><p class="q1"><span class="verse-span" data-verse-id="PSA.3.1"><span class="v">1</span>First <span class="nd">Lord</span>.</span></p><p class="q2"><span data-verse-id="PSA.3.2"><span class="v">2</span>Second <span class="add">line</span>.</span></p><table><tbody><tr><td class="tc1">Cell A</td><td class="tc2">Cell B</td></tr></tbody></table>') => ({
  ...content("PSA.3.1-PSA.3.2", []),
  data: { ...content("PSA.3.1-PSA.3.2", []).data, copyright: '<p>Publisher &amp; partners <a href="https://example.com">notice</a></p>', content: html },
});

it("returns safe native Scripture HTML, official styles, copyright links and reporting from one display request", async () => {
  const { provider, upstream } = setup({ copyrightUrl: "/copyright/bible" });
  upstream.passages.get.mockImplementation(async (_id, passageId, params) => {
    if (passageId !== "PSA.3.1-PSA.3.2" || params.contentType !== "html" || !params.includeVerseSpans || !params.includeVerseNumbers) throw { statusCode: 400 };
    return displayContent(displayContent().data.content + '<script>alert(1)</script><img src="tracking" onerror="alert(1)"><p style="display:none" onclick="alert(1)">Safe ending</p>');
  });
  const display = await Effect.runPromise(provider.getPassageDisplay("edition", "PSA.3.1-2"));
  expect(display.html).toContain('<p class="q2"><span data-verse-id="PSA.3.2">');
  expect(display.html).toContain('<span class="nd">Lord</span>');
  expect(display.html).toContain('<span class="add">line</span>');
  expect(display.html).toContain('<p class="d">Scriptural title</p>');
  expect(display.html).toContain('<td class="tc1">Cell A</td><td class="tc2">Cell B</td>');
  expect(display.html).not.toMatch(/script|img|tracking|onclick|onerror|style=/);
  expect(display.attribution).toBe("Publisher & partners notice · TB · Copyright information · Source: API.Bible");
  expect(display.attributionHtml).toContain('Publisher &amp; partners notice');
  expect(display.attributionHtml).toContain('href="/copyright/bible"');
  expect(display).toMatchObject({ direction: "rtl", containerAttributes: { class: "scripture-bible api-bible scripture-styles", lang: "he" }, reporting: { kind: "api-bible-fums", token: "invented-reporting-token" }, cache: { expiresAt: expect.any(Number) } });
  expect(display.stylesheets?.[0]).toMatchObject({ kind: "bible", href: expect.stringContaining("americanbible/scripture-styles@") });
});

it("requires an app copyright page and rejects truncated native HTML or missing FUMS", async () => {
  const withoutPage = setup();
  await expect(Effect.runPromise(withoutPage.provider.getPassageDisplay("edition", "PSA.3.1-2"))).rejects.toMatchObject({ code: "unsupported" });
  expect(() => createApiBibleProvider({ client: withoutPage.upstream, defaultVersionId: "edition", copyrightUrl: "javascript:alert(1)" })).toThrow();
  const { provider, upstream } = setup({ copyrightUrl: "/copyright/bible" });
  upstream.passages.get.mockResolvedValue(displayContent('<span data-verse-id="PSA.3.1">Truncated</span>'));
  await expect(Effect.runPromise(provider.getPassageDisplay("edition", "PSA.3.1-2"))).rejects.toMatchObject({ code: "unavailable" });
  upstream.passages.get.mockResolvedValue({ ...displayContent(), meta: {} });
  await expect(Effect.runPromise(provider.getPassageDisplay("edition", "PSA.3.1-2"))).rejects.toMatchObject({ code: "invalid_response" });
  upstream.passages.get.mockResolvedValue(displayContent('<script data-verse-id="PSA.3.1">Unsafe</script><span data-verse-id="PSA.3.2">Last only</span>'));
  await expect(Effect.runPromise(provider.getPassageDisplay("edition", "PSA.3.1-2"))).rejects.toMatchObject({ code: "unavailable" });
});

it.effect("refreshes component displays at the earliest publisher deadline, not 14 days after the display fetch", () => Effect.gen(function*() {
  const { provider, upstream, native } = setup({ copyrightUrl: "/copyright/bible" });
  yield* native.getPassage({ passageId: "PSA.3" });
  upstream.passages.get.mockResolvedValue(displayContent());
  const browserProvider = { id: "api-bible", defaultVersionId: "edition", effects: provider, getPassage: () => Effect.runPromise(provider.getPassageDisplay("edition", "PSA.3.1-2")) };
  yield* TestClock.adjust("13 days");
  const first = yield* fetchDisplayEffect(browserProvider, "edition", "PSA.3.1-2");
  upstream.passages.get.mockResolvedValue({ ...displayContent(), meta: { fumsToken: "refreshed-token" } });
  expect((yield* fetchDisplayEffect(browserProvider, "edition", "PSA.3.1-2")).reporting).toEqual(first.reporting);
  yield* TestClock.adjust("1 day");
  const refreshed = yield* fetchDisplayEffect(browserProvider, "edition", "PSA.3.1-2");
  expect(refreshed.reporting?.token).toBe("refreshed-token");
  expect(refreshed.cache!.expiresAt - first.cache!.expiresAt).toBe(14 * 24 * 60 * 60 * 1000);
  const stale = { ...browserProvider, effects: undefined, getPassage: async () => ({ ...first, cache: { expiresAt: 0 } }) };
  expect(yield* Effect.flip(fetchDisplayEffect(stale, "edition", "PSA.3.1-2"))).toMatchObject({ code: "invalid_response" });
}));
