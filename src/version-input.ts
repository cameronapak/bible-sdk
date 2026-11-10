import { Effect } from "effect";
import { listBibleVersionsEffect, providerDefaults, resolveProvider, resolveProviderEffect, type BibleProvider, type BibleVersion, type ProviderOptions } from "./providers";

export const VERSION_INPUT_TAG = "si-version-input";
export type VersionInputDetail = { provider: string; bibleVersionId: string; bibleVersion: BibleVersion | null };

const STYLES = `
:host { display: block; position: relative; min-width: 0; }
.root { all: initial; display: grid; gap: 0.375rem; color: inherit; font: 0.875rem/1.5 var(--font-sans, system-ui, sans-serif); }
input, select, button { box-sizing: border-box; font: inherit; color: inherit; }
input, select {
  width: 100%; min-width: 0; height: 2.25rem; margin: 0; padding: 0.25rem 0.75rem;
  background: none; border: 1px solid var(--input, color-mix(in srgb, currentColor 20%, transparent));
  border-radius: calc(var(--radius, 0.625rem) - 2px); outline: none; box-shadow: 0 1px 2px #0000000d;
  transition: color 0.15s, box-shadow 0.15s;
}
input:focus-visible, select:focus-visible {
  border-color: var(--ring, Highlight);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring, Highlight) 50%, transparent);
}
button:focus-visible { outline: 2px solid var(--ring, Highlight); outline-offset: 2px; }
input:disabled, select:disabled { opacity: 0.5; cursor: not-allowed; }
input[aria-invalid="true"] { border-color: var(--destructive, #dc2626); }
.language { position: relative; }
.language select { appearance: none; padding-inline-end: 2.5rem; }
.language svg { position: absolute; inset-inline-end: 0.75rem; top: 50%; transform: translateY(-50%); pointer-events: none; }
.language select:disabled + svg { opacity: 0.5; }
.search { position: relative; }
[role="listbox"] {
  position: absolute; inset: calc(100% + 4px) 0 auto; z-index: 50; box-sizing: border-box;
  max-height: 16rem; margin: 0; padding: 4px; overflow-y: auto; list-style: none;
  color: var(--popover-foreground, inherit); background: var(--popover, Canvas);
  border: 1px solid var(--border, color-mix(in srgb, currentColor 15%, transparent));
  border-radius: var(--radius, 0.625rem); box-shadow: 0 8px 24px -8px #0003;
}
[hidden] { display: none !important; }
[role="option"] { padding: 0.5rem; border-radius: calc(var(--radius, 0.625rem) - 4px); overflow-wrap: anywhere; cursor: default; }
[role="option"][aria-selected="true"] { color: var(--accent-foreground, inherit); background: var(--accent, color-mix(in srgb, currentColor 10%, transparent)); }
.language-name { display: block; font-size: 0.75rem; opacity: 0.7; }
.feedback { display: flex; align-items: center; gap: 0.5rem; min-height: 1.5rem; font-size: 0.75rem; }
[role="status"] { display: flex; align-items: center; gap: 0.375rem; }
svg { flex: none; }
[role="status"] svg { animation: spin 0.8s linear infinite; }
button { border: 0; padding: 0; background: none; text-decoration: underline; cursor: pointer; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (pointer: coarse) { input, select { font-size: 16px; } }
@media (prefers-reduced-motion: reduce) { [role="status"] svg { animation-duration: 2.4s; } }
@media (hover: hover) and (pointer: fine) { [role="option"]:hover { background: var(--accent, color-mix(in srgb, currentColor 10%, transparent)); } }
`;

let ids = 0;
const labelOf = (version: BibleVersion) => `${version.title} (${version.abbreviation})`;

/** A form-associated translation picker. Search names/abbreviations, not provider IDs. */
export class ScriptureVersionInput extends HTMLElement {
  static formAssociated = true;
  static observedAttributes = ["value", "language", "provider", "yvp-public-app-key", "yvp-api-host", "placeholder", "disabled"];

  private readonly internals = this.attachInternals();
  private readonly input = document.createElement("input");
  private readonly language = document.createElement("select");
  private readonly list = document.createElement("ul");
  private readonly status = document.createElement("span");
  private readonly retry = document.createElement("button");
  private versions: BibleVersion[] = [];
  private filtered: BibleVersion[] = [];
  private selected?: BibleVersion;
  private pendingValue?: string;
  private provider?: BibleProvider;
  private override?: BibleProvider;
  private active = -1;
  private generation = 0;
  private scheduled = false;
  private cancelLoad?: () => void;
  private loading = false;
  private failed = false;
  private formDisabled = false;

  constructor() {
    super();
    const style = document.createElement("style");
    style.textContent = STYLES;
    const root = document.createElement("div");
    root.className = "root";
    const language = document.createElement("div");
    language.className = "language";
    language.append(this.language);
    // Lucide chevron-down; decorative so the native select keeps its accessible name.
    language.insertAdjacentHTML("beforeend", '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>');
    const search = document.createElement("div");
    search.className = "search";
    search.append(this.input, this.list);
    const feedback = document.createElement("div");
    feedback.className = "feedback";
    feedback.append(this.status, this.retry);
    root.append(language, search, feedback);
    this.attachShadow({ mode: "open" }).append(style, root);

    this.input.type = "text";
    this.input.autocomplete = "off";
    this.input.spellcheck = false;
    this.input.placeholder = "Search translations";
    this.input.setAttribute("part", "input");
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-autocomplete", "list");
    this.input.setAttribute("aria-expanded", "false");
    this.list.id = `${VERSION_INPUT_TAG}-${++ids}`;
    this.list.setAttribute("part", "listbox");
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-label", "Bible translations");
    this.list.hidden = true;
    this.input.setAttribute("aria-controls", this.list.id);
    this.language.setAttribute("part", "language");
    this.language.setAttribute("aria-label", "Translation language");
    this.status.setAttribute("role", "status");
    this.status.setAttribute("part", "status");
    this.retry.type = "button";
    this.retry.textContent = "Retry";
    this.retry.setAttribute("part", "retry");
    this.retry.hidden = true;
    this.retry.addEventListener("click", () => this.scheduleLoad());
    this.input.addEventListener("input", () => this.suggest());
    this.input.addEventListener("focus", () => { this.input.select(); this.suggest(); });
    this.input.addEventListener("click", () => this.list.hidden && this.suggest());
    this.input.addEventListener("change", (event) => event.stopPropagation());
    this.input.addEventListener("blur", () => {
      this.input.value = this.selected ? labelOf(this.selected) : "";
      this.close();
    });
    this.language.addEventListener("change", (event) => {
      event.stopPropagation();
      this.input.focus();
      this.suggest();
    });
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { this.close(); this.input.value = this.selected ? labelOf(this.selected) : ""; }
      else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (this.list.hidden) this.suggest();
        else this.highlight(Math.max(0, Math.min(this.filtered.length - 1, this.active + (event.key === "ArrowDown" ? 1 : -1))));
      } else if (event.key === "Enter" && !this.list.hidden) {
        event.preventDefault();
        if (this.filtered[this.active]) this.commit(this.filtered[this.active].id, true);
      }
    });
    this.list.addEventListener("pointerdown", (event) => event.preventDefault());
    const pick = (event: Event) => {
      const option = (event.target as Element).closest<HTMLElement>("[role=option]");
      if (option) this.commit(this.filtered[Number(option.dataset.index)].id, true);
    };
    this.list.addEventListener("click", pick);
    // Preserve taps on Safari without accepting a drag used to scroll the results.
    let touch: Touch | undefined;
    this.list.addEventListener("touchstart", (event) => { touch = event.touches[0]; }, { passive: true });
    this.list.addEventListener("touchend", (event) => {
      const end = event.changedTouches[0];
      if (!touch || !end || Math.hypot(end.clientX - touch.clientX, end.clientY - touch.clientY) > 10) return;
      event.preventDefault();
      pick(event);
    });
    this.addEventListener("click", (event) => event.composedPath()[0] === this && this.input.focus());
  }

  connectedCallback(): void {
    this.input.setAttribute("aria-label", this.getAttribute("aria-label") || [...this.internals.labels].map((label) => label.textContent?.trim()).join(" ") || "Bible translation");
    this.scheduleLoad();
  }
  disconnectedCallback(): void { this.generation++; this.cancelLoad?.(); this.close(); }
  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (old === value) return;
    if (name === "value") { this.pendingValue = value ?? ""; if (!this.loading) this.commit(this.pendingValue, false); }
    else if (name === "placeholder") this.input.placeholder = value ?? "Search translations";
    else if (name === "disabled") this.updateDisabled();
    else if (name === "language") { this.language.value = value ?? "all"; this.close(); }
    else if (this.isConnected) this.scheduleLoad();
  }

  get value(): string { return this.selected?.id ?? ""; }
  set value(value: string) { this.pendingValue = value; if (!this.loading) this.commit(value, false); }
  get bibleProvider(): BibleProvider | undefined { return this.override; }
  set bibleProvider(provider: BibleProvider | undefined) { this.override = provider; if (this.isConnected) this.scheduleLoad(); }
  get form(): HTMLFormElement | null { return this.internals.form; }
  get validity(): ValidityState { return this.internals.validity; }
  get validationMessage(): string { return this.internals.validationMessage; }
  checkValidity(): boolean { return this.internals.checkValidity(); }
  reportValidity(): boolean { return this.internals.reportValidity(); }
  focus(options?: FocusOptions): void { this.input.focus(options); }
  formResetCallback(): void { this.value = this.defaultValue(this.provider ?? resolveProvider(providerDefaults)); }
  formDisabledCallback(disabled: boolean): void { this.formDisabled = disabled; this.updateDisabled(); }

  private defaultValue(provider: BibleProvider): string {
    const pageVersion = provider === resolveProvider(providerDefaults)
      ? providerDefaults.bibleVersionId ?? (provider.id === "youversion" ? providerDefaults.yvpBibleVersionId?.toString() : undefined)
      : undefined;
    return this.getAttribute("value") ?? pageVersion ?? provider.defaultVersionId;
  }

  private updateDisabled(): void {
    const disabled = this.loading || this.failed || this.formDisabled || this.hasAttribute("disabled");
    this.input.disabled = disabled;
    this.language.disabled = disabled;
    this.retry.disabled = this.formDisabled || this.hasAttribute("disabled");
    if (disabled) this.close();
  }
  private close(): void {
    this.list.hidden = true;
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
  }
  private highlight(index: number): void {
    this.active = index;
    [...this.list.children].forEach((option, i) => option.setAttribute("aria-selected", String(i === index)));
    const option = this.list.children[index] as HTMLElement | undefined;
    if (option) {
      this.input.setAttribute("aria-activedescendant", option.id);
      if (option.offsetTop < this.list.scrollTop) this.list.scrollTop = option.offsetTop;
      else if (option.offsetTop + option.offsetHeight > this.list.scrollTop + this.list.clientHeight) {
        this.list.scrollTop = option.offsetTop + option.offsetHeight - this.list.clientHeight;
      }
    } else this.input.removeAttribute("aria-activedescendant");
  }
  private suggest(): void {
    if (this.input.disabled) return;
    const query = this.selected && this.input.value === labelOf(this.selected) ? "" : this.input.value.trim().toLocaleLowerCase();
    this.filtered = this.versions.filter((version) =>
      (!this.language.value || this.language.value === "all" || version.language === this.language.value) &&
      `${version.title} ${version.abbreviation} ${version.languageName ?? ""}`.toLocaleLowerCase().includes(query));
    this.list.replaceChildren(...this.filtered.map((version, index) => {
      const option = document.createElement("li");
      option.id = `${this.list.id}-${index}`;
      option.dataset.index = String(index);
      option.setAttribute("role", "option");
      option.setAttribute("part", "option");
      option.textContent = labelOf(version);
      if (this.language.value === "all" && version.languageName) {
        const language = document.createElement("span");
        language.className = "language-name";
        language.textContent = version.languageName;
        option.append(language);
      }
      return option;
    }));
    this.status.textContent = this.filtered.length ? `${this.filtered.length} translations` : "No matching translations. Try another search or language.";
    this.list.hidden = !this.filtered.length;
    this.input.setAttribute("aria-expanded", String(!this.list.hidden));
    this.highlight(Math.max(0, this.filtered.findIndex((version) => version.id === this.value)));
  }
  private commit(id: string, notify: boolean): void {
    const previous = this.value;
    this.selected = this.versions.find((version) => version.id === id);
    this.input.value = this.selected ? labelOf(this.selected) : "";
    this.internals.setFormValue(this.selected?.id ?? null);
    const invalid = Boolean(id && !this.selected && this.provider);
    this.internals.setValidity(invalid ? { customError: true } : {}, invalid ? "This translation is not available from the selected provider." : "", this.input);
    this.input.setAttribute("aria-invalid", String(invalid));
    if (invalid) this.status.textContent = "This translation is not available from the selected provider.";
    else this.status.textContent = `${this.versions.filter((version) => !this.language.value || this.language.value === "all" || version.language === this.language.value).length} translations available`;
    this.close();
    if (notify && previous !== this.value) {
      this.pendingValue = this.value;
      this.dispatchEvent(new CustomEvent<VersionInputDetail>("change", { bubbles: true, detail: { provider: this.provider!.id, bibleVersionId: this.value, bibleVersion: this.selected ?? null } }));
    }
  }
  private scheduleLoad(): void {
    this.generation++;
    this.cancelLoad?.();
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.isConnected) this.cancelLoad = Effect.runCallback(this.load(this.generation).pipe(
        Effect.catch((error) => Effect.sync(() => {
          this.selected = undefined;
          this.versions = [];
          this.input.value = "";
          this.status.textContent = "Unable to load translations.";
          this.internals.setValidity({ customError: true }, "Unable to load translations.", this.input);
          this.input.setAttribute("aria-invalid", "true");
          this.loading = false;
          this.failed = true;
          this.updateDisabled();
          this.retry.hidden = false;
          this.dispatchEvent(new CustomEvent("scripture-error", { detail: error }));
        })),
      ));
    });
  }
  private readonly load = Effect.fn("scripture.versionInput.load")(function*(this: ScriptureVersionInput, generation: number) {
    const previous = this.pendingValue ?? this.selected?.id;
    this.loading = true;
    this.failed = false;
    this.updateDisabled();
    this.retry.hidden = true;
    this.status.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Loading translations';
    this.internals.setFormValue(null);
    this.internals.setValidity({});
    this.input.setAttribute("aria-invalid", "false");
      const provider = yield* resolveProviderEffect({
        ...providerDefaults,
        provider: (this.getAttribute("provider") as ProviderOptions["provider"]) || this.override || providerDefaults.provider,
        yvpPublicAppKey: this.getAttribute("yvp-public-app-key") || providerDefaults.yvpPublicAppKey,
        yvpApiHost: this.getAttribute("yvp-api-host") || providerDefaults.yvpApiHost,
      });
      const versions = yield* listBibleVersionsEffect({ provider });
      if (!this.isConnected || generation !== this.generation) return;
      this.provider = provider;
      this.versions = [...versions].sort((a, b) => a.title.localeCompare(b.title));
      const languages = new Map<string, string>();
      for (const version of versions) if (version.language) languages.set(version.language, version.languageName || version.language);
      this.language.replaceChildren(new Option("All languages", "all"), ...[...languages].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => new Option(name, id)));
      const wanted = this.pendingValue ?? previous ?? this.defaultValue(provider);
      const selected = versions.find((version) => version.id === wanted);
      const language = this.getAttribute("language") || selected?.language || new Intl.Locale(navigator.language).language;
      this.language.value = languages.has(language) ? language : "all";
      this.commit(wanted, false);
      this.pendingValue = undefined;
      this.loading = false;
      this.updateDisabled();
      this.dispatchEvent(new CustomEvent("scripture-versions-load", { detail: { provider: provider.id, versions } }));
  });
}

/** Registers <si-version-input>, sharing provider defaults with standalone passages. */
export function defineVersionInput(options: ProviderOptions = {}): void {
  Object.assign(providerDefaults, options);
  if (!customElements.get(VERSION_INPUT_TAG)) customElements.define(VERSION_INPUT_TAG, ScriptureVersionInput);
}

declare global { interface HTMLElementTagNameMap { "si-version-input": ScriptureVersionInput; } }
