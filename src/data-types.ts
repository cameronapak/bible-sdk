import { Context, Effect, Schema } from "effect";
import type { PassageDisplay } from "./providers";

export const BibleVersion = Schema.Struct({
  id: Schema.NonEmptyString,
  abbreviation: Schema.String,
  title: Schema.String,
  language: Schema.optional(Schema.String),
  languageName: Schema.optional(Schema.String),
});
export type BibleVersion = typeof BibleVersion.Type;

export const DisplayInstruction = Schema.Struct({
  code: Schema.NonEmptyString,
  level: Schema.Literals(["required", "recommended", "notice"]),
  appliesTo: Schema.Literals(["all", "text", "html"]),
  text: Schema.NonEmptyString,
  urls: Schema.optional(Schema.Array(Schema.String)),
});
export type DisplayInstruction = typeof DisplayInstruction.Type;

export const BibleBook = Schema.Struct({ id: Schema.NonEmptyString, title: Schema.String });
export type BibleBook = typeof BibleBook.Type;
export const BibleChapter = Schema.Struct({ passageId: Schema.NonEmptyString, number: Schema.Int.check(Schema.isGreaterThan(0)) });
export type BibleChapter = typeof BibleChapter.Type;

export const ScripturePassage = Schema.Struct({
  provider: Schema.NonEmptyString,
  source: Schema.Struct({ url: Schema.String, versionId: Schema.NonEmptyString }),
  requestedPassageId: Schema.NonEmptyString,
  passageId: Schema.NonEmptyString,
  reference: Schema.String,
  text: Schema.String,
  version: BibleVersion.mapFields((fields) => ({ ...fields, sourceLanguage: Schema.optional(Schema.String) })),
  attribution: Schema.Struct({ text: Schema.NonEmptyString, urls: Schema.Array(Schema.String) }),
  licenses: Schema.Array(Schema.Struct({
    name: Schema.optional(Schema.String), url: Schema.String,
    restrictions: Schema.optional(Schema.Record(Schema.String, Schema.Union([Schema.Boolean, Schema.String]))),
  })),
  numbering: Schema.Literals(["kjv", "unknown"]),
  sourceLimitations: Schema.optional(Schema.Array(Schema.Struct({
    kind: Schema.Literal("source-trimming"),
    startPassageId: Schema.NonEmptyString,
    endPassageId: Schema.NonEmptyString,
    appliesToRequest: Schema.Boolean,
  }))),
  display: Schema.Struct({
    format: Schema.Literal("text"),
    whitespace: Schema.Literal("pre-wrap"),
    attributionPlacement: Schema.Literal("after-passage"),
    direction: Schema.optional(Schema.Literals(["ltr", "rtl"])),
    language: Schema.optional(Schema.String),
    nativeHtml: Schema.optional(Schema.Struct({
      containerAttributes: Schema.Record(Schema.String, Schema.String),
      stylesheets: Schema.Array(Schema.Struct({ kind: Schema.Literals(["bible", "font"]), href: Schema.String })),
    })),
  }),
  instructions: Schema.Array(DisplayInstruction),
});
export type ScripturePassage = typeof ScripturePassage.Type;

/** Data capabilities are separate from the existing custom display-provider contract. */
export interface BibleDataProvider {
  readonly id: string;
  readonly defaultVersionId: string;
  listVersions(): Effect.Effect<BibleVersion[], ScriptureError>;
  listBooks(versionId: string): Effect.Effect<BibleBook[], ScriptureError>;
  listChapters(versionId: string, bookId: string): Effect.Effect<BibleChapter[], ScriptureError>;
  getPassageData(versionId: string, passageId: string): Effect.Effect<ScripturePassage, ScriptureError>;
  readonly clearCache: Effect.Effect<void>;
}

export interface BibleDisplayProvider extends BibleDataProvider {
  getPassageDisplay(versionId: string, passageId: string): Effect.Effect<PassageDisplay, ScriptureError>;
}

export class BibleSource extends Context.Service<BibleSource, BibleDataProvider>()("@faith-tools/scripture-inline/data/BibleSource") {}

export const ScriptureErrorCode = Schema.Literals(["invalid_reference", "unavailable", "unsupported", "authentication", "rate_limit", "network", "timeout", "invalid_response"]);
export type ScriptureErrorCode = typeof ScriptureErrorCode.Type;

export class ScriptureError extends Schema.TaggedError<ScriptureError>()("ScriptureError", {
  code: ScriptureErrorCode,
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {
  get retryable(): boolean { return this.code === "network" || this.code === "rate_limit"; }
}
