import { Effect } from "effect";

/** DOM resources live in the caller's Scope, not in detached event callbacks. */
export const listen = (target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions | boolean) =>
  Effect.acquireRelease(
    Effect.sync(() => target.addEventListener(type, listener, options)),
    () => Effect.sync(() => target.removeEventListener(type, listener, options)),
  );

export const nextFrame = Effect.callback<void>((resume) => {
  const frame = requestAnimationFrame(() => resume(Effect.void));
  return Effect.sync(() => cancelAnimationFrame(frame));
});

export const waitForEvent = (target: EventTarget, types: readonly string[]) => Effect.callback<void>((resume) => {
  const done = () => resume(Effect.void);
  for (const type of types) target.addEventListener(type, done);
  return Effect.sync(() => { for (const type of types) target.removeEventListener(type, done); });
});
