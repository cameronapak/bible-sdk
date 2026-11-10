// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { unwrapReferences, wrapReferences } from "./scan";

describe("wrapReferences", () => {
  it("links references in prose and leaves code, links, and the rest of the text alone", () => {
    document.body.innerHTML = `
      <p>Read <em>John 3:16</em> and Rom 8:28-30 today.</p>
      <pre>John 3:16</pre>
      <a href="/x">Gen 1:1</a>
      <si-passage><h2>Psalm 23</h2></si-passage>
      <bible-sk-passage><h2>Psalm 24</h2></bible-sk-passage>
      <si-passage-input>Romans 8</si-passage-input>
      <bible-sk-passage-input>Romans 9</bible-sk-passage-input>`;

    const links = wrapReferences(document.body);

    expect(links.map((a) => [a.textContent, a.href])).toEqual([
      ["John 3:16", "https://route.bible/jhn.3.16"],
      ["Rom 8:28-30", "https://route.bible/rom.8.28-30"],
    ]);
    expect(document.querySelector("p")!.textContent).toBe("Read John 3:16 and Rom 8:28-30 today.");
    expect(document.querySelector("pre")!.innerHTML).toBe("John 3:16");

    // A second pass finds nothing new because the references are now inside links.
    expect(wrapReferences(document.body)).toEqual([]);
  });

  it("unwraps back to the original text, so the page can be scanned again", () => {
    const original = `<p>Read <em>John 3:16</em> and Rom 8:28-30 today.</p>`;
    document.body.innerHTML = original;

    unwrapReferences(wrapReferences(document.body));

    expect(document.body.innerHTML).toBe(original);
    // One text node again, not three, so a reference never spans split nodes.
    expect(document.querySelector("p")!.childNodes).toHaveLength(3);
    expect(wrapReferences(document.body)).toHaveLength(2);
  });
});
