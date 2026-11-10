import { createScriptureCard } from "./card";
import { Effect } from "effect";
import { REF_CLASS, unwrapReferences, wrapReferences } from "./scan";
import type { ReferenceLayout } from "./scripture-passage";
import type { ProviderOptions } from "./providers";

export { findReferences, type FoundReference } from "./find";
export { unwrapReferences, wrapReferences } from "./scan";
export { createScriptureCard } from "./card";
export { BIBLE_PASSAGE_INPUT_TAG, PASSAGE_INPUT_TAG, ScripturePassageInput, definePassageInput, type PassageInputDetail } from "./passage-input";
export { BIBLE_VERSION_INPUT_TAG, VERSION_INPUT_TAG, ScriptureVersionInput, defineVersionInput, type VersionInputDetail } from "./version-input";
export { BIBLE_PASSAGE_TAG, SCRIPTURE_PASSAGE_TAG, ScripturePassage, defineScripturePassage, type ReferenceLayout } from "./scripture-passage";
export { aoLabProvider, createAOLabProvider, helloaoProvider, createYouVersionProvider, listBibleVersions, type BibleProvider, type BibleVersion, type PassageDisplay, type ProviderOptions } from "./providers";

export type Mode = "link" | "card";
export type Trigger = "click" | "hover";

export type ScriptureInlineOptions = ProviderOptions & {
  /** "link" opens route.bible. "card" shows the passage in a card. Default: "card". */
  mode?: Mode;
  /** What opens a card: "click", or "hover" with a mouse (taps and clicks still work). Default: "click". */
  trigger?: Trigger;
  /** Where a card shows the reference: "heading", "citation", "quote", or "none". Default: "heading". */
  reference?: ReferenceLayout;
  /** Where to look for references. Default: the whole page, including a body that replaces it. */
  root?: Node;
  /** Keep linking references in content added later, such as pages swapped in by Turbo or a router. Default: true. */
  watch?: boolean;
};

const linkStyles = `
.${REF_CLASS} {
  /* Lay out exactly like the text it replaced, whatever the host styles links as,
     so linking a reference never reflows the line. Only paint-only styles below. */
  display: inline !important;
  font: inherit !important;
  letter-spacing: inherit !important;
  word-spacing: inherit !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  color: inherit;
  text-decoration: underline dotted;
  text-decoration-thickness: 1.5px;
  text-underline-offset: 0.2em;
  cursor: pointer;
}
.${REF_CLASS}:hover { text-decoration-style: solid; }`;

export type ScriptureInline = {
  /** The links that replaced each reference. */
  links: HTMLAnchorElement[];
  /** Closes any card, removes the listeners, and turns the links back into plain text. */
  stop(): void;
};

/** Finds Bible references on the page and makes them interactive. */
export function scriptureInline({
  mode = "card",
  trigger = "click",
  reference = "heading",
  root,
  watch = true,
  ...providerOptions
}: ScriptureInlineOptions = {}): ScriptureInline {
  if (!document.getElementById("scripture-inline-styles")) {
    const style = document.createElement("style");
    style.id = "scripture-inline-styles";
    style.textContent = linkStyles;
    document.head.append(style);
  }

  const links = wrapReferences(root ?? document.body);
  const listening = new AbortController();
  const { signal } = listening;
  let card: ReturnType<typeof createScriptureCard> | null = null;
  // Listen on the document for the whole page, so the listeners outlive a swapped body.
  const events = root ?? document;

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        // For the whole page, only the body has prose. Skip what lands in <head>.
        if (!node.isConnected || (!root && !document.body?.contains(node))) continue;
        // A tree walker never visits its own root, so scan a new text node from its parent.
        const scope = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
        if (!scope) continue;
        links.push(...wrapReferences(scope));
        // Track links that come back already wrapped, as when Turbo restores a cached page, so stop() unwraps them.
        if (scope instanceof Element) {
          for (const link of scope.querySelectorAll<HTMLAnchorElement>(`a.${REF_CLASS}`)) if (!links.includes(link)) links.push(link);
        }
      }
    }
    // Drop the mutations the wrapping just made, so they don't trigger another pass.
    observer.takeRecords();
    // Forget links the page removed, so old pages can be garbage collected.
    for (let i = links.length - 1; i >= 0; i--) if (!links[i].isConnected) links.splice(i, 1);
    card?.closeIfDetached();
  });
  if (mode === "card") {
    const opened = (card = createScriptureCard({ ...providerOptions, reference }));
    const refFrom = (event: Event) => (event.target as Element).closest?.(`a.${REF_CLASS}`) as HTMLAnchorElement | null;

    events.addEventListener("click", (event) => {
      const mouse = event as MouseEvent;
      // Let modified clicks open route.bible as a normal link.
      if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey || mouse.button !== 0) return;
      const link = refFrom(event);
      if (!link) return;
      event.preventDefault();
      opened.toggle(link);
    }, { signal });

    if (trigger === "hover") {
      events.addEventListener("pointerover", (event) => {
        const link = refFrom(event);
        if (link && (event as PointerEvent).pointerType === "mouse") opened.hover(link);
      }, { signal });
      events.addEventListener("pointerout", (event) => {
        if (refFrom(event)) opened.unhover(event as PointerEvent);
      }, { signal });
    }
  }

  const stop = Effect.runCallback(Effect.gen(function*() {
    yield* Effect.acquireRelease(Effect.sync(() => {
      if (watch) observer.observe(root ?? document.documentElement, { childList: true, subtree: true });
    }), () => Effect.sync(() => {
      observer.disconnect();
      listening.abort();
      card?.destroy();
      unwrapReferences(links);
    }));
    yield* Effect.never;
  }).pipe(Effect.scoped, Effect.withSpan("scripture.references.watch")));

  return { links, stop };
}
