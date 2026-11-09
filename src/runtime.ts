import { Context, Duration, Effect, Schedule, Schema } from "effect";
import { ScriptureError, type BibleDisplayProvider } from "./data-types";
import type { BibleProvider } from "./providers";

export const decodeResponse = <S extends Schema.Constraint & { DecodingServices: never }>(schema: S) => (value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError((cause) => new ScriptureError({ code: "invalid_response", message: "Bible provider returned invalid data.", cause })));

/** Override per program, including in tests. The timeout bounds the entire retry sequence. */
export const RequestPolicy = Context.Reference<{
  timeout: Duration.Input;
  retries: number;
}>("@faith-tools/scripture-inline/RequestPolicy", {
  defaultValue: () => ({ timeout: "15 seconds", retries: 2 }),
});

const HttpFailure = Schema.Struct({ status: Schema.Number });
const NestedHttpFailure = Schema.Struct({ response: HttpFailure });
const readStatus = Schema.decodeUnknownOption(HttpFailure);
const readNestedStatus = Schema.decodeUnknownOption(NestedHttpFailure);
const readCode = Schema.decodeUnknownOption(Schema.Struct({ code: Schema.String }));

export function requestError(cause: unknown): ScriptureError {
  if (cause instanceof ScriptureError) return cause;
  const direct = readStatus(cause);
  const nested = readNestedStatus(cause);
  const upstreamCode = readCode(cause);
  const status = direct._tag === "Some" ? direct.value.status : nested._tag === "Some" ? nested.value.response.status
    : Number(cause instanceof Error ? /(?:Status: |^)(\d{3})\b/.exec(cause.message)?.[1] : undefined);
  const code = upstreamCode._tag === "Some" && upstreamCode.value.code === "missing_passage_attribution" ? "unavailable"
    : cause instanceof SyntaxError || (cause instanceof Error && /^\$?ZodError$/.test(cause.name)) ? "invalid_response"
    : status === 401 || status === 403 ? "authentication"
    : status === 429 ? "rate_limit"
    : status >= 400 && status < 500 ? "unavailable" : "network";
  return new ScriptureError({ code, message: `Bible provider request failed (${code}).`, cause });
}

/** The only Promise boundary for upstream SDKs. Pass the signal when the SDK supports it. */
export const request = Effect.fn("scripture.request")(function*<A>(
  operation: string,
  load: (signal: AbortSignal) => PromiseLike<A>,
  retry = true,
) {
  yield* Effect.annotateCurrentSpan({ operation });
  const policy = yield* RequestPolicy;
  return yield* Effect.tryPromise({ try: load, catch: requestError }).pipe(
    Effect.retry({ times: retry ? policy.retries : 0, schedule: Schedule.exponential("100 millis"), while: (error) => error.retryable }),
    Effect.timeoutOrElse({ duration: policy.timeout, orElse: () => Effect.fail(new ScriptureError({ code: "timeout", message: "Bible provider request timed out." })) }),
  );
});

/** Promise methods are compatibility edges, not the implementation of built-in providers. */
export function withPromises(effects: BibleDisplayProvider): BibleProvider & { readonly effects: BibleDisplayProvider } {
  return {
    id: effects.id,
    defaultVersionId: effects.defaultVersionId,
    effects,
    listVersions: () => Effect.runPromise(effects.listVersions()),
    getPassage: (versionId, passageId) => Effect.runPromise(effects.getPassageDisplay(versionId, passageId)),
  };
}
