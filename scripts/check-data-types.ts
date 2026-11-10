// Compile-only consumer check, run after building the package declarations.
import { Effect } from "effect";
import { createScriptureClient, ScriptureError, type ScripturePassage, type ScriptureErrorCode } from "@faith-tools/scripture-inline/data";
import { createScriptureClient as createEffectClient } from "@faith-tools/scripture-inline/data/effect";
import { createHelloAOProvider } from "@faith-tools/scripture-inline/providers/helloao";
import { createYouVersionProvider } from "@faith-tools/scripture-inline/providers/youversion";
import { createFetchBibleProvider } from "@faith-tools/scripture-inline/providers/fetch-bible";

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
