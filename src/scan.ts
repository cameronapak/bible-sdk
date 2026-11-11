import { parseToResolverUrl } from "grab-bcv";
import { findReferences } from "./find";

export const REF_CLASS = "scripture-inline-ref";

// Text inside these is never rewritten: it is code, a control, already a link, or Scripture we render.
const SKIP_SELECTOR = [
  "a",
  "button",
  "script",
  "style",
  "noscript",
  "template",
  "textarea",
  "input",
  "select",
  "option",
  "code",
  "pre",
  "kbd",
  "samp",
  "svg",
  "math",
  "[contenteditable]",
  // Our own components render Bible text and passage suggestions that must stay plain.
  "si-passage",
  "si-passage-input",
  "bible-sk-passage",
  "bible-sk-passage-input",
  "bible-sdk-passage",
  "bible-sdk-passage-input",
  "[data-scripture-inline-ignore]",
].join(",");

/**
 * Wraps every Bible reference under `root` in an `<a>` to its route.bible
 * page. Returns the links it created. Safe to run more than once.
 */
export function wrapReferences(root: Node): HTMLAnchorElement[] {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement && !node.parentElement.closest(SKIP_SELECTOR) && /\d/.test(node.nodeValue ?? "")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });

  // Collect first: replacing nodes while walking would skip siblings.
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  const links: HTMLAnchorElement[] = [];
  for (const node of textNodes) {
    const text = node.nodeValue ?? "";
    const refs = findReferences(text);
    if (refs.length === 0) continue;

    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    for (const ref of refs) {
      fragment.append(text.slice(cursor, ref.start));
      const link = doc.createElement("a");
      link.className = REF_CLASS;
      link.href = parseToResolverUrl("https://route.bible", ref.passage.canonical);
      link.target = "_blank";
      link.rel = "noopener";
      link.dataset.passage = ref.passage.canonical;
      link.textContent = ref.text;
      fragment.append(link);
      links.push(link);
      cursor = ref.end;
    }
    fragment.append(text.slice(cursor));
    node.replaceWith(fragment);
  }

  return links;
}

/** Turns links from wrapReferences back into the plain text they replaced. */
export function unwrapReferences(links: HTMLAnchorElement[]): void {
  for (const link of links) {
    const parent = link.parentNode;
    if (!parent) continue;
    link.replaceWith(link.textContent ?? "");
    // Merge the text back into one node, as it was before wrapping.
    parent.normalize();
  }
}
