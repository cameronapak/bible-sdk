import { Clock, Effect, Schema } from "effect";
import { ScriptureError, type BibleDisplayProvider, type ScripturePassage } from "../data-types.js";
import { attributionLink, bookId, escapeHtml, passageRange, requestCache, SourceLanguage, textInstructions, validateVerses } from "../data-helpers.js";
import { decodeResponse, request, withPromises } from "../runtime.js";

export type BibleApiOptions = {
  /** HTTP(S) origin and optional path of a self-hosted Bible API deployment. */
  baseUrl?: string;
};

const ttl = "24 hours";
const ttlMillis = 24 * 60 * 60 * 1000;
const termsUrl = "https://bible-api.com/";
const rightsUrl = "https://github.com/seven1m/open-bibles#translation-details";
const hebrewWarning = "Source text warning: the Leningrad source contains joined words and slash markers. Text is returned unchanged; it is not a verified reader-quality Hebrew edition.";
const positive = Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER));
const translation = Schema.Struct({
  identifier: Schema.NonEmptyString, name: Schema.NonEmptyString,
  language: Schema.String, language_code: SourceLanguage, license: Schema.NonEmptyString,
});
const catalogResponse = decodeResponse(Schema.Struct({ translations: Schema.Array(translation) }));
const booksResponse = decodeResponse(Schema.Struct({ translation, books: Schema.Array(Schema.Struct({ id: Schema.NonEmptyString, name: Schema.String })) }));
const chaptersResponse = decodeResponse(Schema.Struct({ translation, chapters: Schema.Array(Schema.Struct({ book_id: Schema.String, chapter: positive })) }));
const chapterResponse = decodeResponse(Schema.Struct({ translation, verses: Schema.Array(Schema.Struct({
  book_id: Schema.String, book: Schema.NonEmptyString, chapter: positive, verse: positive, text: Schema.String,
})) }));
const version = (item: typeof translation.Type) => ({
  id: item.identifier, title: item.name, abbreviation: item.identifier,
  language: new Intl.Locale(item.language_code).toString(), languageName: item.language,
});
const invalidResponse = () => new ScriptureError({ code: "invalid_response", message: "Bible API returned inconsistent passage or discovery data." });

/** Key-free JSON provider. Shared by DOM-free data clients and browser displays. */
export function createBibleApiProvider({ baseUrl = "https://bible-api.com" }: BibleApiOptions = {}) {
  const base = new URL(baseUrl);
  if (!/^https?:$/.test(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new TypeError("Bible API baseUrl must be an HTTP(S) URL without credentials, query, or fragment.");
  }
  const endpoint = base.href.replace(/\/+$/, "");
  const cache = requestCache(ttl);
  // IDs are path segments, not references or URLs. Reject dot segments before URL parsing.
  const versionId = (id: string) => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)
    ? Effect.void : Effect.fail(new ScriptureError({ code: "unavailable", message: "Use a Bible API translation identifier." }));
  const url = (...parts: (string | number)[]) => `${endpoint}/data${parts.map((part) => `/${encodeURIComponent(part)}`).join("")}`;
  const load = <A>(sourceUrl: string, decode: (value: unknown) => Effect.Effect<A, ScriptureError>) => cache.get(sourceUrl, () => Effect.gen(function*() {
    const value = yield* request("bibleApi.fetch", async (signal) => {
      const response = await fetch(sourceUrl, { signal });
      if (!response.ok) {
        // The public service needs no credential; its abuse middleware may return 403.
        if (response.status === 401 || response.status === 403) throw new ScriptureError({ code: "unavailable", message: "Bible API denied this request. Check access and hosted-service limits." });
        throw { status: response.status };
      }
      return response.json();
    }, false);
    const data = yield* decode(value);
    return { data, expiresAt: (yield* Clock.currentTimeMillis) + ttlMillis };
  }));
  const checkTranslation = (actual: string, expected: string) => actual === expected ? Effect.void : Effect.fail(invalidResponse());
  const chapter = (id: string, book: string, number: number) => Effect.gen(function*() {
    yield* versionId(id);
    return yield* load(url(id, book, number), (value) => chapterResponse(value).pipe(Effect.flatMap((data) => {
      const verses = data.verses;
      return data.translation.identifier !== id || !verses.length || verses.some((verse, index) =>
        verse.book_id !== book || verse.chapter !== number || (index > 0 && verse.verse <= verses[index - 1].verse))
        ? Effect.fail(invalidResponse()) : Effect.succeed(data);
    })));
  });
  const selection = (id: string, passageId: string) => Effect.gen(function*() {
    const range = yield* passageRange(passageId);
    const payload = yield* chapter(id, range.book, range.chapter);
    yield* validateVerses(payload.data.verses.map((verse) => verse.verse), range.first, range.last);
    const verses = payload.data.verses.filter((verse) => range.first === undefined || (verse.verse >= range.first && verse.verse <= range.last!));
    return { ...payload, range, verses };
  });
  const passage = Effect.fnUntraced(function*(id: string, passageId: string) {
    const { data, expiresAt, range, verses } = yield* selection(id, passageId);
    const item = data.translation;
    const licenseLinks = [...item.license.matchAll(/https?:\/\/[^\s)]+/g)].map(([link]) => link);
    const hebrew = item.identifier === "leningrad";
    const attribution = `${item.name}. ${item.license} · Source: Bible API${hebrew ? ` · ${hebrewWarning}` : ""}`;
    const result: ScripturePassage = {
      provider: "bible-api", source: { url: url(id, range.book, range.chapter), versionId: id },
      requestedPassageId: passageId, passageId,
      reference: `${verses[0].book} ${range.chapter}${range.first === undefined ? "" : `:${range.first}${range.last === range.first ? "" : `-${range.last}`}`}`,
      text: verses.map((verse) => verse.text).join(" "),
      version: { ...version(item), sourceLanguage: item.language_code },
      attribution: { text: attribution, urls: [...new Set([endpoint, rightsUrl, ...licenseLinks])] },
      licenses: [{ name: item.license, url: licenseLinks[0] || rightsUrl }],
      cache: { expiresAt }, numbering: "unknown",
      display: { format: "text", whitespace: "pre-wrap", attributionPlacement: "after-passage", language: version(item).language, direction: new Intl.Locale(item.language_code).language === "he" ? "rtl" : "ltr" },
      instructions: [
        ...textInstructions(),
        { code: "bible-api-source", level: "notice", appliesTo: "all", text: "Bible API supplies plain verse text, not native HTML, headings, poetry structure, or red-letter formatting. Source numbering is not mapped to another edition.", urls: [termsUrl] },
        { code: "bible-api-hosted-limits", level: "required", appliesTo: "all", text: "The public bible-api.com service allows 15 requests per 30 seconds per IP, prohibits whole-Bible downloads, and guarantees neither availability nor correctness. This adapter does not retry automatically. Independent clients can share an IP quota; self-hosted deployments have their own policies.", urls: [termsUrl] },
        { code: "bible-api-license", level: "required", appliesTo: "all", text: `Preserve this edition's notice: ${item.license}. Follow its source terms. Creative Commons editions require attribution and license links and may require change notices and share-alike licensing of adaptations. A Public Domain label is the provider's assertion, not a worldwide rights guarantee.`, urls: [rightsUrl, ...licenseLinks] },
        ...(hebrew ? [{ code: "bible-api-hebrew-source", level: "notice" as const, appliesTo: "all" as const, text: hebrewWarning, urls: ["https://github.com/seven1m/open-bibles#hebrew-leningrad-codex"] }] : []),
      ],
    };
    return { data: result, verses };
  });
  const effects: BibleDisplayProvider = {
    id: "bible-api", defaultVersionId: "web", cacheTimeToLive: ttl, clearCache: cache.clear,
    listVersions: Effect.fn("bibleApi.listVersions")(function*() {
      return (yield* load(url(), catalogResponse)).data.translations.map(version);
    }),
    listBooks: Effect.fn("bibleApi.listBooks")(function*(id) {
      yield* versionId(id);
      const { data } = yield* load(url(id), (value) => booksResponse(value).pipe(Effect.tap((data) => checkTranslation(data.translation.identifier, id))));
      return data.books.map((book) => ({ id: book.id, title: book.name }));
    }),
    listChapters: Effect.fn("bibleApi.listChapters")(function*(id, book) {
      yield* versionId(id);
      yield* bookId(book);
      const { data } = yield* load(url(id, book), (value) => chaptersResponse(value).pipe(Effect.flatMap((data) =>
        data.translation.identifier !== id || data.chapters.some((item, index) => item.book_id !== book || (index > 0 && item.chapter <= data.chapters[index - 1].chapter))
          ? Effect.fail(invalidResponse()) : Effect.succeed(data))));
      return data.chapters.map(({ chapter: number }) => ({ number, passageId: `${book}.${number}` }));
    }),
    getPassageData: Effect.fn("bibleApi.getPassageData")(function*(id, passageId) {
      return (yield* passage(id, passageId)).data;
    }),
    getPassageDisplay: Effect.fn("bibleApi.getPassageDisplay")(function*(id, passageId) {
      const { data, verses } = yield* passage(id, passageId);
      return {
        html: verses.map((verse) => `<span class="scripture-verse" style="white-space:pre-wrap;overflow-wrap:anywhere"><sup class="scripture-verse-number">${verse.verse}</sup> ${escapeHtml(verse.text)}</span>`).join(" "),
        version: data.version, attribution: data.attribution.text,
        attributionHtml: `${escapeHtml(data.version.title)}. ${attributionLink(data.licenses[0].name!, data.licenses[0].url)} · Source: ${attributionLink("Bible API", endpoint)}${id === "leningrad" ? ` · ${escapeHtml(hebrewWarning)}` : ""}`,
        instructions: data.instructions, licenses: data.licenses,
        direction: data.display.direction, containerAttributes: { class: "scripture-bible", lang: data.display.language || "" }, cache: data.cache,
      };
    }),
  };
  return withPromises(effects);
}
