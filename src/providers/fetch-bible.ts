import { FetchClient, type GetResourcesItem } from "@gracious.tech/fetch-client";
import { Effect, Schema } from "effect";
import sanitizeHtml from "sanitize-html";
import { ScriptureError, type BibleDisplayProvider } from "../data-types.js";
import type { BibleProvider } from "../providers.js";
import { attributionLink, bookId, passageRange, requestCache, SourceLanguage, textInstructions, validateVerses } from "../data-helpers.js";
import { decodeResponse, request, withPromises } from "../runtime.js";

export type FetchBibleOptions = {
  /** Explicitly declare commercial use; the upstream default is noncommercial. */
  usage: {
    commercial: boolean;
    attributionless?: boolean;
    limitless?: boolean;
    derivatives?: boolean | "same-license";
  };
};

const stylesheet = "https://cdn.jsdelivr.net/npm/@gracious.tech/fetch-client@2.6.0/dist/client.css";
const nativeHtml = {
  containerAttributes: { class: "fetch-bible fb-plain scripture-bible no-notes no-chapters" },
  stylesheets: [{ kind: "bible" as const, href: stylesheet }],
};

// Only calls into the upstream resource parser use this boundary, not SDK logic.
const readSource = <A>(read: () => A) => Effect.try({ try: read, catch: (cause) => new ScriptureError({ code: "invalid_response", message: "fetch.bible returned invalid resource data.", cause }) });
const textPart = Schema.Union([Schema.String, Schema.Struct({ type: Schema.Literals(["heading", "note"]), contents: Schema.String })]);
const verseList = decodeResponse(Schema.Array(Schema.Struct({ chapter: Schema.Int, verse: Schema.Int, content: Schema.Array(textPart) })));

export function createFetchBibleProvider(options: FetchBibleOptions): BibleProvider & { readonly effects: BibleDisplayProvider } {
  // Snapshot configuration so mutation cannot let cached resources bypass usage filtering.
  const config = { usage: { ...options.usage }, remember_fetches: false };
  let client = new FetchClient(config);
  const cache = requestCache();
  const version = (item: GetResourcesItem) => ({
    id: item.id, title: item.name_local || item.name_english,
    abbreviation: item.name_local_abbrev || item.name_english_abbrev || item.id,
    language: new Intl.Locale(item.language).language,
  });
  const catalog = Effect.fn("fetchBible.catalog")(function*() {
    return yield* cache.get("catalog", () => Effect.gen(function*() {
      const collection = yield* request("fetchBible.collection", () => client.fetch_collection());
      const items = yield* readSource(() => collection.bibles.get_resources()).pipe(
        Effect.tap(decodeResponse(Schema.Array(Schema.Struct({ language: SourceLanguage })))),
      );
      return { collection, resources: new Map(items.map((item) => [item.id, item])) };
    }));
  });
  const resource = Effect.fnUntraced(function*(versionId: string, book?: string) {
    const { collection, resources } = yield* catalog();
    const item = resources.get(versionId);
    if (!item) return yield* new ScriptureError({ code: "unavailable", message: "Version is unavailable for this usage configuration." });
    if (book && !collection.bibles.has_book(versionId, book)) return yield* new ScriptureError({ code: "unavailable", message: "Book is not available in this version." });
    return { collection, item };
  });
  const textBook = Effect.fn("fetchBible.textBook")(function*(versionId: string, book: string) {
    const { collection, item } = yield* resource(versionId, book);
    const contents = yield* cache.get(JSON.stringify([versionId, book, "txt"]), () => request("fetchBible.textBook", () => collection.bibles.fetch_book(versionId, book, "txt")).pipe(
      Effect.tap((contents) => readSource(() => contents.get_list()).pipe(Effect.flatMap(verseList))),
    ));
    return { collection, item, contents };
  });
  const htmlBook = (versionId: string, book: string) => Effect.gen(function*() {
    const { collection } = yield* resource(versionId, book);
    return yield* cache.get(JSON.stringify([versionId, book, "html"]), () => request("fetchBible.htmlBook", () => collection.bibles.fetch_book(versionId, book, "html")).pipe(
      Effect.tap((contents) => readSource(() => contents.get_list()).pipe(Effect.flatMap(decodeResponse(Schema.Array(Schema.Struct({ content: Schema.String })))))),
    ));
  });
  const books = (versionId: string) => cache.get(JSON.stringify([versionId, "books"]), () => Effect.gen(function*() {
    const { collection } = yield* resource(versionId);
    yield* request("fetchBible.extras", () => collection.bibles.fetch_translation_extras(versionId));
    return yield* readSource(() => collection.bibles.get_books(versionId));
  }));
  const effects: BibleDisplayProvider = {
    id: "fetch-bible", defaultVersionId: "eng_bsb",
    clearCache: cache.clear.pipe(Effect.andThen(Effect.sync(() => { client = new FetchClient(config); }))),
    listVersions: Effect.fn("fetchBible.listVersions")(function*() {
      const { collection, resources } = yield* catalog();
      return [...resources.values()].map((item) => ({
        ...version(item), languageName: collection.bibles.get_language(item.language)?.name_english,
      }));
    }),
    listBooks: Effect.fn("fetchBible.listBooks")(function*(versionId: string) {
      return (yield* books(versionId)).filter((book) => book.available).map((book) => ({ id: book.id.toUpperCase(), title: book.name_local || book.name_english }));
    }),
    listChapters: Effect.fn("fetchBible.listChapters")(function*(versionId: string, book: string) {
      const id = yield* bookId(book);
      const { contents } = yield* textBook(versionId, id.toLowerCase());
      return [...new Set(contents.get_list().map((verse) => verse.chapter))].map((number) => ({ number, passageId: `${book}.${number}` }));
    }),
    getPassageData: Effect.fn("fetchBible.getPassageData")(function*(versionId: string, passageId: string) {
      const { book, chapter, first, last } = yield* passageRange(passageId);
      const nativeBook = book.toLowerCase();
      const { collection, item, contents } = yield* textBook(versionId, nativeBook);
      const numbers = contents.get_list(chapter, 1, chapter).map((verse) => verse.verse);
      yield* validateVerses(numbers, first, last);
      let text = contents.get_passage(chapter, first ?? 1, chapter, last ?? numbers.at(-1)!, { attribute: false, headings: false, notes: false, verse_nums: false });
      // TXT conflates editorial headings with canonical Psalm superscriptions.
      // Native HTML identifies the latter as USFM descriptive titles (.fb-d).
      if (book === "PSA" && (first === undefined || first === 1)) {
        const html = yield* htmlBook(versionId, nativeBook);
        const titles: string[] = [];
        sanitizeHtml(html.get_verse(chapter, 1, { attribute: false }), {
          allowedTags: sanitizeHtml.defaults.allowedTags,
          allowedAttributes: { "*": ["class"] },
          exclusiveFilter: (frame) => {
            const classes = frame.attribs.class?.split(/\s+/) ?? [];
            if (classes.includes("fb-d")) { titles.push(frame.text.trim()); return true; }
            return frame.tag === "sup" || classes.includes("fb-note");
          },
        });
        if (titles.length) text = `${titles.join("\n")}\n\n${text}`;
      }
      const attribution = contents.get_attribution(item.licenses[0]).trim();
      if (!attribution) return yield* new ScriptureError({ code: "unavailable", message: "This Bible version has no display attribution." });
      const sourceUrl = collection.bibles.get_book_url(versionId, nativeBook, "txt");
      const name = (yield* books(versionId)).find((entry) => entry.id === nativeBook)!.name;
      const sourceLimitations = [
        { versions: ["eng_bstj", "eng_bstjb", "grc_lxx"], book: "EXO", firstChapter: 35, firstVerse: 1, lastChapter: 40, lastVerse: 38 },
        { versions: ["eng_bst", "eng_bstb", "eng_bstj", "eng_bstjb", "grc_bre", "grc_lxx"], book: "JER", firstChapter: 25, firstVerse: 14, lastChapter: 52, lastVerse: 34 },
      ].filter((limit) => limit.versions.includes(versionId)).map((limit) => ({
        kind: "source-trimming" as const,
        startPassageId: `${limit.book}.${limit.firstChapter}.${limit.firstVerse}`,
        endPassageId: `${limit.book}.${limit.lastChapter}.${limit.lastVerse}`,
        appliesToRequest: book === limit.book && chapter >= limit.firstChapter && chapter <= limit.lastChapter
          && (chapter !== limit.firstChapter || last === undefined || last >= limit.firstVerse)
          && (chapter !== limit.lastChapter || first === undefined || first <= limit.lastVerse),
      }));
      return {
        provider: "fetch-bible", source: { url: sourceUrl, versionId: item.id },
        requestedPassageId: passageId, passageId,
        reference: `${name} ${chapter}${first === undefined ? "" : `:${first}${last !== first ? `-${last}` : ""}`}`,
        text: text.trim(), version: { ...version(item), sourceLanguage: item.language },
        attribution: { text: `${attribution} · Source: fetch.bible`, urls: [item.attribution_url, ...item.licenses.map((license) => license.url), "https://fetch.bible/"].filter(Boolean) },
        licenses: item.licenses.map((license) => ({ name: license.name, url: license.url, restrictions: { ...license.restrictions } })),
        numbering: "kjv", sourceLimitations,
        display: { format: "text", whitespace: "pre-wrap", attributionPlacement: "after-passage", direction: item.direction, language: version(item).language, nativeHtml },
        instructions: [
          ...textInstructions(),
          { code: "fetch-bible-normalization", level: "notice", appliesTo: "all", text: "The official collection uses KJV-normalized numbering, retains empty verse slots, and contains only the Protestant 66-book canon. sourceLimitations identifies documented trimmed ranges for this edition and whether the request overlaps them, not why an individual verse is empty. This is not an exhaustive lossless-source guarantee.", urls: ["https://fetch.bible/content/", "https://fetch.bible/access/"] },
          { code: "fetch-bible-license", level: "required", appliesTo: "all", text: "Usage filtering does not verify legal permission. Check the returned licenses and restrictions for the selected translation, including commercial, derivative, attribution, and share-alike conditions.", urls: ["https://fetch.bible/legal/terms/"] },
          { code: "fetch-bible-native-html", level: "required", appliesTo: "html", text: "If you request native HTML through the display provider, apply its returned .fetch-bible container class and client stylesheet. The stylesheet separates notes from Scripture. Do not append inline attribution when displaying the separate attribution field.", urls: ["https://fetch.bible/access/client/"] },
        ],
      };
    }),
    getPassageDisplay: Effect.fn("fetchBible.getPassageDisplay")(function*(versionId: string, passageId: string) {
      const data = yield* effects.getPassageData(versionId, passageId);
      const { book, chapter, first, last } = yield* passageRange(passageId);
      const contents = yield* htmlBook(versionId, book.toLowerCase());
      const html = first === undefined ? contents.get_chapter(chapter, { attribute: false }) : contents.get_passage(chapter, first, chapter, last!, { attribute: false });
      return {
        html: sanitizeHtml(html, {
          allowedTags: sanitizeHtml.defaults.allowedTags,
          allowedAttributes: { "*": ["class", "data-c", "data-v", "dir", "lang"], a: ["href"] },
          allowedSchemes: ["http", "https"],
          exclusiveFilter: (frame) => frame.attribs.class?.split(/\s+/).includes("fb-note") || false,
        }),
        version: data.version, attribution: data.attribution.text,
        attributionHtml: `${attributionLink(data.attribution.text.replace(" · Source: fetch.bible", ""), data.licenses[0]?.url || "")} · Source: ${attributionLink("fetch.bible", "https://fetch.bible/")}`,
        direction: data.display.direction,
        containerAttributes: { ...nativeHtml.containerAttributes, lang: data.display.language || "" },
        stylesheets: nativeHtml.stylesheets,
      };
    }),
  };
  return withPromises(effects);
}
