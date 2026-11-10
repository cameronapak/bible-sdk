// Compile-only consumer check, run after building the package declarations.
import { Effect } from "effect";
import { createScriptureClient, ScriptureError, type ScripturePassage, type ScriptureErrorCode, type VerseOfTheDay } from "@faith-tools/bible-sdk/data";
import { createScriptureClient as createEffectClient } from "@faith-tools/bible-sdk/data/effect";
import { createHelloAOProvider } from "@faith-tools/bible-sdk/providers/helloao";
import { createAOLabProvider, aoLabProvider } from "@faith-tools/bible-sdk/providers/ao-lab";
import { createYouVersionProvider } from "@faith-tools/bible-sdk/providers/youversion";
import { createFetchBibleProvider } from "@faith-tools/bible-sdk/providers/fetch-bible";
import { createApiBibleProvider } from "@faith-tools/bible-sdk/providers/api-bible";
import { createBibleClient } from "@americanbible/api-bible-sdk";

export function checkDataTypes(error: unknown) {
  const aoLab = createAOLabProvider();
  const legacy = createHelloAOProvider();
  const youversion = createYouVersionProvider({ yvpPublicAppKey: "public-app-key" });
  const fetchBible = createFetchBibleProvider({ usage: { commercial: false, derivatives: "same-license" } });
  const apiBible = createApiBibleProvider({
    client: createBibleClient({ apiKey: "compile-only-placeholder", retry: { maxAttempts: 1 } }),
    defaultVersionId: "bba9f40183526463-01",
  });
  const regular = createScriptureClient({ provider: fetchBible });
  const native = createEffectClient({ provider: aoLab });
  const promise: Promise<ScripturePassage> = regular.getPassage({ passageId: "JHN.3.16" });
  const effect: Effect.Effect<ScripturePassage, ScriptureError> = native.getPassage({ passageId: "JHN.3.16" });
  const apiPromise: Promise<ScripturePassage> = createScriptureClient({ provider: apiBible }).getPassage({ passageId: "JHN.3.16" });
  const apiEffect: Effect.Effect<ScripturePassage, ScriptureError> = createEffectClient({ provider: apiBible }).getPassage({ passageId: "JHN.3.16" });
  const dailyPromise: Promise<VerseOfTheDay> = regular.getVerseOfTheDay({ calendarSource: "ao-lab", date: "2026-12-25" });
  const dailyEffect: Effect.Effect<VerseOfTheDay, ScriptureError> = native.getVerseOfTheDay();
  const nativeCalendar: boolean = regular.capabilities.verseOfTheDay;
  if (error instanceof ScriptureError) {
    const code: ScriptureErrorCode = error.code;
    return { code, promise, effect, apiPromise, apiEffect, dailyPromise, dailyEffect, nativeCalendar, youversion, legacy, aoLabProvider };
  }
}
