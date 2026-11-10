import { Effect } from "effect";
import { createScriptureClient as createEffectClient } from "./data-effect.js";
import type { VerseOfTheDayOptions } from "./data-types.js";

export { ScriptureError } from "./data-types.js";
export type { BibleBook, BibleChapter, BibleVersion, DisplayInstruction, ScriptureErrorCode, ScripturePassage, VerseOfTheDay, VerseOfTheDayOptions } from "./data-types.js";

/** Async/await boundary over the same validated Effect operations and caches. */
export function createScriptureClient(options: Parameters<typeof createEffectClient>[0] = {}) {
  const client = createEffectClient(options);
  return {
    provider: client.provider,
    capabilities: client.capabilities,
    listVersions: () => Effect.runPromise(client.listVersions()),
    listBooks: (options: { versionId?: string } = {}) => Effect.runPromise(client.listBooks(options)),
    listChapters: (options: { versionId?: string; bookId: string }) => Effect.runPromise(client.listChapters(options)),
    getPassage: (options: { versionId?: string; passageId: string }) => Effect.runPromise(client.getPassage(options)),
    getVerseOfTheDay: (options: VerseOfTheDayOptions = {}) => Effect.runPromise(client.getVerseOfTheDay(options)),
    clearCache: () => Effect.runPromise(client.clearCache()),
  };
}
