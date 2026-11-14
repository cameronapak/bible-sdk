import { afterEach, expect, vi } from "vitest";
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { FreeUseBibleApi } from "free-use-bible-api";
import { createScriptureClient } from "../data.js";
import { createScriptureClient as createEffectClient } from "../data-effect.js";
import { createBibleApiProvider } from "./bible-api.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const web = { identifier: "web", name: "World English Bible", language: "English", language_code: "eng", license: "Public Domain" };
const hebrew = { identifier: "leningrad", name: "Hebrew Leningrad Codex", language: "Hebrew", language_code: "heb", license: "See https://github.com/seven1m/open-bibles#hebrew-leningrad-codex" };
const spanish = { identifier: "pddpt", name: "Palabra de Dios para ti", language: "Spanish", language_code: "spa", license: "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/); © 2017–2022 Asociacion Biblica Latinoamericana" };
const books = [{ id: "JHN", name: "John" }, { id: "JUD", name: "Jude" }];
const chapter = (item = web, book = "JHN", number = 3) => ({
  translation: item,
  verses: [1, 2, 4].map((verse) => ({ book_id: book, book: item.identifier === "pddpt" ? "Juan" : book === "JUD" ? "Jude" : "John", chapter: number, verse, text: ({ 1: "First.\nSecond line.", 2: "<script>literal</script> & words.", 4: "Last." })[verse] })),
});
function setup() {
  const transport = vi.fn(async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname.replace(/^\/mount/, "");
    const [, , id, book, number] = path.split("/");
    if (!id) return Response.json({ translations: [web, spanish, hebrew] });
    const item = [web, spanish, hebrew].find((item) => item.identifier === id) ?? web;
    if (!book) return Response.json({ translation: item, books });
    if (!number) return Response.json({ translation: item, chapters: [1, 3].map((chapter) => ({ book_id: book, chapter })) });
    return Response.json(chapter(item, book, Number(number)));
  });
  vi.stubGlobal("fetch", transport);
  const provider = createBibleApiProvider();
  return { transport, provider, client: createScriptureClient({ provider }), native: createEffectClient({ provider }) };
}

it("discovers actual versions, localized books and chapters through both data surfaces", async () => {
  const { client, native } = setup();
  expect(typeof document).toBe("undefined");
  expect(await client.listVersions()).toEqual([
    { id: "web", title: "World English Bible", abbreviation: "web", language: "en", languageName: "English" },
    { id: "pddpt", title: "Palabra de Dios para ti", abbreviation: "pddpt", language: "es", languageName: "Spanish" },
    { id: "leningrad", title: "Hebrew Leningrad Codex", abbreviation: "leningrad", language: "he", languageName: "Hebrew" },
  ]);
  expect(await Effect.runPromise(native.listBooks())).toEqual(books.map(({ id, name }) => ({ id, title: name })));
  expect(await client.listChapters({ bookId: "JHN" })).toEqual([{ number: 1, passageId: "JHN.1" }, { number: 3, passageId: "JHN.3" }]);
});

it("preserves asymmetric range text, internal breaks, source numbering gaps and full single-chapter books", async () => {
  const { client, native, provider } = setup();
  const data = await client.getPassage({ passageId: "JHN.3.2-4", versionId: "pddpt" });
  expect(data).toMatchObject({ provider: "bible-api", reference: "Juan 3:2-4", text: "<script>literal</script> & words. Last.", numbering: "unknown", version: { id: "pddpt", sourceLanguage: "spa" } });
  expect(await Effect.runPromise(native.getPassage({ passageId: "JHN.3.2-4", versionId: "pddpt" }))).toEqual(data);
  expect((await client.getPassage({ passageId: "JUD.1" })).text).toBe("First.\nSecond line. <script>literal</script> & words. Last.");
  expect((await client.getPassage({ passageId: "JUD.1.1" })).text).toBe("First.\nSecond line.");
  await expect(client.getPassage({ passageId: "JHN.3.1-5" })).rejects.toMatchObject({ code: "unavailable" });
  await expect(client.getPassage({ passageId: "JHN.3.4-2" })).rejects.toMatchObject({ code: "invalid_reference" });
  const display = await provider.getPassage("pddpt", "JHN.3.2-4");
  expect(display.html).toContain("&lt;script&gt;literal&lt;/script&gt; &amp; words.");
  expect(display.html).not.toContain("<script>");
  expect(display.html).toContain('class="scripture-verse-number">4</sup>');
  expect(display.stylesheets).toBeUndefined();
  expect(display.attribution).toBe(data.attribution.text);
  expect(display.attributionHtml).toContain('href="https://creativecommons.org/licenses/by-sa/4.0/"');
  expect(data.display.nativeHtml).toBeUndefined();
});

it("keeps edition-specific rights and Hebrew warnings outside unaltered Scripture", async () => {
  const { transport, provider, client } = setup();
  const text = "בְּ/רֵאשִׁ֖יתבָּרָ֣א";
  transport.mockResolvedValue(Response.json({ translation: hebrew, verses: [{ book_id: "GEN", book: "בראשית", chapter: 1, verse: 1, text }] }));
  const data = await client.getPassage({ versionId: "leningrad", passageId: "GEN.1.1" });
  expect(data.text).toBe(text);
  expect(data.display).toMatchObject({ language: "he", direction: "rtl" });
  expect(data.instructions).toContainEqual(expect.objectContaining({ code: "bible-api-hebrew-source", text: expect.stringContaining("joined words and slash markers") }));
  expect(data.attribution.text).toContain("Source text warning:");
  const display = await provider.getPassage("leningrad", "GEN.1.1");
  expect(display.html).toContain(text);
  expect(display.html).not.toContain("Source text warning:");
  expect(display.attributionHtml).toContain("Source text warning:");
  expect(display.instructions).toEqual(data.instructions);
  expect(display.licenses).toEqual(data.licenses);
  expect(display.direction).toBe("rtl");
});

it.each([
  "Public Domain",
  "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/); © 2018 AudioBiblia.org / Irma Flores",
  spanish.license,
  "Custom terms: permission must be obtained from the publisher",
])("preserves the full license notice without inventing permissions: %s", async (license) => {
  const { client, provider, transport } = setup();
  transport.mockResolvedValue(Response.json(chapter({ ...web, license })));
  const data = await client.getPassage({ passageId: "JHN.3.1" });
  expect(data.attribution.text).toContain(license);
  expect(data.licenses[0].name).toBe(license);
  expect(data.licenses[0].restrictions).toBeUndefined();
  expect((await provider.getPassage("web", "JHN.3.1")).attribution).toBe(data.attribution.text);
});

it.each([
  { ...chapter(), translation: spanish },
  { ...chapter(), verses: [{ ...chapter().verses[0], book_id: "ROM" }] },
  { ...chapter(), verses: [{ ...chapter().verses[0], chapter: 2 }] },
  { ...chapter(), verses: [chapter().verses[0], chapter().verses[0]] },
  { ...chapter(), verses: [...chapter().verses].reverse() },
  { ...chapter(), verses: [] },
])("rejects inconsistent successful chapter data without retaining it", async (payload) => {
  const { client, transport } = setup();
  transport.mockResolvedValueOnce(Response.json(payload));
  await expect(client.getPassage({ passageId: "JHN.3.1" })).rejects.toMatchObject({ code: "invalid_response" });
  expect((await client.getPassage({ passageId: "JHN.3.1" })).text).toBe("First.\nSecond line.");
});

it.each([[429, "rate_limit"], [404, "unavailable"], [403, "unavailable"], [500, "network"]] as const)("classifies HTTP %s before decoding HTML, without automatic retries", async (status, code) => {
  const { client, transport } = setup();
  transport.mockImplementation(async () => new Response("<h1>Upstream failure</h1>", { status }));
  await expect(client.getPassage({ passageId: "JHN.3.1" })).rejects.toMatchObject({ code });
  expect(transport).toHaveBeenCalledTimes(1);
});

it("does not retry opaque CORS errors or cache malformed JSON", async () => {
  const { client, transport } = setup();
  transport.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await expect(client.getPassage({ passageId: "JHN.3.1" })).rejects.toMatchObject({ code: "network" });
  expect(transport).toHaveBeenCalledTimes(1);
  transport.mockResolvedValueOnce(new Response("not json"));
  await expect(client.getPassage({ passageId: "JHN.3.1" })).rejects.toMatchObject({ code: "invalid_response" });
  expect((await client.getPassage({ passageId: "JHN.3.1" })).text).toBe("First.\nSecond line.");
});

it.effect("coalesces data and display requests with an original deadline, then refreshes on TTL or purge", () => Effect.gen(function*() {
  const { provider, transport, native } = setup();
  const start = Date.parse("2026-11-14T12:00:00Z");
  yield* TestClock.setTime(start);
  const [first, display] = yield* Effect.all([
    native.getPassage({ passageId: "JHN.3.1" }), provider.effects.getPassageDisplay("web", "JHN.3.2-4"),
  ], { concurrency: "unbounded" });
  expect(transport).toHaveBeenCalledTimes(1);
  expect(first.cache?.expiresAt).toBe(start + 86_400_000);
  expect(display.cache).toEqual(first.cache);
  yield* TestClock.adjust("23 hours");
  expect((yield* provider.effects.getPassageDisplay("web", "JHN.3.4")).cache).toEqual(first.cache);
  yield* TestClock.adjust("2 hours");
  const after = yield* native.getPassage({ passageId: "JHN.3.1" });
  expect(after.cache?.expiresAt).toBe(start + 49 * 3_600_000);
  expect(transport).toHaveBeenCalledTimes(2);
  yield* native.clearCache();
  yield* native.getPassage({ passageId: "JHN.3.1" });
  expect(transport).toHaveBeenCalledTimes(3);
}));

it("preserves self-hosted base paths and isolates provider instances", async () => {
  const { transport, client } = setup();
  const hosted = createScriptureClient({ provider: createBibleApiProvider({ baseUrl: "https://example.com/mount/" }) });
  const first = await hosted.getPassage({ passageId: "JHN.3.1" });
  expect(first.source.url).toBe("https://example.com/mount/data/web/JHN/3");
  transport.mockResolvedValue(Response.json({ ...chapter(), verses: [{ ...chapter().verses[0], text: "A separate source." }] }));
  expect((await client.getPassage({ passageId: "JHN.3.1" })).text).toBe("A separate source.");
  expect((await hosted.getPassage({ passageId: "JHN.3.1" })).text).toBe("First.\nSecond line.");
  await expect(hosted.getPassage({ passageId: "JHN.3.1", versionId: ".." })).rejects.toMatchObject({ code: "unavailable" });
  expect(() => createBibleApiProvider({ baseUrl: "https://user:password@example.com" })).toThrow(TypeError);
});

it("has no native daily calendar and only uses AO Lab's calendar when explicitly requested", async () => {
  const { client, transport } = setup();
  expect(client.capabilities.verseOfTheDay).toBe(false);
  await expect(client.getVerseOfTheDay()).rejects.toMatchObject({ code: "unsupported" });
  expect(transport).not.toHaveBeenCalled();
  vi.spyOn(FreeUseBibleApi.prototype, "getVerseOfTheDay").mockResolvedValue({ book: "JHN", chapter: 3, verse: 2, endVerse: 4, categories: [] });
  const daily = await client.getVerseOfTheDay({ calendarSource: "ao-lab", date: "2026-11-14" });
  expect(daily.calendarSource.provider).toBe("helloao");
  expect(daily.passage).toMatchObject({ provider: "bible-api", passageId: "JHN.3.2-4", text: "<script>literal</script> & words. Last." });
});
