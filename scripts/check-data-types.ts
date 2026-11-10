// Compile-only consumer check, run after building the package declarations.
import { Effect } from "effect";
import { createScriptureClient, ScriptureError, type ScripturePassage, type ScriptureErrorCode } from "@faith-tools/bible-sdk/data";
import { createScriptureClient as createEffectClient } from "@faith-tools/bible-sdk/data/effect";
import { createHelloAOProvider } from "@faith-tools/bible-sdk/providers/helloao";
import { createYouVersionProvider } from "@faith-tools/bible-sdk/providers/youversion";
import { createFetchBibleProvider } from "@faith-tools/bible-sdk/providers/fetch-bible";

export function checkDataTypes(error: unknown) {
  const helloao = createHelloAOProvider();
  const youversion = createYouVersionProvider({ yvpPublicAppKey: "public-app-key" });
  const fetchBible = createFetchBibleProvider({ usage: { commercial: false, derivatives: "same-license" } });
  const regular = createScriptureClient({ provider: fetchBible });
  const native = createEffectClient({ provider: helloao });
  const promise: Promise<ScripturePassage> = regular.getPassage({ passageId: "JHN.3.16" });
  const effect: Effect.Effect<ScripturePassage, ScriptureError> = native.getPassage({ passageId: "JHN.3.16" });
  if (error instanceof ScriptureError) {
    const code: ScriptureErrorCode = error.code;
    return { code, promise, effect, youversion };
  }
}
