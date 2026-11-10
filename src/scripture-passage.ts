import { Effect } from "effect";
import { fetchDisplayEffect, resolveProvider, resolveProviderEffect, providerDefaults as defaults, type BibleProvider, type PassageDisplay, type ProviderOptions } from "./providers";
import { listen, nextFrame, waitForEvent } from "./dom-runtime";
import { formatPassageForDisplay, tryParsePassage } from "grab-bcv";

export const SCRIPTURE_PASSAGE_TAG = "si-passage";
export const BIBLE_PASSAGE_TAG = "bible-sk-passage";

// The tokens bible.css declares on ":root, :host", with its defaults, copied from
// https://cdn.youversion.com/platform/1/bible.css. Inside the shadow root that rule matches
// this element, which would hide the same tokens set on an ancestor, so the host inherits them
// instead. A token can't fall back to itself, so --si-* carries each value to the wrapper.
export const BIBLE_TOKENS: Record<string, string> = {
  "font-sans": "\"Inter\",sans-serif",
  "font-serif": "\"Source Serif 4\",serif",
  "font-mono": "ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,\"Liberation Mono\",\"Courier New\",monospace",
  "color-black": "#000",
  "color-white": "#fff",
  spacing: ".25rem",
  "container-sm": "24rem",
  "container-md": "28rem",
  "container-lg": "32rem",
  "text-xs": ".75rem",
  "text-xs--line-height": "calc(1/.75)",
  "text-sm": ".875rem",
  "text-sm--line-height": "calc(1.25/.875)",
  "text-base": "1rem",
  "text-base--line-height": "calc(1.5/1)",
  "text-lg": "1.125rem",
  "text-lg--line-height": "calc(1.75/1.125)",
  "text-xl": "1.25rem",
  "text-xl--line-height": "calc(1.75/1.25)",
  "text-2xl": "1.5rem",
  "text-2xl--line-height": "calc(2/1.5)",
  "text-3xl": "1.875rem",
  "text-3xl--line-height": "calc(2.25/1.875)",
  "font-weight-normal": "400",
  "font-weight-medium": "500",
  "font-weight-bold": "700",
  "tracking-widest": ".1em",
  "leading-tight": "1.25",
  "leading-snug": "1.375",
  "leading-normal": "1.5",
  "radius-2xl": "1rem",
  "radius-3xl": "1.5rem",
  "ease-out": "cubic-bezier(0,0,.2,1)",
  "animate-spin": "spin 1s linear infinite",
  "animate-pulse": "pulse 2s cubic-bezier(.4,0,.6,1)infinite",
  "blur-sm": "8px",
  "default-transition-duration": ".15s",
  "default-transition-timing-function": "cubic-bezier(.4,0,.2,1)",
};
const tokenNames = Object.keys(BIBLE_TOKENS);
const HOST_TOKENS = tokenNames.map((name) => `--yv-${name}: inherit; --si-${name}: var(--yv-${name}, ${BIBLE_TOKENS[name]});`).join("\n  ");
const ROOT_TOKENS = tokenNames.map((name) => `--yv-${name}: var(--si-${name});`).join("\n  ");

// Shadow DOM, so page CSS can't reach the Bible text. bible.css puts its rules in cascade layers,
// which lose to any unlayered page rule, even a bare * reset. Inside the shadow root, page
// selectors match nothing. The wrapper resets what the host inherits, and page rules can't
// target it. Custom properties still inherit, so --scripture-* and the reader tokens work.
const STYLES = `
/* flow-root keeps the passage's margins inside, so its layout is identical during and after the grow.
   The host takes bible.css's tokens from the page when it sets them, and the wrapper uses them. */
:host {
  display: flow-root;
  position: relative;
  ${HOST_TOKENS}
}
.scripture-root {
  all: initial;
  display: block;
  color: inherit;
  ${ROOT_TOKENS}
}
.scripture-root { --scripture-muted: #666; --scripture-red: #a52424; }
.scripture-root[data-theme="dark"] { --scripture-muted: #aaa; --scripture-red: #ff9090; }
.scripture-bible {
  font: var(--scripture-font-size, 20px)/var(--scripture-line-height, 1.625) var(--scripture-font-family, Georgia, serif);
  max-width: var(--scripture-max-width, 32rem);
  overflow-wrap: break-word;
}
.scripture-bible .scripture-verse-number, .fetch-bible sup[data-v] { font: 0.65em/1 system-ui, sans-serif; color: var(--scripture-muted); }
.fetch-bible sup[data-v] { padding-inline-end: 0.3em; }
.scripture-bible.fetch-bible .fb-wj { color: var(--scripture-red); }
.scripture-bible .scripture-heading { display: block; margin: 1em 0 0.5em; font: 600 0.85em/1.5 system-ui, sans-serif; }
.scripture-bible > .scripture-heading:first-child { margin-top: 0; }
.scripture-bible .scripture-jesus { color: var(--scripture-red); }
.scripture-bible .scripture-poetry { display: block; padding-inline-start: calc(var(--indent) * 1em); }
.scripture-bible .scripture-subtitle { margin: 0 0 0.5em; font-style: italic; }
:host([verse-numbers="hide"]) .scripture-verse-number { display: none; }
:host([red-letter="off"]) .scripture-jesus { color: inherit; }
:host([headings="hide"]) .scripture-heading { display: none; }
:host([verse-numbers="hide"]) .fetch-bible sup[data-v] { display: none; }
:host([red-letter="off"]) .fetch-bible .fb-wj { color: inherit; }
:host([headings="hide"]) .fetch-bible :is(.fb-ms, .fb-ms1, .fb-ms2, .fb-ms3, .fb-ms4, .fb-mr, .fb-s, .fb-s1, .fb-s2, .fb-s3, .fb-s4, .fb-sr, .fb-r, .fb-sp, .fb-qa) { display: none; }
/* Typography comes from --scripture-* properties, which pages set like any CSS. The fallbacks
   are bible.css's own values, except the font: Untitled Serif is YouVersion's Bible typeface,
   but bible.css defaults to Source Serif 4. */
[data-slot="yv-bible-renderer"] {
  --yv-reader-font-family: var(--scripture-font-family, "Untitled Serif", "Source Serif 4", serif);
  --yv-reader-font-size: var(--scripture-font-size, 20px);
  --yv-reader-line-height: var(--scripture-line-height, 1.625);
  --yv-reader-max-width: var(--scripture-max-width, 65ch);
  /* bible.css caps each paragraph at this width. */
  --yv-container-lg: var(--scripture-max-width, 32rem);
}
/* Content switches. CSS alone applies them, so toggling one never refetches or re-renders. */
:host([verse-numbers="hide"]) .yv-vlbl { display: none; }
:host([red-letter="off"]) .wj { color: inherit; }
/* .yv-h marks editorial headings. Psalm titles (.d) are Scripture, so they stay. */
:host([headings="hide"]) .yv-h { display: none; }
/* Translators' added words read as italic, as in print Bibles. bible.css also bolds them,
   which stresses the words the original text does not contain. */
[data-slot="yv-bible-renderer"] .add { font-weight: inherit; }
/* Page frameworks (Sensible UI, Pico) draw their own spinner on [aria-busy]; this element has one.
   !important in a shadow root beats the page's rules for the host. */
:host([aria-busy])::before, :host([aria-busy])::after { content: none !important; }
.scripture-loading { display: flex; padding: 0.75rem 0; opacity: 0.5; }
.scripture-stage { position: absolute; inset: 0 0 auto; height: 0; overflow: hidden; visibility: hidden; }
.scripture-loading > svg { animation: scripture-spin 0.8s linear infinite; }
@keyframes scripture-spin { to { transform: rotate(360deg); } }
[role="alert"] { margin: 0; opacity: 0.7; font-family: var(--yv-font-sans, system-ui, sans-serif); }
/* Every layout uses the same citation; only its place changes. */
.scripture-citation {
  all: unset;
  display: block;
  /* Match the width bible.css gives the text. */
  max-width: var(--scripture-max-width, 32rem);
  margin-block-start: 1rem;
  font: calc(var(--scripture-font-size, 20px) * 0.8)/1.5 var(--yv-font-sans, system-ui, sans-serif);
  color: var(--yv-foreground);
}
.scripture-root > .scripture-citation:first-child { margin-block: 0 1rem; }
.scripture-citation > .scripture-version { color: var(--yv-muted-foreground, var(--scripture-muted)); }
/* The attribution always comes after the text, right under a citation when one follows it. */
.scripture-attribution {
  all: unset;
  display: block;
  max-width: var(--scripture-max-width, 32rem);
  margin-block-start: 1rem;
  font: 0.75rem/1.5 var(--yv-font-sans, system-ui, sans-serif);
  color: var(--yv-muted-foreground, var(--scripture-muted));
}
.scripture-root .scripture-attribution a { color: inherit; text-decoration: none; text-underline-offset: 0.15em; }
.scripture-root .scripture-attribution a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
@media (hover: hover) and (pointer: fine) {
  .scripture-root .scripture-attribution a:hover { text-decoration: underline; }
}
.scripture-citation + .scripture-attribution { margin-block-start: 0; }
.scripture-quote {
  all: unset;
  display: block;
  padding-inline-start: 1rem;
  border-inline-start: 2px solid color-mix(in srgb, currentColor 18%, transparent);
}
@media (prefers-reduced-motion: reduce) { .scripture-loading > svg { animation-duration: 2.4s; } }`;

// Lucide "loader-circle".
const LOADER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

export type ReferenceLayout = "heading" | "citation" | "quote" | "none";
const LAYOUTS: readonly ReferenceLayout[] = ["heading", "citation", "quote", "none"];

/**
 * Displays Scripture with its required attribution. Works in the page or inside a shadow root.
 *
 * Attributes choose what shows: `reference`, `verse-numbers="hide"`, `red-letter="off"`,
 * `headings="hide"`, `direction`, and `theme`. CSS properties choose how it looks:
 * `--scripture-font-size`, `--scripture-line-height`, `--scripture-font-family`, `--scripture-max-width`.
 * Parts: `text`, `citation`, `version`, `attribution`, `quote`, `loader`, `error`.
 */
export class ScripturePassage extends HTMLElement {
  // verse-numbers, red-letter, and headings are pure CSS, so they need no callback.
  static observedAttributes = ["provider", "bible-version-id", "yvp-public-app-key", "yvp-api-host", "yvp-bible-version-id", "passage-id", "theme", "reference", "direction"];

  private providerOverride?: BibleProvider;
  /** A custom provider for this passage. The provider attribute takes precedence. */
  get bibleProvider(): BibleProvider | undefined { return this.providerOverride; }
  set bibleProvider(provider: BibleProvider | undefined) {
    this.providerOverride = provider;
    if (this.isConnected) this.scheduleLoad();
  }

  private generation = 0;
  /** The loaded passage, kept so a layout change re-renders without a request. */
  private loaded: { display: PassageDisplay; passageId: string } | null = null;
  private scheduled = false;
  private cancelLoad?: () => void;
  private cancelTheme?: () => void;
  private cancelAnimation?: () => void;
  private readonly systemDark = matchMedia("(prefers-color-scheme: dark)");
  private readonly onSystemTheme = () => this.applyTheme();
  /** Holds everything the element shows, inside its shadow root. */
  private readonly root = document.createElement("div");

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    this.root.className = "scripture-root";
    shadow.append(style, this.root);
  }

  connectedCallback(): void {
    this.cancelTheme = Effect.runCallback(listen(this.systemDark, "change", this.onSystemTheme).pipe(Effect.andThen(Effect.never), Effect.scoped));
    // Show the loader now, not a microtask later, so whoever lays us out measures it.
    if (!this.root.childElementCount) this.showLoading();
    this.scheduleLoad();
  }

  disconnectedCallback(): void {
    this.cancelTheme?.();
    this.cancelAnimation?.();
    this.generation += 1;
    this.cancelLoad?.();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue || !this.isConnected) return;
    if (name === "theme") this.applyTheme();
    else if (name === "reference" || name === "direction") this.relayout();
    else this.scheduleLoad();
  }

  private scheduleLoad(): void {
    this.generation += 1;
    this.cancelLoad?.();
    this.cancelAnimation?.();
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.isConnected) this.cancelLoad = Effect.runCallback(this.load(this.generation).pipe(
        Effect.catch((error) => Effect.sync(() => {
          this.showError("Unable to display Bible text. Check the provider, version, and passage.");
          this.dispatchEvent(new CustomEvent("scripture-error", { detail: error }));
        })),
        Effect.scoped,
      ));
    });
  }

  private applyTheme(): void {
    // "light" (default), "dark", or "auto" to follow the system setting.
    const setting = this.getAttribute("theme");
    const theme = setting === "dark" || (setting === "auto" && this.systemDark.matches) ? "dark" : "light";
    this.root.dataset.theme = theme;
    for (const el of this.root.querySelectorAll("[data-yv-sdk]")) el.setAttribute("data-yv-theme", theme);
  }

  /** "heading" (default), "citation", "quote", or "none". */
  get referenceLayout(): ReferenceLayout {
    const value = this.getAttribute("reference") as ReferenceLayout | null;
    return value && LAYOUTS.includes(value) ? value : "heading";
  }

  /** Swaps the reference layout in place. Only the label moves, so there is no loader or grow. */
  private relayout(): void {
    if (!this.loaded || this.getAttribute("aria-busy")) return;
    this.root.replaceChildren(...this.compose(this.loaded.display, this.loaded.passageId));
    this.applyTheme();
  }

  /** Builds the passage, its reference and version in the chosen layout, and its attribution. */
  private compose(display: PassageDisplay, passageId: string): HTMLElement[] {
    const doc = this.ownerDocument;
    // Each piece is also a CSS part, such as si-passage::part(citation).
    const el = (tag: string, className: string, part: string, text?: string) => {
      const node = doc.createElement(tag);
      node.className = className;
      node.setAttribute("part", part);
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const parsed = tryParsePassage(passageId);
    const reference = parsed.ok ? formatPassageForDisplay(parsed.value) : passageId;

    const scripture = doc.createElement("section");
    scripture.setAttribute("part", "text");
    for (const [name, value] of Object.entries(display.containerAttributes ?? {})) scripture.setAttribute(name, value);
    // "ltr" or "rtl" overrides the passage's own direction, like the React SDK's scriptureDirection.
    const direction = this.getAttribute("direction");
    scripture.setAttribute("dir", direction === "ltr" || direction === "rtl" ? direction : display.direction ?? "auto");
    scripture.innerHTML = display.html;

    // The citation carries the reference and version; the layout only moves it.
    const citation = el("p", "scripture-citation", "citation");
    if (display.yvpBibleVersion) citation.setAttribute("data-yv-sdk", "");
    citation.append(reference, " ", el("span", "scripture-version", "version", display.version.abbreviation));

    // The attribution always shows, always below the text. It is a license requirement.
    const attribution = el("p", "scripture-attribution", "attribution");
    if (display.yvpBibleVersion) attribution.setAttribute("data-yv-sdk", "");
    const attributionText = doc.createElement("bdi");
    attributionText.setAttribute("dir", "auto");
    if (display.attributionHtml !== undefined) attributionText.innerHTML = display.attributionHtml;
    else attributionText.textContent = display.attribution;
    attribution.append(attributionText);

    switch (this.referenceLayout) {
      case "heading":
        return [citation, scripture, attribution];
      case "citation":
        return [scripture, citation, attribution];
      case "quote": {
        const quote = el("blockquote", "scripture-quote", "quote");
        quote.append(scripture, citation, attribution);
        return [quote];
      }
      case "none":
        return [scripture, attribution];
    }
  }

  private showLoading(): void {
    this.setAttribute("aria-busy", "true");
    const loading = this.ownerDocument.createElement("div");
    loading.className = "scripture-loading";
    loading.setAttribute("part", "loader");
    loading.setAttribute("role", "status");
    loading.setAttribute("aria-label", "Loading Bible text");
    loading.innerHTML = LOADER_SVG;
    this.root.replaceChildren(loading);
  }

  private showError(message: string): void {
    const alert = this.ownerDocument.createElement("p");
    alert.setAttribute("role", "alert");
    alert.setAttribute("part", "error");
    alert.textContent = message;
    this.removeAttribute("aria-busy");
    this.root.replaceChildren(alert);
  }

  private readonly load = Effect.fn("scripture.passage.load")(function*(this: ScripturePassage, generation: number) {
    this.loaded = null;
    const passageId = this.getAttribute("passage-id")?.trim();
    if (!passageId) {
      this.showError("Set passage-id to display Bible text.");
      return;
    }

    if (!this.root.querySelector(":scope > .scripture-loading")) this.showLoading();
    // Cached passages resolve before the loader paints; those swap in without a grow.
    let loaderPainted = false;
    yield* nextFrame.pipe(Effect.andThen(Effect.sync(() => { loaderPainted = true; })), Effect.forkScoped);

      const provider = yield* resolveProviderEffect({
        ...defaults,
        provider: (this.getAttribute("provider") as ProviderOptions["provider"]) || this.providerOverride || defaults.provider,
        yvpPublicAppKey: this.getAttribute("yvp-public-app-key")?.trim() || defaults.yvpPublicAppKey,
        yvpApiHost: this.getAttribute("yvp-api-host") || defaults.yvpApiHost,
      });
      const pageVersion = provider === resolveProvider(defaults)
        ? defaults.bibleVersionId ?? (provider.id === "youversion" ? defaults.yvpBibleVersionId?.toString() : undefined)
        : undefined;
      const versionId = this.getAttribute("bible-version-id") ||
        (provider.id === "youversion" ? this.getAttribute("yvp-bible-version-id") : undefined) ||
        pageVersion || provider.defaultVersionId;
      const display = yield* fetchDisplayEffect(provider, versionId, passageId);
      if (!this.isConnected || generation !== this.generation) return;

      // Wait for the Bible CSS and fonts so the text appears styled, at its final height.
      yield* this.installStylesheets(display);
      if (!this.isConnected || generation !== this.generation) return;
      const parts = this.compose(display, passageId);

      // Lay the text out unseen first, so the browser fetches the fonts it uses,
      // and swap it in once they arrive. That way the text never shifts.
      const stage = this.ownerDocument.createElement("div");
      stage.className = "scripture-stage";
      stage.setAttribute("aria-hidden", "true");
      stage.append(...parts);
      this.root.append(stage);
      yield* Effect.addFinalizer(() => Effect.sync(() => stage.remove()));
      void stage.offsetHeight;
      yield* Effect.promise(() => this.ownerDocument.fonts.ready).pipe(Effect.timeoutOrElse({ duration: "3 seconds", orElse: () => Effect.void }));
      if (!this.isConnected || generation !== this.generation) return;

      const from = this.offsetHeight;
      this.root.replaceChildren(...parts);
      this.loaded = { display, passageId };
      this.applyTheme();
      if (loaderPainted) this.growFrom(from);
      this.removeAttribute("aria-busy");
      this.dispatchEvent(new CustomEvent("scripture-load", { detail: {
        provider: provider.id, bibleVersionId: versionId, passageId, bibleVersion: display.version,
        ...(display.yvpBibleVersion ? { yvpBibleVersionId: Number(versionId), yvpBibleVersion: display.yvpBibleVersion } : {}),
      } }));
  });

  /** Resolves once every Bible stylesheet has loaded (or failed, so text still shows). */
  private installStylesheets(display: PassageDisplay) {
    return Effect.forEach(display.stylesheets ?? [], ({ kind, href }) => Effect.suspend(() => {
      // @font-face is ignored inside a shadow root, so fonts always go on the page.
      const target = kind === "font" ? this.ownerDocument.head : this.shadowRoot!;
      const links = target.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]');
      let link = Array.from(links).find((existing) => existing.href === href);
      if (!link) {
        link = this.ownerDocument.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        target.append(link);
      } else if (link.sheet || link.dataset.scriptureLoaded) {
        return Effect.void;
      }
      const pending = link;
      return waitForEvent(pending, ["load", "error"]).pipe(
        Effect.tap(() => Effect.sync(() => { pending.dataset.scriptureLoaded = ""; })),
        Effect.timeoutOrElse({ duration: "5 seconds", orElse: () => Effect.void }),
      );
    }), { concurrency: "unbounded", discard: true });
  }

  /**
   * Grows from the loader's height to the passage's height after removing the loader.
   * The text fades in with a light blur.
   */
  private growFrom(from: number): void {
    const to = this.offsetHeight;
    const easing = "cubic-bezier(0.23, 1, 0.32, 1)";
    const text = Array.from(this.root.children) as HTMLElement[];
    const element = this;
    this.cancelAnimation = Effect.runCallback(Effect.gen(function*() {
      const animations = yield* Effect.acquireRelease(Effect.sync(() => {
        // Reduced motion keeps the fade and drops the movement and blur.
        if (reducedMotion.matches) return text.map((el) => el.animate({ opacity: [0, 1] }, { duration: 200, easing }));
        const animations: Animation[] = [];
        if (from !== to) {
          element.style.overflow = "hidden";
          animations.push(element.animate({ height: [`${from}px`, `${to}px`] }, { duration: 280, easing }));
        }
        animations.push(...text.map((el) => el.animate({ opacity: [0, 1], filter: ["blur(4px)", "blur(0)"] }, { duration: 280, easing })));
        return animations;
      }), (animations) => Effect.sync(() => {
        for (const animation of animations) animation.cancel();
        element.style.overflow = "";
      }));
      yield* Effect.forEach(animations, (animation) => Effect.tryPromise(() => animation.finished).pipe(Effect.ignore), { concurrency: "unbounded", discard: true });
    }).pipe(Effect.scoped));
  }
}

/** Registers <bible-sk-passage> and its <si-passage> compatibility name. */
export function defineScripturePassage(options: ProviderOptions = {}): void {
  Object.assign(defaults, options);
  if (!customElements.get(SCRIPTURE_PASSAGE_TAG)) customElements.define(SCRIPTURE_PASSAGE_TAG, ScripturePassage);
  if (!customElements.get(BIBLE_PASSAGE_TAG)) customElements.define(BIBLE_PASSAGE_TAG, class extends ScripturePassage {});
}

declare global {
  interface HTMLElementTagNameMap {
    "si-passage": ScripturePassage;
    "bible-sk-passage": ScripturePassage;
  }
}
