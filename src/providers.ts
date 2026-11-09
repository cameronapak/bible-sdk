import { FreeUseBibleApi, type ApiTranslation, type ChapterVerse } from "free-use-bible-api";
import { Effect, Schema } from "effect";
import { ScriptureError, type BibleDisplayProvider, type BibleVersion } from "./data-types";
import { attributionLink, bookId, escapeHtml, passageRange, requestCache, SourceLanguage, textInstructions, validateVerses } from "./data-helpers";
import { decodeResponse, request, withPromises } from "./runtime";

export type { BibleVersion } from "./data-types";

/** Provider-owned HTML must be safe to insert into a shadow root. */
export type PassageDisplay = {
  html: string;
  version: BibleVersion;
  attribution: string;
  /** Optional safe HTML for linked attribution; plain attribution remains available. */
  attributionHtml?: string;
  direction?: "ltr" | "rtl";
  containerAttributes?: Readonly<Record<string, string>>;
  stylesheets?: readonly { kind: "bible" | "font"; href: string }[];
  /** Preserved for existing YouVersion scripture-load consumers. */
  yvpBibleVersion?: unknown;
};

/** Both built-in providers and custom providers use this contract. */
export interface BibleProvider {
  readonly id: string;
  readonly defaultVersionId: string;
  /** Native Effect operations, supplied by built-ins. Promise-only custom providers remain supported. */
  readonly effects?: BibleDisplayProvider;
  getPassage(versionId: string, passageId: string): Promise<PassageDisplay>;
  /** Optional for passage-only custom providers. Required by the version picker. */
  listVersions?(): Promise<BibleVersion[]>;
}

export type ProviderOptions = {
  /** Default: helloao. YouVersion must be selected explicitly. */
  provider?: "helloao" | "youversion" | BibleProvider;
  /** The selected provider's version ID, such as BSB for HelloAO. */
  bibleVersionId?: string;
  yvpPublicAppKey?: string;
  yvpBibleVersionId?: number;
  yvpApiHost?: string;
};

// Shared page defaults for standalone passages and version inputs.
export const providerDefaults: ProviderOptions = {};

const helloaoBooks = decodeResponse(Schema.Struct({ books: Schema.Array(Schema.Struct({
  id: Schema.NonEmptyString, name: Schema.String,
  firstChapterNumber: Schema.Int.check(Schema.isGreaterThan(0)),
  lastChapterNumber: Schema.Int.check(Schema.isGreaterThan(0)),
}).check(Schema.makeFilter((book) => book.lastChapterNumber >= book.firstChapterNumber))) }));
const catalogTranslation = Schema.Struct({
  id: Schema.NonEmptyString, name: Schema.String, language: SourceLanguage,
  shortName: Schema.optional(Schema.String), languageName: Schema.optional(Schema.String), languageEnglishName: Schema.optional(Schema.String),
});
const chapterContent = Schema.Array(Schema.Union([
  Schema.Struct({ type: Schema.Literal("verse"), number: Schema.Int, content: Schema.Array(Schema.Union([
    Schema.String,
    Schema.Struct({ text: Schema.String, poem: Schema.optional(Schema.Number), wordsOfJesus: Schema.optional(Schema.Boolean) }),
    Schema.Struct({ noteId: Schema.Number }), Schema.Struct({ heading: Schema.String }), Schema.Struct({ lineBreak: Schema.Literal(true) }),
  ])) }),
  Schema.Struct({ type: Schema.Literals(["heading", "hebrew_subtitle"]), content: Schema.Array(Schema.Union([Schema.String, Schema.Struct({ text: Schema.String }), Schema.Struct({ noteId: Schema.Number })])) }),
  Schema.Struct({ type: Schema.Literal("line_break") }),
]));
const helloaoChapter = decodeResponse(Schema.Struct({
  translation: Schema.Struct({
    id: Schema.NonEmptyString, name: Schema.String, licenseUrl: Schema.String,
    language: SourceLanguage, shortName: Schema.optional(Schema.String),
    textDirection: Schema.optional(Schema.Literals(["ltr", "rtl"])),
    licenseNotice: Schema.optional(Schema.NullOr(Schema.String)), licenseNotes: Schema.optional(Schema.NullOr(Schema.String)),
    license: Schema.optional(Schema.NullOr(Schema.Record(Schema.String, Schema.Union([Schema.Boolean, Schema.String])))),
  }),
  book: Schema.Struct({ name: Schema.String }),
  chapter: Schema.Struct({ content: chapterContent }),
}));
const youversionList = <S extends Schema.Constraint & { DecodingServices: never }>(item: S) => decodeResponse(Schema.Struct({ data: Schema.Array(item) }));

function helloaoAttribution(translation: Pick<ApiTranslation, "name" | "licenseNotice" | "licenseUrl">) {
  return {
    text: `${translation.licenseNotice || `${translation.name}. ${translation.licenseUrl}`} · Source: HelloAO Free Use Bible API`,
    html: `${translation.licenseNotice ? escapeHtml(translation.licenseNotice) : `${attributionLink(translation.name, translation.licenseUrl)}.`} · Source: ${attributionLink("HelloAO Free Use Bible API", "https://bible.helloao.org/docs/")}`,
  };
}

function inlineContent(content: readonly ChapterVerse["content"][number][], verseNumber?: number): string {
  let label = verseNumber === undefined ? "" : `<sup class="scripture-verse-number">${verseNumber}</sup> `;
  return content.map((item) => {
    if (typeof item === "string" || "text" in item) {
      const prefix = label;
      label = "";
      if (typeof item === "string") return prefix + escapeHtml(item);
      const text = escapeHtml(item.text);
      const words = item.wordsOfJesus ? `<span class="scripture-jesus">${text}</span>` : text;
      // A block poetry line must carry its verse number, not push it onto a line above.
      return item.poem !== undefined ? `<span class="scripture-poetry" style="--indent:${item.poem}">${prefix}${words}</span>` : prefix + words;
    }
    if ("heading" in item) return `<span class="scripture-heading">${escapeHtml(item.heading)}</span>`;
    if ("lineBreak" in item) return "<br>";
    // Notes are not displayed, matching the YouVersion adapter.
    return " ";
  }).join("");
}

export function createHelloAOProvider() {
  const api = new FreeUseBibleApi({ useCache: false });
  const cache = requestCache();
  const books = (versionId: string) => cache.get(JSON.stringify(["books", versionId]), () =>
    request("helloao.books", (signal) => api.getTranslationBooks(versionId, undefined, { signal })).pipe(Effect.flatMap(helloaoBooks)));
  const effectsChapter = (versionId: string, book: string, number: number) => cache.get(JSON.stringify(["chapter", versionId, book, number]), () =>
    request("helloao.chapter", (signal) => api.getTranslationBookChapter(versionId, book, number, undefined, { signal })).pipe(Effect.flatMap(helloaoChapter)));
  const effects: BibleDisplayProvider = {
    id: "helloao",
    defaultVersionId: "BSB",
    clearCache: cache.clear,
    listBooks: Effect.fn("helloao.listBooks")(function*(versionId) {
      const result = yield* books(versionId);
      return result.books.map((book) => ({ id: book.id, title: book.name }));
    }),
    listChapters: Effect.fn("helloao.listChapters")(function*(versionId, book) {
      yield* bookId(book);
      const result = yield* books(versionId);
      const available = result.books.find((item) => item.id === book);
      if (!available) return yield* new ScriptureError({ code: "unavailable", message: "Book is not available in this version." });
      return Array.from({ length: available.lastChapterNumber - available.firstChapterNumber + 1 }, (_, i) => {
        const number = available.firstChapterNumber + i;
        return { number, passageId: `${book}.${number}` };
      });
    }),
    getPassageData: Effect.fn("helloao.getPassageData")(function*(versionId, passageId) {
      const { book, chapter, first, last } = yield* passageRange(passageId);
      const result = yield* effectsChapter(versionId, book, chapter);
      const verses = result.chapter.content.filter((item) => item.type === "verse");
      yield* validateVerses(
        verses.map((verse) => verse.number),
        first,
        last,
      );
      let text = "";
      let selected = false;
      for (const item of result.chapter.content) {
        if (item.type === "verse") {
          selected = first === undefined || (item.number >= first && item.number <= last!);
          if (!selected) continue;
          if (text && !/\s$/.test(text)) text += " ";
          let poetry = false;
          for (const [index, part] of item.content.entries()) {
            if (typeof part === "string" || "text" in part) {
              const nextPoetry = typeof part !== "string" && part.poem !== undefined;
              if ((poetry || nextPoetry) && text && !text.endsWith("\n")) text = text.trimEnd() + "\n";
              poetry = nextPoetry;
            }
            if (typeof part === "string") text += part;
            else if ("text" in part) {
              text += part.text;
            } else if ("lineBreak" in part) text = text.trimEnd() + "\n";
            else if ("noteId" in part) {
              const next = item.content.slice(index + 1).find((part) => typeof part === "string" || "text" in part);
              const following = typeof next === "string" ? next : next && "text" in next ? next.text : "";
              if (text && !/\s$/.test(text) && following && !/^[\s,.;:!?…\)\]”’]/.test(following)) text += " ";
            }
          }
        } else if (item.type === "hebrew_subtitle" && (first === undefined || first === 1)) {
          text += item.content.map((part) => (typeof part === "string" ? part : "text" in part ? part.text : "lineBreak" in part ? "\n" : "")).join("") + "\n\n";
        } else if (item.type === "line_break" && selected) text = text.trimEnd() + "\n\n";
      }
      const translation = result.translation;
      return {
        provider: "helloao",
        source: { url: `${api.endpoint.replace(/\/$/, "")}/api/${encodeURIComponent(versionId)}/${book}/${chapter}.json`, versionId },
        requestedPassageId: passageId,
        passageId,
        reference: `${result.book.name} ${chapter}${first === undefined ? "" : `:${first}${last !== first ? `-${last}` : ""}`}`,
        text: text.trim(),
        version: {
          id: translation.id,
          title: translation.name,
          abbreviation: translation.shortName || translation.id,
          language: new Intl.Locale(translation.language).language,
          sourceLanguage: translation.language,
        },
        attribution: { text: helloaoAttribution(translation).text, urls: [translation.licenseUrl, "https://bible.helloao.org/docs/"].filter(Boolean) },
        licenses: translation.licenseUrl || translation.license ? [{ url: translation.licenseUrl, ...(translation.license ? { restrictions: { ...translation.license } } : {}) }] : [],
        numbering: "unknown",
        display: { format: "text", whitespace: "pre-wrap", attributionPlacement: "after-passage", direction: translation.textDirection, language: translation.language },
        instructions: [
          ...textInstructions(),
          ...(translation.licenseNotes ? [{ code: "translation-license-notes", level: "notice" as const, appliesTo: "all" as const, text: translation.licenseNotes }] : []),
        ],
      };
    }),
    listVersions: Effect.fn("helloao.listVersions")(function*() {
      const { translations } = yield* cache.get("translations", () => request("helloao.translations", (signal) => api.getAvailableTranslations(undefined, { signal })).pipe(Effect.tap(decodeResponse(Schema.Struct({ translations: Schema.Array(catalogTranslation) })))));
      return translations.map((translation) => ({
        id: translation.id,
        abbreviation: translation.shortName || translation.id,
        title: translation.name,
        language: new Intl.Locale(translation.language).language,
        languageName: translation.languageEnglishName || translation.languageName || translation.language,
      }));
    }),
    getPassageDisplay: Effect.fn("helloao.getPassageDisplay")(function*(versionId, passageId) {
      const range = yield* passageRange(passageId);
      const result = yield* effectsChapter(versionId, range.book, range.chapter);
      const chapterVerses = result.chapter.content.filter((item) => item.type === "verse");
      yield* validateVerses(chapterVerses.map((verse) => verse.number), range.first, range.last);
      const finalVerse = Math.max(...chapterVerses.map((verse) => verse.number));
      const first = range.first ?? 1;
      const last = range.last ?? finalVerse;

      // Keep a section heading only when its following verse is selected. Never include
      // text or headings belonging to the next section after the requested range.
      let heading = "";
      let html = "";
      let selected = false;
      for (const item of result.chapter.content) {
        if (item.type === "heading") heading += `<h3 class="scripture-heading">${escapeHtml(item.content.join(" "))}</h3>`;
        else if (item.type === "verse") {
          selected = item.number >= first && item.number <= last;
          if (selected) html += `${heading}<span class="scripture-verse">${inlineContent(item.content, item.number)}</span> `;
          heading = "";
        } else if (item.type === "hebrew_subtitle" && first === 1) {
          html += `<p class="scripture-subtitle">${inlineContent(item.content)}</p>`;
        } else if (item.type === "line_break" && selected) html += "<br>";
      }
      const translation = result.translation;
      const attribution = helloaoAttribution(translation);
      return {
        html,
        version: { id: translation.id, abbreviation: translation.shortName || translation.id, title: translation.name },
        attribution: attribution.text,
        attributionHtml: attribution.html,
        direction: translation.textDirection,
        containerAttributes: { class: "scripture-bible", lang: translation.language },
      };
    }),
  };
  return withPromises(effects);
}

export const helloaoProvider = createHelloAOProvider();

/** The SDK is loaded only when this provider is used. No YouVersion requests run by default. */
export function createYouVersionProvider({ yvpPublicAppKey, yvpApiHost }: Pick<ProviderOptions, "yvpPublicAppKey" | "yvpApiHost">) {
  const VersionId = Schema.String.check(Schema.isPattern(/^[1-9]\d*$/), Schema.makeFilter((id) => Number.isSafeInteger(Number(id)) || "Use a safe integer version ID."));
  const connection = Effect.fnUntraced(function*(versionId?: string) {
    if (!yvpPublicAppKey) return yield* new ScriptureError({ code: "authentication", message: "The YouVersion provider needs a public app key." });
    if (versionId !== undefined) yield* Schema.decodeUnknownEffect(VersionId)(versionId).pipe(Effect.mapError((cause) => new ScriptureError({ code: "unavailable", message: "Set a positive YouVersion Bible version ID.", cause })));
    const sdk = yield* request("youversion.loadSdk", () => import("@youversion/platform-core"));
    return { sdk, client: new sdk.ApiClient({ appKey: yvpPublicAppKey, apiHost: yvpApiHost }) };
  });
  const effects: BibleDisplayProvider = {
    id: "youversion",
    defaultVersionId: "3034",
    clearCache: Effect.void,
    listBooks: Effect.fn("youversion.listBooks")(function*(versionId) {
      const { sdk, client } = yield* connection(versionId);
      const books = yield* request("youversion.books", () => sdk.getBooks(client, Number(versionId))).pipe(Effect.tap(youversionList(Schema.Struct({ id: Schema.String, title: Schema.String }))));
      return books.data.map((book) => ({ id: book.id, title: book.title }));
    }),
    listChapters: Effect.fn("youversion.listChapters")(function*(versionId, book) {
      yield* bookId(book);
      const { sdk, client } = yield* connection(versionId);
      const chapters = yield* request("youversion.chapters", () => sdk.getChapters(client, Number(versionId), book)).pipe(Effect.tap(youversionList(Schema.Struct({ id: Schema.String, passage_id: Schema.String }))));
      return chapters.data.map((chapter) => ({ number: Number(chapter.id), passageId: chapter.passage_id }));
    }),
    getPassageData: Effect.fn("youversion.getPassageData")(function*(versionId, passageId) {
      const { book, chapter, first, last } = yield* passageRange(passageId);
      const { sdk, client } = yield* connection(versionId);
      const verses = yield* request("youversion.verses", () => sdk.getVerses(client, Number(versionId), book, chapter)).pipe(Effect.tap(youversionList(Schema.Struct({ id: Schema.String }))));
      yield* validateVerses(verses.data.map((verse) => Number(verse.id)), first, last);
      const [passage, version] = yield* Effect.all([
        request("youversion.text", () => sdk.getPassage(client, Number(versionId), passageId, "text", false, false)).pipe(Effect.tap(decodeResponse(Schema.Struct({ id: Schema.String, reference: Schema.String, content: Schema.String })))),
        request("youversion.version", () => sdk.getVersion(client, Number(versionId))).pipe(Effect.tap(decodeResponse(Schema.Struct({ id: Schema.Number, localized_title: Schema.String, localized_abbreviation: Schema.String, language_tag: Schema.String })))),
      ], { concurrency: 2 });
      const attribution = sdk.getPassageAttribution(version);
      if (!attribution) return yield* new ScriptureError({ code: "unavailable", message: "This Bible version has no display attribution." });
      return {
        provider: "youversion", source: { url: `https://${yvpApiHost || "api.youversion.com"}/v1`, versionId },
        requestedPassageId: passageId, passageId: passage.id, reference: passage.reference, text: passage.content,
        version: { id: String(version.id), title: version.localized_title, abbreviation: version.localized_abbreviation, language: version.language_tag, sourceLanguage: version.language_tag },
        attribution: { text: `${attribution.text} · Source: YouVersion Platform`, urls: [version.publisher_url, "https://developers.youversion.com/"].filter((url): url is string => !!url) },
        licenses: [], numbering: "unknown",
        display: {
          format: "text", whitespace: "pre-wrap", attributionPlacement: "after-passage", language: version.language_tag,
          nativeHtml: { containerAttributes: sdk.BIBLE_CONTAINER_ATTRIBUTES, stylesheets: sdk.getBibleStylesheets({ appKey: yvpPublicAppKey!, apiHost: yvpApiHost }) },
        },
        instructions: [
          ...textInstructions(),
          { code: "youversion-commercial-use", level: "required", appliesTo: "all", text: "YouVersion has no commercial-use flag. Its Platform terms do not grant Bible-content rights: confirm the selected publisher's license and applicable Tool terms before commercial use. Paid applications must conspicuously state that the YouVersion Bible App is free. fetch.bible usage settings do not apply to YouVersion.", urls: ["https://platform.youversion.com/terms"] },
          { code: "youversion-ai-use", level: "required", appliesTo: "all", text: "YouVersion prohibits using its Tools with AI for open-ended user chat, except to retrieve and display Scripture verbatim, word-for-word and unaltered. Do not use the Tools to train, develop, refine, or improve AI. Cases beyond the expressly permitted uses require prior written YouVersion approval. The terms separately permit AI-assisted engineering and content generation subject to their stated conditions; review the full terms.", urls: ["https://platform.youversion.com/terms"] },
          { code: "youversion-terms", level: "required", appliesTo: "all", text: "Follow your YouVersion account and content agreements. This SDK does not establish persistent caching or offline rights. Attribution is refreshed on every data request.", urls: ["https://developers.youversion.com/sdks/javascript/guides/copyright-and-attribution"] },
          { code: "youversion-native-html", level: "required", appliesTo: "html", text: "If you request native HTML through the display provider, apply its returned containerAttributes and stylesheets. Load Untitled Serif from the YouVersion Fonts API; do not download or self-host its font files. These HTML resources are not required to interpret the plain-text result.", urls: ["https://developers.youversion.com/guides/display-bible-html"] },
        ],
      };
    }),
    listVersions: Effect.fn("youversion.listVersions")(function*() {
      const { sdk: { getVersions }, client } = yield* connection();
      const languages = new Intl.DisplayNames(["en"], { type: "language" });
      const versions: BibleVersion[] = [];
      const seen = new Set<string>();
      let pageToken: string | null = null;
      do {
        const page = yield* request("youversion.versions", () => getVersions(client, "*", undefined, {
          page_size: 99,
          page_token: pageToken || undefined,
          fields: ["id", "localized_abbreviation", "localized_title", "language_tag"],
        })).pipe(Effect.tap(youversionList(Schema.Struct({ id: Schema.Number, localized_abbreviation: Schema.String, localized_title: Schema.String, language_tag: SourceLanguage }))));
        versions.push(...page.data.map((version) => ({
          id: String(version.id), abbreviation: version.localized_abbreviation, title: version.localized_title,
          language: version.language_tag, languageName: languages.of(version.language_tag),
        })));
        pageToken = page.next_page_token;
        if (pageToken && seen.has(pageToken)) return yield* new ScriptureError({ code: "invalid_response", message: "Bible provider repeated a catalog page token." });
        if (pageToken) seen.add(pageToken);
      } while (pageToken);
      return versions;
    }),
    getPassageDisplay: Effect.fn("youversion.getPassageDisplay")(function*(versionId, passageId) {
      yield* passageRange(passageId);
      const { sdk: { getPassageDisplay }, client } = yield* connection(versionId);
      const display = yield* request("youversion.html", () => getPassageDisplay(client, {
        versionId: Number(versionId), passageId, includeHeadings: true, includeNotes: false,
      }));
      return {
        ...display,
        version: { id: String(display.version.id), abbreviation: display.version.localized_abbreviation, title: display.version.localized_title },
        attribution: `${display.attribution.text} · Source: YouVersion Platform`,
        attributionHtml: `${escapeHtml(display.attribution.text)} · Source: ${attributionLink("YouVersion Platform", "https://developers.youversion.com/")}`,
        yvpBibleVersion: display.version,
      };
    }),
  };
  return withPromises(effects);
}

const youversionProviders = new Map<string, BibleProvider>();

export function resolveProvider(options: ProviderOptions): BibleProvider {
  if (typeof options.provider === "object") return options.provider;
  if (!options.provider || options.provider === "helloao") return helloaoProvider;
  if (options.provider !== "youversion") throw new ScriptureError({ code: "unsupported", message: `Unknown Bible provider: ${options.provider}` });
  const key = JSON.stringify([options.yvpPublicAppKey, options.yvpApiHost]);
  let provider = youversionProviders.get(key);
  if (!provider) {
    provider = createYouVersionProvider(options);
    youversionProviders.set(key, provider);
  }
  return provider;
}

export const resolveProviderEffect = (options: ProviderOptions) => Effect.try({ try: () => resolveProvider(options), catch: (cause) => cause instanceof ScriptureError ? cause : new ScriptureError({ code: "unsupported", message: "Invalid Bible provider configuration.", cause }) });

const catalogs = new WeakMap<BibleProvider, ReturnType<typeof requestCache>>();

export const listBibleVersionsEffect = Effect.fn("scripture.listBibleVersions")(function*(options: ProviderOptions = {}) {
  const provider = yield* resolveProviderEffect({ ...providerDefaults, ...options });
  if (!provider.listVersions) return yield* new ScriptureError({ code: "unsupported", message: "This Bible provider does not support listing versions." });
  let cache = catalogs.get(provider);
  if (!cache) catalogs.set(provider, cache = requestCache());
  return yield* cache.get("versions", () => provider.effects?.listVersions() ?? request("custom.listVersions", () => provider.listVersions!(), false));
});

/** Lists versions available from the configured provider, never a cross-provider guess. */
export function listBibleVersions(options: ProviderOptions = {}): Promise<BibleVersion[]> {
  return Effect.runPromise(listBibleVersionsEffect(options));
}

// Cache by provider identity as well as version and passage. Rejected requests can retry.
const displays = new WeakMap<BibleProvider, ReturnType<typeof requestCache>>();
export const fetchDisplayEffect = Effect.fn("scripture.fetchDisplay")(function*(provider: BibleProvider, versionId: string, passageId: string) {
  let cache = displays.get(provider);
  if (!cache) displays.set(provider, cache = requestCache());
  const key = JSON.stringify([versionId, passageId]);
  return yield* cache.get(key, () => provider.effects?.getPassageDisplay(versionId, passageId) ?? request("custom.getPassage", () => provider.getPassage(versionId, passageId), false));
});

export function fetchDisplay(provider: BibleProvider, versionId: string, passageId: string): Promise<PassageDisplay> {
  return Effect.runPromise(fetchDisplayEffect(provider, versionId, passageId));
}
