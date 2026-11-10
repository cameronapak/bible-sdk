import { Clock, Effect, Layer, Schema } from "effect";
import { createAOLabProvider, aoLabProvider, type BibleProvider } from "./providers.js";
import { BibleBook, BibleChapter, BibleSource, BibleVersion, CalendarDate, DailyVerseReference, ScriptureError, ScripturePassage, VerseOfTheDay, type BibleDataProvider, type VerseOfTheDayOptions } from "./data-types.js";
import { bookId, passageRange, requestCache } from "./data-helpers.js";
import { decodeResponse as response, request } from "./runtime.js";

export { BibleBook, BibleChapter, BibleSource, BibleVersion, DailyVerseReference, DisplayInstruction, ScriptureError, ScriptureErrorCode, ScripturePassage, VerseOfTheDay } from "./data-types.js";
export type { BibleDataProvider, BibleDisplayProvider, VerseOfTheDayOptions } from "./data-types.js";
export { RequestPolicy } from "./runtime.js";

const VersionId = Schema.NonEmptyString.check(Schema.isTrimmed());
const version = (provider: BibleDataProvider, value?: string) => Schema.decodeUnknownEffect(VersionId)(value ?? provider.defaultVersionId).pipe(
  Effect.mapError((cause) => new ScriptureError({ code: "unavailable", message: "Set a provider-specific version ID.", cause })),
);
/** Service-based programs can use a test or application Layer without constructing a client. */
export const scripture = {
  listVersions: Effect.fn("scripture.listVersions")(function*() {
    const source = yield* BibleSource;
    return yield* source.listVersions().pipe(Effect.flatMap(response(Schema.Array(BibleVersion))));
  }),
  listBooks: Effect.fn("scripture.listBooks")(function*({ versionId }: { versionId?: string } = {}) {
    const source = yield* BibleSource;
    const id = yield* version(source, versionId);
    return yield* source.listBooks(id).pipe(Effect.flatMap(response(Schema.Array(BibleBook))));
  }),
  listChapters: Effect.fn("scripture.listChapters")(function*({ versionId, bookId: book }: { versionId?: string; bookId: string }) {
    const source = yield* BibleSource;
    const id = yield* version(source, versionId);
    yield* bookId(book);
    return yield* source.listChapters(id, book).pipe(Effect.flatMap(response(Schema.Array(BibleChapter))));
  }),
  getPassage: Effect.fn("scripture.getPassage")(function*({ versionId, passageId }: { versionId?: string; passageId: string }) {
    yield* passageRange(passageId);
    const source = yield* BibleSource;
    const id = yield* version(source, versionId);
    return yield* source.getPassageData(id, passageId).pipe(Effect.flatMap(response(ScripturePassage)));
  }),
  getVerseOfTheDay: Effect.fn("scripture.getVerseOfTheDay")(function*({ versionId, date, calendarSource = "provider" }: VerseOfTheDayOptions = {}) {
    const now = new Date(yield* Clock.currentTimeMillis);
    const calendarDate = yield* Schema.decodeUnknownEffect(CalendarDate)(date ?? `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`).pipe(
      Effect.mapError((cause) => new ScriptureError({ code: "invalid_reference", message: "Use a valid YYYY-MM-DD calendar date.", cause })),
    );
    const source = yield* BibleSource;
    const id = yield* version(source, versionId);
    yield* Schema.decodeUnknownEffect(Schema.Literals(["provider", "ao-lab", "helloao"]))(calendarSource).pipe(
      Effect.mapError((cause) => new ScriptureError({ code: "unsupported", message: "Select the provider's calendar or AO Lab's calendar with calendarSource: 'ao-lab'.", cause })),
    );
    const calendar = calendarSource === "provider" ? source : aoLabProvider.effects;
    if (!calendar.getVerseOfTheDay) return yield* new ScriptureError({ code: "unsupported", message: "This provider has no native daily verse calendar. Set calendarSource: 'ao-lab' to opt into AO Lab's reference calendar." });
    const selected = yield* calendar.getVerseOfTheDay(calendarDate).pipe(Effect.flatMap(response(DailyVerseReference)));
    const range = yield* passageRange(selected.passageId).pipe(Effect.mapError((cause) => new ScriptureError({ code: "invalid_response", message: "The daily verse calendar returned an invalid passage ID.", cause })));
    if (range.first === undefined) return yield* new ScriptureError({ code: "invalid_response", message: "The daily verse calendar must select a verse or same-chapter range." });
    const passage = yield* source.getPassageData(id, selected.passageId);
    return yield* response(VerseOfTheDay)({ date: calendarDate, calendarSource: { provider: calendar.id, sourceUrl: selected.sourceUrl }, passage });
  }),
  clearCache: Effect.gen(function*() { yield* (yield* BibleSource).clearCache; }),
};

/** One source per client. Effects are lazy; run them at the application boundary. */
export function createScriptureClient({ provider = createAOLabProvider() }: { provider?: BibleProvider | BibleDataProvider } = {}) {
  const unsupported = () => Effect.fail(new ScriptureError({ code: "unsupported", message: "This provider does not support this data operation." }));
  const source: BibleDataProvider = "getPassageData" in provider ? provider : provider.effects ?? {
    id: provider.id, defaultVersionId: provider.defaultVersionId,
    listVersions: () => provider.listVersions ? request("custom.listVersions", () => provider.listVersions!(), false) : unsupported(),
    listBooks: unsupported, listChapters: unsupported, getPassageData: unsupported, clearCache: Effect.void,
  };
  const cache = requestCache(source.cacheTimeToLive);
  const layer = Layer.succeed(BibleSource, {
    id: source.id,
    defaultVersionId: source.defaultVersionId,
    cacheTimeToLive: source.cacheTimeToLive,
    listVersions: () => cache.get("versions", () => source.listVersions().pipe(Effect.tap(response(Schema.Array(BibleVersion))))),
    listBooks: (id) => cache.get(JSON.stringify(["books", id]), () => source.listBooks(id).pipe(Effect.tap(response(Schema.Array(BibleBook))))),
    listChapters: (id, book) => cache.get(JSON.stringify(["chapters", id, book]), () => source.listChapters(id, book).pipe(Effect.tap(response(Schema.Array(BibleChapter))))),
    getPassageData: (id, passageId) => source.getPassageData(id, passageId),
    getVerseOfTheDay: source.getVerseOfTheDay ? (date) => source.getVerseOfTheDay!(date) : undefined,
    clearCache: cache.clear.pipe(Effect.andThen(source.clearCache)),
  });
  return {
    provider: source.id, layer,
    capabilities: { verseOfTheDay: typeof source.getVerseOfTheDay === "function" },
    listVersions: () => scripture.listVersions().pipe(Effect.provide(layer)),
    listBooks: (options: { versionId?: string } = {}) => scripture.listBooks(options).pipe(Effect.provide(layer)),
    listChapters: (options: { versionId?: string; bookId: string }) => scripture.listChapters(options).pipe(Effect.provide(layer)),
    getPassage: (options: { versionId?: string; passageId: string }) => scripture.getPassage(options).pipe(Effect.provide(layer)),
    getVerseOfTheDay: (options: VerseOfTheDayOptions = {}) => scripture.getVerseOfTheDay(options).pipe(Effect.provide(layer)),
    clearCache: () => scripture.clearCache.pipe(Effect.provide(layer)),
  };
}
