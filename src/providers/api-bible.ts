import { Clock, Effect, Schema } from "effect";
import sanitizeHtml from "sanitize-html";
import { ScriptureError, type BibleDisplayProvider } from "../data-types.js";
import { bookId, escapeHtml, passageRange, requestCache, SourceLanguage, textInstructions } from "../data-helpers.js";
import { request } from "../runtime.js";

const rendering = {
  contentType: "json", includeTitles: true, includeNotes: false,
  includeChapterNumbers: false, includeVerseNumbers: false,
} as const;
type Rendering = Omit<typeof rendering, "contentType" | "includeVerseNumbers"> & {
  contentType: "json" | "html";
  includeVerseNumbers: boolean;
  includeVerseSpans?: boolean;
};

/** The official createBibleClient result satisfies this structural contract. */
export interface ApiBibleClient {
  bibles: {
    list(params: { includeFullDetails: boolean }, signal?: AbortSignal): Promise<unknown>;
    get(id: string, signal?: AbortSignal): Promise<unknown>;
  };
  books: { list(id: string, params: undefined, signal?: AbortSignal): Promise<unknown> };
  chapters: {
    list(id: string, book: string, signal?: AbortSignal): Promise<unknown>;
    get(id: string, chapter: string, params: Rendering, signal?: AbortSignal): Promise<unknown>;
  };
  passages: { get(id: string, passage: string, params: Rendering, signal?: AbortSignal): Promise<unknown> };
}

const sourceUrl = "https://api.bible/";
const termsUrl = "https://api.bible/terms-and-conditions";
const ttl = "14 days";
const ttlMillis = 14 * 24 * 60 * 60 * 1000;
const nullableText = Schema.optional(Schema.NullOr(Schema.String));
const Bible = Schema.Struct({
  id: Schema.NonEmptyString, name: Schema.String, nameLocal: nullableText,
  abbreviation: Schema.String, abbreviationLocal: nullableText,
  language: Schema.Struct({ id: SourceLanguage, name: Schema.String, scriptDirection: nullableText }),
  copyright: nullableText, info: nullableText,
});
const attrs = Schema.Struct({ style: Schema.optional(Schema.String), verseId: Schema.optional(Schema.String) });
type Node = { readonly type: "text"; readonly text: string; readonly attrs?: typeof attrs.Type }
  | { readonly type: "tag"; readonly name: string; readonly attrs?: typeof attrs.Type; readonly items: readonly Node[] };
const Node: Schema.Codec<Node> = Schema.suspend(() => Schema.Union([
  Schema.Struct({ type: Schema.Literal("text"), text: Schema.String, attrs: Schema.optional(attrs) }),
  Schema.Struct({ type: Schema.Literal("tag"), name: Schema.String, attrs: Schema.optional(attrs), items: Schema.Array(Node) }),
]));
const Content = Schema.Struct({
  data: Schema.Struct({
    id: Schema.NonEmptyString, bibleId: Schema.NonEmptyString, reference: Schema.NonEmptyString,
    copyright: Schema.NonEmptyString, content: Schema.Array(Node),
  }),
  meta: Schema.Struct({ fumsToken: Schema.NonEmptyString }),
});
const HtmlContent = Schema.Struct({
  data: Schema.Struct({
    id: Schema.NonEmptyString, bibleId: Schema.NonEmptyString, reference: Schema.NonEmptyString,
    copyright: Schema.NonEmptyString, content: Schema.NonEmptyString,
  }),
  meta: Schema.Struct({ fumsToken: Schema.NonEmptyString }),
});
const scriptureStyles = "https://cdn.jsdelivr.net/gh/americanbible/scripture-styles@c82a1c7aa888963259bb925c4a61a082a54b6c9e/dist/css/scripture-styles.css";
const plainNotice = (html: string) => sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
  .replace(/&(?:amp|lt|gt);/g, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">" })[entity]!);
const version = (bible: typeof Bible.Type) => ({
  id: bible.id, title: bible.nameLocal || bible.name,
  abbreviation: bible.abbreviationLocal || bible.abbreviation,
  language: new Intl.Locale(bible.language.id).language, languageName: bible.language.name,
});
const invalid = () => new ScriptureError({ code: "invalid_response", message: "API.Bible returned incomplete or inconsistent passage data." });
const response = <S extends Schema.Constraint & { DecodingServices: never }>(schema: S) => (value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(invalid));

// SDK diagnostics can contain response bodies or a custom transport's credentials.
// Retain only a classified error, never the original message, body, or cause.
const upstreamError = (cause: unknown) => {
  const status = Schema.decodeUnknownOption(Schema.Struct({ statusCode: Schema.Number }))(cause);
  const name = Schema.decodeUnknownOption(Schema.Struct({ name: Schema.String }))(cause);
  const n = status._tag === "Some" ? status.value.statusCode : 0;
  const code = name._tag === "Some" && name.value.name === "ValidationError" ? "invalid_response"
    : n === 401 || n === 403 ? "authentication" : n === 429 ? "rate_limit"
    : n >= 400 && n < 500 ? "unavailable" : "network";
  return new ScriptureError({ code, message: `API.Bible request failed (${code}).` });
};
const load = <A>(operation: string, read: (signal: AbortSignal) => Promise<A>) => request(operation, async (signal) => {
  try { return await read(signal); } catch (cause) { throw upstreamError(cause); }
});

/** Compact only a repeated same-chapter prefix, never organizational verse IDs. */
const compactId = (id: string) => id.replace(/^([A-Z0-9]{3}\.[1-9]\d*\.)([1-9]\d*)-\1([1-9]\d*)$/, "$1$2-$3");

const validateCoverage = Effect.fnUntraced(function*(verseIds: Set<string>, passageId: string) {
  const { book, chapter, first, last } = yield* passageRange(passageId);
  const coverage: { first: number; last: number }[] = [];
  for (const verseId of verseIds) {
    const range = yield* passageRange(compactId(verseId)).pipe(Effect.mapError(invalid));
    if (range.book !== book || range.chapter !== chapter || range.first === undefined
      || (first !== undefined && (range.first < first || range.last! > last!))) return yield* invalid();
    coverage.push({ first: range.first, last: range.last! });
  }
  const covers = (n: number) => coverage.some((range) => range.first <= n && range.last >= n);
  if (!coverage.length || (first !== undefined && (!covers(first) || !covers(last!)))) {
    return yield* new ScriptureError({ code: "unavailable", message: "API.Bible did not return the requested coverage; passages may be limited to 200 verses." });
  }
});

function scriptureText(nodes: readonly Node[]) {
  const verseIds = new Set<string>();
  const visit = (node: Node): string => {
    if (node.type === "text") {
      if (node.attrs?.verseId) verseIds.add(node.attrs.verseId);
      return node.text;
    }
    const style = node.attrs?.style ?? "";
    if (node.name === "note" || node.name === "verse" || node.name === "chapter"
      || /^(?:s\d*|sp|qa|ms\d*|mr|r|sr|mt\d*|mte\d*|cl|cp|cd|v|c|f\w*|x\w*)$/.test(style)) return "";
    const text = node.items.map(visit).join("");
    if (node.name !== "para") return text;
    return text + (/^q[rmc]?\d*$/.test(style) ? "\n" : "\n\n");
  };
  return { text: nodes.map(visit).join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), verseIds };
}

/**
 * Server-only data and display adapter. Each application supplies its own official SDK
 * client, configured with its private key and retry: { maxAttempts: 1 }.
 * Fetching does not report a display. The host must report every actual web view.
 */
export function createApiBibleProvider({ client, defaultVersionId, copyrightUrl }: {
  client: ApiBibleClient;
  defaultVersionId: string;
  /** App-owned page preserving full publisher notices and rights-holder links. Required for display. */
  copyrightUrl?: string;
}): BibleDisplayProvider {
  if (typeof window !== "undefined") throw new ScriptureError({ code: "unsupported", message: "API.Bible requires a server-side client. Never expose its private key in a browser." });
  if (copyrightUrl !== undefined && !/^https?:$/.test(new URL(copyrightUrl, "https://example.invalid").protocol)) {
    throw new ScriptureError({ code: "unsupported", message: "Use an HTTP(S) or relative copyright page URL." });
  }
  const cache = requestCache(ttl);
  const details = (id: string) => cache.get(id, () => Effect.gen(function*() {
    const fetchedAt = yield* Clock.currentTimeMillis;
    const { data } = yield* load("apiBible.version", (signal) => client.bibles.get(id, signal)).pipe(
      Effect.flatMap(response(Schema.Struct({ data: Bible }))),
    );
    if (data.id !== id || !data.copyright?.trim()) return yield* invalid();
    return { data, expiresAt: fetchedAt + ttlMillis };
  }));
  return {
    id: "api-bible", defaultVersionId, cacheTimeToLive: ttl, clearCache: cache.clear,
    listVersions: Effect.fn("apiBible.listVersions")(function*() {
      const { data } = yield* load("apiBible.versions", (signal) => client.bibles.list({ includeFullDetails: true }, signal)).pipe(
        Effect.flatMap(response(Schema.Struct({ data: Schema.Array(Bible) }))),
      );
      return data.map(version);
    }),
    listBooks: Effect.fn("apiBible.listBooks")(function*(id: string) {
      const { data } = yield* load("apiBible.books", (signal) => client.books.list(id, undefined, signal)).pipe(
        Effect.flatMap(response(Schema.Struct({ data: Schema.Array(Schema.Struct({ id: Schema.NonEmptyString, name: Schema.String })) }))),
      );
      return data.map((book) => ({ id: book.id, title: book.name }));
    }),
    listChapters: Effect.fn("apiBible.listChapters")(function*(id: string, book: string) {
      yield* bookId(book);
      const { data } = yield* load("apiBible.chapters", (signal) => client.chapters.list(id, book, signal)).pipe(
        Effect.flatMap(response(Schema.Struct({ data: Schema.Array(Schema.Struct({ id: Schema.String, number: Schema.String })) }))),
      );
      const chapters = [];
      for (const chapter of data) {
        if (chapter.number === "intro") continue;
        const range = yield* passageRange(chapter.id).pipe(Effect.mapError(invalid));
        if (range.book !== book || range.first !== undefined || String(range.chapter) !== chapter.number) return yield* invalid();
        chapters.push({ passageId: chapter.id, number: range.chapter });
      }
      return chapters;
    }),
    getPassageData: Effect.fn("apiBible.getPassageData")(function*(id: string, passageId: string) {
      const { book, chapter, first, last } = yield* passageRange(passageId);
      const { data: bible, expiresAt } = yield* details(id);
      const nativeId = `${book}.${chapter}${first === undefined ? "" : `.${first}${last !== first ? `-${book}.${chapter}.${last}` : ""}`}`;
      const { data, meta } = yield* load("apiBible.passage", (signal) => first === undefined
        ? client.chapters.get(id, nativeId, rendering, signal)
        : client.passages.get(id, nativeId, rendering, signal)).pipe(Effect.flatMap(response(Content)));
      if (data.bibleId !== id || compactId(data.id) !== compactId(nativeId)) return yield* invalid();
      const { text, verseIds } = scriptureText(data.content);
      yield* validateCoverage(verseIds, passageId);
      return {
        provider: "api-bible", source: { url: sourceUrl, versionId: id },
        requestedPassageId: passageId, passageId: compactId(data.id), reference: data.reference, text,
        version: { ...version(bible), sourceLanguage: bible.language.id },
        attribution: { text: `${plainNotice(data.copyright)} · ${version(bible).abbreviation} · Source: API.Bible`, urls: [sourceUrl, termsUrl] },
        publisher: { copyrightHtml: bible.copyright!, infoHtml: bible.info ?? "" },
        reporting: { kind: "api-bible-fums", token: meta.fumsToken }, cache: { expiresAt },
        licenses: [{ url: termsUrl }], numbering: "unknown",
        display: {
          format: "text", whitespace: "pre-wrap", attributionPlacement: "after-passage",
          direction: bible.language.scriptDirection === "rtl" ? "rtl" : bible.language.scriptDirection === "ltr" ? "ltr" : undefined,
          language: version(bible).language,
        },
        instructions: [
          ...textInstructions(),
          { code: "api-bible-html", level: "notice", appliesTo: "all", text: "For rich web display, use this provider's server-side getPassageDisplay and send its safe display to the passage component through your own endpoint. It preserves native USX HTML and loads the optional official Scripture Styles stylesheet. Plain text cannot reproduce that formatting. Publisher-specific formatting and citation agreements take precedence.", urls: ["https://docs.api.bible/resources/scripture-styling/"] },
          { code: "api-bible-fums", level: "required", appliesTo: "all", text: "For web displays, report reporting.token for each actual view, including cache hits. Fetching or prefetching is not a view. The host owns anonymous device/session identifiers and reporting; native-only exemptions do not cover web views.", urls: ["https://care.api.bible/article/417-understanding-fums"] },
          { code: "api-bible-publisher", level: "required", appliesTo: "all", text: "Every quotation page must identify the translation and link to its full copyright information. Preserve the exact current publisher notice, full translation name/abbreviation, additional information, and a clickable rights-holder link there; check the applicable dashboard/Appendix A citation. publisher.copyrightHtml and infoHtml are untrusted HTML: sanitize before rendering, never insert directly. Applicable direct publisher formatting/citation agreements take precedence; resolve conflicts with API.Bible's remaining minimum requirements before use. Keep the visible API.Bible source link.", urls: [termsUrl] },
          { code: "api-bible-cache", level: "required", appliesTo: "all", text: "cache.expiresAt is an epoch-millisecond refresh deadline, not permission for offline storage. Refresh downstream caches by that deadline. Never retain metadata or content over 30 days without refresh. Honor removal/revocation requests immediately or within their specified shorter deadline.", urls: ["https://care.api.bible/article/401-caching-content", termsUrl] },
          { code: "api-bible-usage", level: "required", appliesTo: "all", text: "Each application needs its own private server key and applicable plan and translation licenses. The host must satisfy DRM, print/device/territory limits, content integrity, account agreements, and removal duties. A working key or this adapter does not establish compliance. Starter is noncommercial even for public-domain text.", urls: [termsUrl] },
          { code: "api-bible-ai", level: "required", appliesTo: "all", text: "Do not send copyrighted or Creative Commons Scripture to an LLM as prompt context or training data without the required permissions. Public-domain runtime prompts are permitted; confirm training and audio/export permissions separately.", urls: ["https://care.api.bible/article/405-express-licensing-faqs", termsUrl] },
        ],
      };
    }),
    getPassageDisplay: Effect.fn("apiBible.getPassageDisplay")(function*(id: string, passageId: string) {
      if (!copyrightUrl) return yield* new ScriptureError({ code: "unsupported", message: "Set copyrightUrl to your app's full publisher copyright page before displaying API.Bible Scripture." });
      const { book, chapter, first, last } = yield* passageRange(passageId);
      const { data: bible, expiresAt } = yield* details(id);
      const nativeId = `${book}.${chapter}${first === undefined ? "" : `.${first}${last !== first ? `-${book}.${chapter}.${last}` : ""}`}`;
      const params: Rendering = { ...rendering, contentType: "html", includeVerseNumbers: true, includeVerseSpans: true };
      const { data, meta } = yield* load("apiBible.passageDisplay", (signal) => first === undefined
        ? client.chapters.get(id, nativeId, params, signal)
        : client.passages.get(id, nativeId, params, signal)).pipe(Effect.flatMap(response(HtmlContent)));
      if (data.bibleId !== id || compactId(data.id) !== compactId(nativeId)) return yield* invalid();
      const verseIds = new Set<string>();
      const html = sanitizeHtml(data.content, {
        allowedTags: ["p", "span", "sup", "br", "div", "section", "h1", "h2", "h3", "h4", "h5", "h6", "em", "strong", "i", "b", "table", "thead", "tbody", "tfoot", "tr", "th", "td"],
        allowedAttributes: { "*": ["class", "dir", "lang", "data-verse-id", "data-verse-org-ids", "data-number", "data-sid", "data-vid"], th: ["colspan", "rowspan"], td: ["colspan", "rowspan"] },
        transformTags: { "*": (tagName, attribs) => {
          if (tagName === "span" && attribs["data-verse-id"]) verseIds.add(attribs["data-verse-id"]);
          return { tagName, attribs };
        } },
      });
      yield* validateCoverage(verseIds, passageId);
      const notice = plainNotice(data.copyright);
      const label = version(bible).abbreviation || version(bible).title;
      return {
        html, version: version(bible),
        attribution: `${notice} · ${label} · Copyright information · Source: API.Bible`,
        attributionHtml: `${escapeHtml(notice)} · ${escapeHtml(label)} · <a href="${escapeHtml(copyrightUrl)}">Copyright information</a> · Source: <a href="${sourceUrl}">API.Bible</a>`,
        direction: bible.language.scriptDirection === "rtl" ? "rtl" : bible.language.scriptDirection === "ltr" ? "ltr" : undefined,
        containerAttributes: { class: "scripture-bible api-bible scripture-styles", lang: version(bible).language },
        stylesheets: [{ kind: "bible", href: scriptureStyles }],
        reporting: { kind: "api-bible-fums", token: meta.fumsToken }, cache: { expiresAt },
      };
    }),
  };
}
