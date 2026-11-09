// @vitest-environment jsdom
import { expect, it } from "vitest";

// jsdom has no matchMedia, which the passage component reads when it loads.
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
const { scriptureInline } = await import("./index");

// MutationObserver callbacks run as a microtask after the change.
const settle = () => new Promise((resolve) => setTimeout(resolve));

it("keeps linking references and opening cards after a router swaps the body, as Turbo does", async () => {
  document.body.innerHTML = `<p>Home: John 3:16</p>`;
  const inline = scriptureInline();
  expect(inline.links).toHaveLength(1);

  // Turbo Drive caches a clone of the page, replaces <body> with the next page's body, and merges its <head>.
  const cached = document.body.cloneNode(true) as HTMLElement;
  const next = document.createElement("body");
  next.innerHTML = `<article><p>Post: Rom 8:28-30</p></article>`;
  document.documentElement.replaceChild(next, document.body);
  document.title = "Romans 8";
  await settle();

  const link = next.querySelector("a.scripture-inline-ref") as HTMLAnchorElement;
  expect(link?.textContent).toBe("Rom 8:28-30");
  expect(document.head.querySelector("a")).toBeNull();
  // The old page's link is forgotten, so only the new page's link remains.
  expect(inline.links).toEqual([link]);

  // Content a script adds later, as plain text, is linked too.
  next.querySelector("p")!.append(" and Gen 1:1");
  await settle();
  expect(inline.links.map((a) => a.textContent)).toEqual(["Rom 8:28-30", "Gen 1:1"]);

  // The click opens a card instead of following the link to route.bible.
  const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  link.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);

  // Going back restores the cached clone, whose link is already wrapped. stop() still unwraps it.
  document.documentElement.replaceChild(cached, next);
  await settle();
  expect(inline.links).toEqual([cached.querySelector("a.scripture-inline-ref")]);

  inline.stop();
  expect(cached.innerHTML).toBe("<p>Home: John 3:16</p>");
  cached.append("Ps 23");
  await settle();
  expect(cached.querySelector("a")).toBeNull();
});
