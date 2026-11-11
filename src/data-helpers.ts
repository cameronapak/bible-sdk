import { Cache, Duration, Effect, Exit, Schema } from "effect";
import { ScriptureError, type DisplayInstruction } from "./data-types.js";

/** Validate before passing source metadata to Intl constructors. */
export const SourceLanguage = Schema.String.check(Schema.makeFilter((value) => {
  try { new Intl.Locale(value); return true; } catch { return "Invalid source language tag."; }
}));

export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function attributionLink(text: string, url: string): string {
  const label = escapeHtml(text);
  return /^https?:\/\//i.test(url) ? `<a href="${escapeHtml(url)}">${label}</a>` : label;
}

const PassageId = Schema.String.check(Schema.isPattern(/^[1-4A-Z][A-Z0-9]{2}\.[1-9]\d*(?:\.[1-9]\d*(?:-[1-9]\d*)?)?$/));
const BookId = Schema.String.check(Schema.isPattern(/^[1-4A-Z][A-Z0-9]{2}$/));
const PassageNumber = Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER));
const Range = Schema.Struct({
  book: BookId,
  chapter: PassageNumber,
  first: Schema.optional(PassageNumber),
  last: Schema.optional(PassageNumber),
}).check(Schema.makeFilter((range) => range.first === undefined || range.last! >= range.first || "Range endpoints must be ascending."));
const invalidReference = (cause: unknown) => new ScriptureError({ code: "invalid_reference", message: "Use an uppercase USFM verse, ascending range, or chapter with positive safe integers. Ranges cannot cross chapters.", cause });

/** Structural validation only. Availability always comes from the selected source. */
export const passageRange = Effect.fnUntraced(function*(passageId: string) {
  const id = yield* Schema.decodeUnknownEffect(PassageId)(passageId).pipe(Effect.mapError(invalidReference));
  const [book, chapter, verses] = id.split(".");
  const [first, last = first] = verses?.split("-") ?? [];
  return yield* Schema.decodeUnknownEffect(Range)({ book, chapter, first, last }).pipe(Effect.mapError(invalidReference));
});

export const bookId = (value: string) => Schema.decodeUnknownEffect(BookId)(value).pipe(Effect.mapError(invalidReference));

export function validateVerses(numbers: readonly number[], first?: number, last?: number): Effect.Effect<void, ScriptureError> {
  return !numbers.length || (first !== undefined && (!numbers.includes(first) || !numbers.includes(last!)))
    ? Effect.fail(new ScriptureError({ code: "unavailable", message: "Passage is not available in this version." })) : Effect.void;
}

export function textInstructions(): DisplayInstruction[] {
  return [
    { code: "display-attribution", level: "required", appliesTo: "all", text: "Display attribution.text after the passage, separately from Scripture. Preserve its wording and supplied source and license links." },
    { code: "preserve-scripture", level: "required", appliesTo: "text", text: "Render text as text, not HTML. Preserve wording, punctuation, meaningful line and paragraph breaks, and display.direction when supplied. Do not add notes or headings to the Scripture text." },
    { code: "verify-license", level: "required", appliesTo: "all", text: "Check the selected translation's license and provider terms for your intended use. Missing metadata is not permission for commercial use, redistribution, modifications, or offline storage." },
    { code: "plain-text-limits", level: "notice", appliesTo: "text", text: "Plain text omits verse numbers, editorial headings, notes, and rich formatting. It is not a lossless representation of the source edition." },
  ];
}

/** Bounded Effect cache. Failed exits expire immediately and lookups inherit caller services. */
export function requestCache(timeToLive: Duration.Input = Duration.infinity) {
  const lookups = new Map<string, () => Effect.Effect<unknown, ScriptureError>>();
  const cache = Effect.runSync(Cache.makeWith(
    (key: string) => Effect.suspend(() => lookups.get(key)!()),
    { capacity: 256, requireServicesAt: "lookup", timeToLive: (exit) => Exit.isSuccess(exit) ? timeToLive : Duration.zero },
  ));
  return {
    get<T>(key: string, load: () => Effect.Effect<T, ScriptureError>): Effect.Effect<T, ScriptureError> {
      return Effect.suspend(() => {
        lookups.set(key, load);
        return (Cache.get(cache, key) as Effect.Effect<T, ScriptureError>).pipe(
          Effect.ensuring(Effect.sync(() => { if (lookups.get(key) === load) lookups.delete(key); })),
        );
      });
    },
    invalidate: (key: string) => Cache.invalidate(cache, key),
    clear: Cache.invalidateAll(cache),
  };
}
