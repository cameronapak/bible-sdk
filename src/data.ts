import { Effect } from "effect";
import { createScriptureClient as createEffectClient } from "./data-effect.js";

export { ScriptureError } from "./data-types.js";
export type { BibleBook, BibleChapter, BibleVersion, DisplayInstruction, ScriptureErrorCode, ScripturePassage } from "./data-types.js";

/** Async/await boundary over the same validated Effect operations and caches. */
export function createScriptureClient(options: Parameters<typeof createEffectClient>[0] = {}) {
  const client = createEffectClient(options);
  return {
    provider: client.provider,
    listVersions: () => Effect.runPromise(client.listVersions()),
    listBooks: (options: { versionId?: string } = {}) => Effect.runPromise(client.listBooks(options)),
    listChapters: (options: { versionId?: string; bookId: string }) => Effect.runPromise(client.listChapters(options)),
    getPassage: (options: { versionId?: string; passageId: string }) => Effect.runPromise(client.getPassage(options)),
    clearCache: () => Effect.runPromise(client.clearCache()),
  };
}
