import {
  OSIS_BOOK_CODES,
  OSIS_BOOK_NAMES,
  autocompletePassage,
  formatPassageForDisplay,
  getChapterCount,
  getVerseCount,
  resolveBookAlias,
  tryParsePassage,
  type AutocompletePassageSuggestion,
  type OsisBookCode,
} from "grab-bcv";

export const PASSAGE_INPUT_TAG = "si-passage-input";
/** @deprecated The rebrand omitted the d in SDK. Use BIBLE_SDK_PASSAGE_INPUT_TAG. */
export const BIBLE_PASSAGE_INPUT_TAG = "bible-sk-passage-input";
export const BIBLE_SDK_PASSAGE_INPUT_TAG = "bible-sdk-passage-input";

// Shadow DOM, so page CSS can't restyle the field or its list. The wrapper resets what the
// host inherits. The field reads the page's design tokens (--input, --ring, --radius, and
// friends), which inherit into the shadow root, and pages restyle it with ::part().
const STYLES = `
:host { display: block; position: relative; }
.root { all: initial; display: block; position: relative; color: inherit; font: 0.875rem/1.5 var(--font-sans, system-ui, sans-serif); }
input {
  box-sizing: border-box;
  width: 100%;
  height: 2.25rem;
  margin: 0;
  padding: 0.25rem 0.75rem;
  font: inherit;
  color: inherit;
  background: none;
  border: 1px solid var(--input, color-mix(in srgb, currentColor 20%, transparent));
  border-radius: calc(var(--radius, 0.625rem) - 2px);
  box-shadow: 0 1px 2px #0000000d;
  outline: none;
  transition: color 0.15s, box-shadow 0.15s;
}
/* iOS Safari zooms the page into a focused field whose text is under 16px. */
@media (pointer: coarse) { input { font-size: 16px; } }
input:focus-visible {
  border-color: var(--ring, Highlight);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring, Highlight) 50%, transparent);
}
input[aria-invalid="true"] { border-color: var(--destructive, #dc2626); }
input:disabled { cursor: not-allowed; opacity: 0.5; }
[role="listbox"] {
  position: absolute;
  inset: calc(100% + 4px) 0 auto;
  z-index: 50;
  box-sizing: border-box;
  max-height: 16rem;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  list-style: none;
  color: var(--popover-foreground, inherit);
  background: var(--popover, Canvas);
  border: 1px solid var(--border, color-mix(in srgb, currentColor 15%, transparent));
  border-radius: var(--radius, 0.625rem);
  box-shadow: 0 8px 24px -8px rgb(0 0 0 / 0.2);
}
[role="listbox"][hidden] { display: none; }
[role="option"] > .si-passage-count {
  /* The label wraps before the count does. */
  flex-shrink: 0;
  white-space: nowrap;
  margin-inline-start: auto;
  font-size: 0.75rem;
  color: var(--muted-foreground, color-mix(in srgb, currentColor 60%, transparent));
}
[role="option"] {
  /* Baseline alignment keeps the smaller count on the label's line. */
  display: flex;
  align-items: baseline;
  gap: 1rem;
  padding: 0.375rem 0.5rem;
  border-radius: calc(var(--radius, 0.625rem) - 4px);
  cursor: default;
}
[role="option"][aria-selected="true"] {
  color: var(--accent-foreground, inherit);
  background: var(--accent, color-mix(in srgb, currentColor 10%, transparent));
}
[role="option"][aria-disabled="true"] {
  color: var(--muted-foreground, color-mix(in srgb, currentColor 60%, transparent));
}
@media (hover: hover) and (pointer: fine) {
  [role="option"]:not([aria-disabled]):hover {
    background: var(--accent, color-mix(in srgb, currentColor 10%, transparent));
  }
}`;

let ids = 0;

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export type BookOrder = "canonical" | "alphabetical";

const ALPHABETICAL = [...OSIS_BOOK_CODES].sort((a, b) =>
  OSIS_BOOK_NAMES[a].localeCompare(OSIS_BOOK_NAMES[b], undefined, { numeric: true }),
);

/** Every book, as Genesis to Revelation or as A to Z. */
function booksOf(order: BookOrder): AutocompletePassageSuggestion[] {
  return (order === "alphabetical" ? ALPHABETICAL : OSIS_BOOK_CODES).map((book) => ({
    kind: "book",
    canonical: book,
    label: OSIS_BOOK_NAMES[book],
    insertText: OSIS_BOOK_NAMES[book],
  }));
}

/**
 * The book in text that names only a book, such as "1 John", "1st John", or the typo "Romns".
 * resolveBookAlias alone also accepts "Matthew 5-7", so any digit past a leading ordinal rules it out.
 */
function bookNamed(text: string): OsisBookCode | null {
  return /^\s*(\d\s*)?[^\d:;,\-–—]+$/.test(text) ? resolveBookAlias(text) : null;
}

/** Every range that starts at `from`, such as Psalms 119:1-2 through 119:1-176. */
function rangesOf(book: OsisBookCode, chapter: number, from: number): AutocompletePassageSuggestion[] {
  const verses = getVerseCount(book, chapter) ?? 0;
  return Array.from({ length: Math.max(verses - from, 0) }, (_, index) => {
    const label = `${OSIS_BOOK_NAMES[book]} ${chapter}:${from}-${from + index + 1}`;
    return { kind: "range", canonical: `${book}.${chapter}.${from}-${from + index + 1}`, label, insertText: label };
  });
}

/** Keeps "1 Thessalonians 1" from breaking after "1" or before the chapter in a narrow list. */
const unbreakable = (label: string) => label.replace(/^(\d) /, "$1\u00a0").replace(/ (?=[\d:-]+$)/, "\u00a0");

/** Every verse of a chapter, such as Romans 8:1 through Romans 8:39. */
function versesOf(book: OsisBookCode, chapter: number): AutocompletePassageSuggestion[] {
  return Array.from({ length: getVerseCount(book, chapter) ?? 0 }, (_, index) => {
    const label = `${OSIS_BOOK_NAMES[book]} ${chapter}:${index + 1}`;
    return { kind: "verse", canonical: `${book}.${chapter}.${index + 1}`, label, insertText: label };
  });
}

/** Every chapter of `book`, such as James 1 through James 5. */
function chaptersOf(book: OsisBookCode): AutocompletePassageSuggestion[] {
  return Array.from({ length: getChapterCount(book) }, (_, index) => {
    const label = `${OSIS_BOOK_NAMES[book]} ${index + 1}`;
    return { kind: "chapter", canonical: `${book}.${index + 1}`, label, insertText: label };
  });
}

/** The count shown beside a suggestion: chapters for a book, verses for a chapter. */
function suggestionCount({ kind, canonical }: AutocompletePassageSuggestion): string {
  const [book, chapter] = canonical.split(".") as [OsisBookCode, string];
  if (kind === "book") return count(getChapterCount(book), "chapter");
  if (kind === "chapter") {
    const verses = getVerseCount(book, Number(chapter));
    return verses ? count(verses, "verse") : "";
  }
  return "";
}

export type PassageInputDetail = { passageId: string; label: string };

/**
 * A text input for a Bible passage. Typing "Roman 8" suggests Romans 8, and the element's
 * `value` is the passage ID, such as "ROM.8" or "ROM.8.28-30". It submits with a form under
 * `name`, and fires `change` with `detail: { passageId, label }` when the passage changes.
 * Parts: `input`, `listbox`, `option`, `count`.
 */
export class ScripturePassageInput extends HTMLElement {
  static formAssociated = true;
  static observedAttributes = ["value", "placeholder", "disabled", "book-order"];

  private readonly internals = this.attachInternals();
  private readonly input = document.createElement("input");
  private readonly list = document.createElement("ul");
  private suggestions: AutocompletePassageSuggestion[] = [];
  private active = -1;
  private committed = "";

  constructor() {
    super();
    const root = document.createElement("div");
    root.className = "root";
    const style = document.createElement("style");
    style.textContent = STYLES;
    root.append(this.input, this.list);
    this.attachShadow({ mode: "open" }).append(style, root);
    this.input.setAttribute("part", "input");
    this.list.setAttribute("part", "listbox");
    const id = `${PASSAGE_INPUT_TAG}-${++ids}`;
    Object.assign(this.input, { type: "text", autocomplete: "off", spellcheck: false });
    this.input.setAttribute("role", "combobox");
    this.input.setAttribute("aria-autocomplete", "list");
    this.input.setAttribute("aria-expanded", "false");
    this.input.setAttribute("aria-controls", `${id}-list`);
    this.list.id = `${id}-list`;
    this.list.setAttribute("role", "listbox");
    this.list.hidden = true;

    this.input.addEventListener("input", () => {
      // Editing clears an error until the next commit checks again.
      this.input.removeAttribute("aria-invalid");
      this.internals.setValidity({});
      this.suggest();
    });
    this.input.addEventListener("keydown", (event) => this.onKeydown(event));
    // Focusing the field opens the list: every book when it is empty, so the reader can browse.
    this.input.addEventListener("focus", () => this.suggest());
    // A click on the focused field reopens the list after Escape closed it.
    this.input.addEventListener("click", () => this.list.hidden && this.suggest());
    // This element fires its own change, with the passage, instead of the text field's.
    this.input.addEventListener("change", (event) => event.stopPropagation());
    this.input.addEventListener("blur", () => {
      this.close();
      this.commit(this.input.value);
    });
    // Keep focus in the field while the pointer picks an option.
    this.list.addEventListener("pointerdown", (event) => event.preventDefault());
    const pick = (event: Event) => {
      const option = (event.target as Element).closest<HTMLElement>("[role=option]:not([aria-disabled])");
      if (option) this.accept(this.suggestions[Number(option.dataset.index)]);
    };
    this.list.addEventListener("click", pick);
    // iOS Safari moves focus on the mouse events it fakes after a tap, which pointerdown can't
    // stop, so the field blurs and the list closes before the click. A tap picks on touchend
    // instead, and cancelling it skips those mouse events. A drag scrolls the list and picks nothing.
    let tapStart: Touch | undefined;
    this.list.addEventListener("touchstart", (event) => (tapStart = event.touches[0]), { passive: true });
    this.list.addEventListener("touchend", (event) => {
      const end = event.changedTouches[0];
      if (!tapStart || !end || Math.hypot(end.clientX - tapStart.clientX, end.clientY - tapStart.clientY) > 10) return;
      event.preventDefault();
      pick(event);
    });
    // A <label for> pointing at this element focuses the field. Clicks inside the shadow root
    // also target the host, so only a click on the host itself counts.
    this.addEventListener("click", (event) => event.composedPath()[0] === this && this.input.focus());
  }

  connectedCallback(): void {
    // The field takes its accessible name from this element's labels.
    const label = this.getAttribute("aria-label") ?? [...this.internals.labels].map((l) => l.textContent?.trim()).join(" ");
    if (label) this.input.setAttribute("aria-label", label);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "value") this.commit(value ?? "", false);
    else if (name === "placeholder") this.input.placeholder = value ?? "";
    else if (name === "disabled") this.input.disabled = value !== null;
    else if (!this.list.hidden) this.suggest();
  }

  /** The passage ID, such as "ROM.8.28-30", or "" when the field is empty or not a passage. */
  get value(): string {
    return this.committed;
  }

  set value(value: string) {
    this.commit(value, false);
  }

  get form(): HTMLFormElement | null {
    return this.internals.form;
  }

  get validity(): ValidityState {
    return this.internals.validity;
  }

  get validationMessage(): string {
    return this.internals.validationMessage;
  }

  checkValidity(): boolean {
    return this.internals.checkValidity();
  }

  reportValidity(): boolean {
    return this.internals.reportValidity();
  }

  focus(options?: FocusOptions): void {
    this.input.focus(options);
  }

  formResetCallback(): void {
    this.commit(this.getAttribute("value") ?? "", false);
  }

  formDisabledCallback(disabled: boolean): void {
    this.input.disabled = disabled;
  }

  /** Parses `text`. A passage replaces the text with its display form, such as "Romans 8". */
  private commit(text: string, notify = true): void {
    const trimmed = text.trim();
    const parsed = trimmed ? tryParsePassage(trimmed) : null;
    // Passage providers serve one chapter at most, so a passage cannot cross chapters.
    const spans = parsed?.ok && (parsed.value.start.book !== parsed.value.end.book || parsed.value.start.chapter !== parsed.value.end.chapter);
    if ((parsed && !parsed.ok) || spans) {
      // Keep what the reader typed so they can fix it.
      const message = spans ? "Choose verses within one chapter." : "Enter a Bible passage, such as Romans 8.";
      this.input.value = text;
      this.input.setAttribute("aria-invalid", "true");
      this.internals.setValidity({ customError: true }, message, this.input);
      return;
    }
    this.input.removeAttribute("aria-invalid");
    this.internals.setValidity({});
    const passageId = parsed?.value.canonical ?? "";
    const label = parsed ? formatPassageForDisplay(parsed.value) : "";
    this.input.value = label;
    if (passageId === this.committed) return;
    this.committed = passageId;
    this.internals.setFormValue(passageId || null);
    if (notify) {
      this.dispatchEvent(new CustomEvent<PassageInputDetail>("change", { bubbles: true, detail: { passageId, label } }));
    }
  }

  /** "canonical" (default) lists books Genesis to Revelation; "alphabetical" lists them A to Z. */
  get bookOrder(): BookOrder {
    return this.getAttribute("book-order") === "alphabetical" ? "alphabetical" : "canonical";
  }

  /** The options for the text typed so far, from the broadest choice to the narrowest. */
  private options(text: string): AutocompletePassageSuggestion[] {
    // Nothing typed yet: every book, so the reader can browse.
    if (!text) return booksOf(this.bookOrder);

    // "Ps 119:1-" or "Ps 119:1-1": every range from verse 1 (grab-bcv stops at 50).
    const range = /^(.+?)\s*(\d+)\s*:\s*(\d+)\s*[-–—]\s*(\d*)$/.exec(text);
    const rangeBook = range && bookNamed(range[1]);
    if (rangeBook) {
      const end = range[4];
      return rangesOf(rangeBook, Number(range[2]), Number(range[3])).filter((s) => s.canonical.split("-")[1].startsWith(end));
    }
    // "Ps 119:" or "Ps 119:1": every verse it could become.
    const verse = /^(.+?)\s*(\d+)\s*:\s*(\d*)$/.exec(text);
    const verseBook = verse && bookNamed(verse[1]);
    if (verseBook) {
      return versesOf(verseBook, Number(verse[2])).filter((s) => s.canonical.split(".")[2].startsWith(verse[3]));
    }
    // "John 1": every chapter it could become, 1 and 10-19.
    const chapter = /^(.+?)\s*(\d+)$/.exec(text);
    const chapterBook = chapter && bookNamed(chapter[1]);
    if (chapterBook) {
      return chaptersOf(chapterBook).filter((s) => s.canonical.split(".")[1].startsWith(chapter[2]));
    }

    // Partial book names, in the chosen order. A book typed out in full lists its chapters.
    const books = autocompletePassage(text, { limit: 200 }).filter((s) => s.kind === "book");
    const order = booksOf(this.bookOrder).map((s) => s.canonical);
    books.sort((a, b) => order.indexOf(a.canonical) - order.indexOf(b.canonical));
    const typedBook = bookNamed(text);
    const exact = books.find((s) => s.insertText.toLowerCase() === text.toLowerCase());
    if (typedBook && (exact || !books.length)) return chaptersOf(typedBook);
    if (books.length) return books;

    // Anything else that is already a passage, such as "Jn 3 16", offers itself to confirm it.
    const parsed = tryParsePassage(text);
    if (!parsed.ok) return [];
    const { start, end, canonical, rangeType } = parsed.value;
    if (start.book !== end.book || start.chapter !== end.chapter) return [];
    const label = formatPassageForDisplay(parsed.value);
    const kind = rangeType === "chapter" ? "chapter" : rangeType === "single" ? "verse" : "range";
    return [{ kind, canonical, label, insertText: label }];
  }

  private suggest(): void {
    this.suggestions = this.options(this.input.value.trim());
    this.active = -1;
    this.list.replaceChildren(
      ...this.suggestions.map((suggestion, index) => {
        const option = document.createElement("li");
        option.id = `${this.list.id}-${index}`;
        option.dataset.index = String(index);
        option.setAttribute("role", "option");
        option.setAttribute("part", "option");
        option.setAttribute("aria-selected", "false");
        option.textContent = unbreakable(suggestion.label);
        const total = suggestionCount(suggestion);
        if (total) {
          const badge = document.createElement("span");
          badge.className = "si-passage-count";
          badge.setAttribute("part", "count");
          badge.textContent = total;
          option.append(badge);
        }
        return option;
      }),
    );
    // Typed text with nothing to offer says so, instead of looking like a slow app.
    if (!this.suggestions.length && this.input.value.trim()) {
      const empty = document.createElement("li");
      empty.setAttribute("role", "option");
      empty.setAttribute("part", "option");
      empty.setAttribute("aria-disabled", "true");
      empty.textContent = "No passage matches";
      this.list.append(empty);
    }
    this.list.hidden = !this.list.childElementCount;
    this.input.setAttribute("aria-expanded", String(!this.list.hidden));
    this.input.removeAttribute("aria-activedescendant");
  }

  private highlight(index: number): void {
    this.active = index;
    for (const option of this.list.children) {
      option.setAttribute("aria-selected", String(option.id === `${this.list.id}-${index}`));
    }
    const option = this.list.children[index];
    if (option) {
      this.input.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    } else this.input.removeAttribute("aria-activedescendant");
  }

  private close(): void {
    this.list.hidden = true;
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
    this.active = -1;
  }

  /** A book fills in its name and keeps typing going; a chapter or verse is a full passage. */
  private accept(suggestion: AutocompletePassageSuggestion): void {
    if (suggestion.kind === "book") {
      this.input.value = `${suggestion.insertText} `;
      this.suggest();
      return;
    }
    this.close();
    this.commit(suggestion.insertText);
  }

  private onKeydown(event: KeyboardEvent): void {
    const open = !this.list.hidden;
    const count = this.suggestions.length;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!open) return this.suggest();
        // Past either end, the highlight returns to the typed text (-1).
        const next = this.active + (event.key === "ArrowDown" ? 1 : -1);
        this.highlight(next >= count ? -1 : next < -1 ? count - 1 : next);
        return;
      }
      case "Enter": {
        // Typed text that is already a passage wins, so "Rom 8:28-30" needs no suggestion.
        const typed = tryParsePassage(this.input.value.trim());
        if (open) event.preventDefault();
        // An empty field has nothing to pick; Enter just closes the book list.
        if (!this.input.value.trim() && this.active < 0) {
          this.close();
          return this.commit("");
        }
        if (this.active >= 0) return this.accept(this.suggestions[this.active]);
        if (typed.ok || !count) {
          this.close();
          return this.commit(this.input.value);
        }
        return this.accept(this.suggestions[0]);
      }
      case "Tab":
        // Tab completes a book name; otherwise it moves on, and blur commits.
        if (count && !event.shiftKey && this.input.value.trim()) {
          const suggestion = this.suggestions[Math.max(this.active, 0)];
          if (suggestion.kind === "book" && `${suggestion.insertText} ` !== this.input.value) {
            event.preventDefault();
            this.accept(suggestion);
          }
        }
        return;
      case "Escape":
        if (open) {
          event.preventDefault();
          this.close();
        } else this.commit(this.committed, false);
        return;
    }
  }
}

/** Registers <bible-sdk-passage-input>, deprecated <bible-sk-passage-input>, and compatible <si-passage-input>. */
export function definePassageInput(): void {
  if (!customElements.get(PASSAGE_INPUT_TAG)) customElements.define(PASSAGE_INPUT_TAG, ScripturePassageInput);
  if (!customElements.get(BIBLE_PASSAGE_INPUT_TAG)) customElements.define(BIBLE_PASSAGE_INPUT_TAG, class extends ScripturePassageInput {});
  if (!customElements.get(BIBLE_SDK_PASSAGE_INPUT_TAG)) customElements.define(BIBLE_SDK_PASSAGE_INPUT_TAG, class extends ScripturePassageInput {});
}

declare global {
  interface HTMLElementTagNameMap {
    "si-passage-input": ScripturePassageInput;
    /** @deprecated Use bible-sdk-passage-input. */
    "bible-sk-passage-input": ScripturePassageInput;
    "bible-sdk-passage-input": ScripturePassageInput;
  }
}
