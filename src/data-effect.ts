import { Effect, Layer, Schema } from "effect";
import { createHelloAOProvider, type BibleProvider } from "./providers.js";
import { BibleBook, BibleChapter, BibleSource, BibleVersion, ScriptureError, ScripturePassage, type BibleDataProvider } from "./data-types.js";
import { bookId, passageRange, requestCache } from "./data-helpers.js";
import { decodeResponse as response, request } from "./runtime.js";

export { BibleBook, BibleChapter, BibleSource, BibleVersion, DisplayInstruction, ScriptureError, ScriptureErrorCode, ScripturePassage } from "./data-types.js";
export type { BibleDataProvider, BibleDisplayProvider } from "./data-types.js";
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
  clearCache: Effect.gen(function*() { yield* (yield* BibleSource).clearCache; }),
};

/** One source per client. Effects are lazy; run them at the application boundary. */
export function createScriptureClient({ provider = createHelloAOProvider() }: { provider?: BibleProvider | BibleDataProvider } = {}) {
  const unsupported = () => Effect.fail(new ScriptureError({ code: "unsupported", message: "This provider does not support this data operation." }));
  const source: BibleDataProvider = "getPassageData" in provider ? provider : provider.effects ?? {
    id: provider.id, defaultVersionId: provider.defaultVersionId,
    listVersions: () => provider.listVersions ? request("custom.listVersions", () => provider.listVersions!(), false) : unsupported(),
    listBooks: unsupported, listChapters: unsupported, getPassageData: unsupported, clearCache: Effect.void,
  };
  const cache = requestCache();
  const layer = Layer.succeed(BibleSource, {
    id: source.id,
    defaultVersionId: source.defaultVersionId,
    listVersions: () => cache.get("versions", () => source.listVersions().pipe(Effect.tap(response(Schema.Array(BibleVersion))))),
    listBooks: (id) => cache.get(JSON.stringify(["books", id]), () => source.listBooks(id).pipe(Effect.tap(response(Schema.Array(BibleBook))))),
    listChapters: (id, book) => cache.get(JSON.stringify(["chapters", id, book]), () => source.listChapters(id, book).pipe(Effect.tap(response(Schema.Array(BibleChapter))))),
    getPassageData: (id, passageId) => source.getPassageData(id, passageId),
    clearCache: cache.clear.pipe(Effect.andThen(source.clearCache)),
  });
  return {
    provider: source.id, layer,
    listVersions: () => scripture.listVersions().pipe(Effect.provide(layer)),
    listBooks: (options: { versionId?: string } = {}) => scripture.listBooks(options).pipe(Effect.provide(layer)),
    listChapters: (options: { versionId?: string; bookId: string }) => scripture.listChapters(options).pipe(Effect.provide(layer)),
    getPassage: (options: { versionId?: string; passageId: string }) => scripture.getPassage(options).pipe(Effect.provide(layer)),
    clearCache: () => scripture.clearCache.pipe(Effect.provide(layer)),
  };
}
