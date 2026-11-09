// Drop-in entry: <script src="scripture-inline.js"></script>
import { definePassageInput, defineVersionInput, defineScripturePassage, scriptureInline, type Mode, type ReferenceLayout, type Trigger, type ProviderOptions } from "./index";

const script = document.currentScript as HTMLScriptElement | null;
const data = script?.dataset ?? {};

const providerOptions: ProviderOptions = {
  provider: data.provider as ProviderOptions["provider"],
  bibleVersionId: data.bibleVersionId,
  yvpPublicAppKey: data.yvpPublicAppKey,
  yvpBibleVersionId: data.yvpBibleVersionId ? Number(data.yvpBibleVersionId) : undefined,
  yvpApiHost: data.yvpApiHost,
};
// Script settings are also page-wide defaults for standalone passages.
defineScripturePassage(providerOptions);
definePassageInput();
defineVersionInput();

const run = () =>
  scriptureInline({
    mode: (data.mode as Mode | undefined) ?? "card",
    trigger: data.trigger as Trigger | undefined,
    ...providerOptions,
    reference: data.reference as ReferenceLayout | undefined,
  });

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
else run();
