import { formatPassageForDisplay, parsePassage } from "grab-bcv";
import { SCRIPTURE_PASSAGE_TAG, defineScripturePassage, type ReferenceLayout } from "./scripture-passage";
import css from "./card.css?inline";
import { resolveProvider, type ProviderOptions } from "./providers";

export type CardOptions = ProviderOptions & {
  /** How the card's passage shows its reference, as on <si-passage>. */
  reference: ReferenceLayout;
};

const GAP = 8;
const MARGIN = 8;

/**
 * One Scripture card per page, rendered in a Shadow DOM so the host page's
 * CSS cannot reach it. `toggle(anchor)` opens it above the anchor.
 */
export function createScriptureCard({ reference, ...options }: CardOptions) {
  defineScripturePassage();
  const provider = resolveProvider(options);
  const versionId = options.bibleVersionId || (provider.id === "youversion" && options.yvpBibleVersionId ? String(options.yvpBibleVersionId) : provider.defaultVersionId);

  const host = document.createElement("scripture-card");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  shadow.append(style);

  let card: HTMLElement | null = null;
  let anchor: HTMLElement | null = null;
  // A hover-opened card closes when the pointer leaves; a click pins it open.
  let openedByHover = false;
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;

  function position() {
    if (!card || !anchor) return;
    const ref = anchor.getBoundingClientRect();
    // Read the uncapped max height, or a card capped to one side would always "fit" there.
    card.style.removeProperty("--space");
    const width = card.offsetWidth;
    // Pick the side for the tallest the card can get, not its current height. The card
    // opens short while the text loads, and must not flip sides as the text grows in.
    const tallest = parseFloat(getComputedStyle(card).maxHeight);

    // Prefer above. If neither side fits, take the roomier one and shrink to it.
    const spaceAbove = ref.top - GAP - MARGIN;
    const spaceBelow = innerHeight - ref.bottom - GAP - MARGIN;
    const above = tallest <= spaceAbove || (tallest > spaceBelow && spaceAbove > spaceBelow);
    card.style.setProperty("--space", `${Math.max(above ? spaceAbove : spaceBelow, 120)}px`);
    const left = Math.min(Math.max(MARGIN, ref.left + ref.width / 2 - width / 2), innerWidth - MARGIN - width);

    // Pin the edge next to the reference, so the card grows away from it on its own.
    card.style.top = above ? "" : `${ref.bottom + GAP}px`;
    card.style.bottom = above ? `${innerHeight - ref.top + GAP}px` : "";
    card.style.left = `${left}px`;
    // Grow out of the reference that opened the card.
    card.style.setProperty("--origin-x", `${ref.left + ref.width / 2 - left}px`);
    card.style.setProperty("--origin-y", above ? "100%" : "0%");
    card.style.setProperty("--enter-shift", above ? "4px" : "-4px");
  }

  /** `immediate` skips the exit animation, for when another card replaces this one. */
  function close(immediate = false) {
    clearTimeout(hoverTimer);
    const closing = card;
    if (!closing) return;
    const returnFocus = anchor;
    card = null;
    anchor = null;
    removeListeners();

    if (immediate) {
      closing.remove();
      return;
    }
    closing.dataset.state = "closing";
    const remove = () => closing.remove();
    closing.addEventListener("transitionend", remove, { once: true });
    setTimeout(remove, 250);
    if (returnFocus && shadow.activeElement) returnFocus.focus();
  }

  function open(target: HTMLElement, byHover = false) {
    // Once a card is showing, the next one swaps in instantly, like a toolbar's tooltips.
    const switching = card !== null;
    close(switching);
    openedByHover = byHover;
    const passageId = target.dataset.passage!;
    const title = formatPassageForDisplay(parsePassage(passageId));

    if (!host.isConnected) document.body.append(host);
    card = document.createElement("div");
    card.className = "card";
    // A replacement starts open, so it has no start state to animate from.
    if (switching) card.dataset.state = "open";
    card.tabIndex = -1;
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", title);
    card.innerHTML = `
      <button class="close" type="button" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </button>
      <div class="body" aria-live="polite"></div>`;

    const text = document.createElement(SCRIPTURE_PASSAGE_TAG);
    text.bibleProvider = provider;
    text.setAttribute("bible-version-id", versionId);
    text.setAttribute("passage-id", passageId);
    text.setAttribute("theme", "auto");
    text.setAttribute("reference", reference);
    text.addEventListener("scripture-error", (event) => console.error("[scripture-inline]", (event as CustomEvent).detail));
    card.querySelector(".body")!.append(text);
    card.querySelector(".close")!.addEventListener("click", () => close());
    card.addEventListener("pointerenter", () => clearTimeout(hoverTimer));
    card.addEventListener("pointerleave", unhover);
    shadow.append(card);

    anchor = target;
    position();
    addListeners();
    // Hovering must not steal focus from whatever the reader is doing.
    if (!byHover) card.focus({ preventScroll: true });
    if (!switching) {
      // Commit the start state, then animate to open on the next frame.
      card.getBoundingClientRect();
      requestAnimationFrame(() => card && (card.dataset.state = "open"));
    }
  }

  const onKeydown = (event: KeyboardEvent) => event.key === "Escape" && close();
  const onPointerdown = (event: PointerEvent) => {
    const path = event.composedPath();
    if (card && !path.includes(card) && !(anchor && path.includes(anchor))) close();
  };
  const onMove = () => requestAnimationFrame(position);

  function addListeners() {
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("pointerdown", onPointerdown, true);
    addEventListener("scroll", onMove, { capture: true, passive: true });
    addEventListener("resize", onMove, { passive: true });
  }

  function removeListeners() {
    document.removeEventListener("keydown", onKeydown);
    document.removeEventListener("pointerdown", onPointerdown, true);
    removeEventListener("scroll", onMove, { capture: true });
    removeEventListener("resize", onMove);
  }

  /** Opens the card for `target` after a short delay, unless the pointer leaves first. */
  function hover(target: HTMLElement) {
    clearTimeout(hoverTimer);
    if (anchor === target) return;
    // Leave a pinned card alone until the reader dismisses it.
    if (card && !openedByHover) return;
    hoverTimer = setTimeout(() => open(target, true), card ? 150 : 350);
  }

  /** Closes a hover-opened card after a grace period, so the pointer can cross onto it. */
  function unhover(event?: PointerEvent) {
    if (event && event.pointerType !== "mouse") return;
    clearTimeout(hoverTimer);
    if (card && openedByHover) hoverTimer = setTimeout(close, 250);
  }

  return {
    toggle(target: HTMLElement) {
      if (anchor === target && openedByHover) {
        // Clicking a hover preview keeps it open.
        clearTimeout(hoverTimer);
        openedByHover = false;
        card!.focus({ preventScroll: true });
      } else if (anchor === target) close();
      else open(target);
    },
    hover,
    unhover,
    close,
    /** Closes the card at once if its link left the page, as when a router swaps the body. */
    closeIfDetached() {
      if (anchor && !anchor.isConnected) close(true);
    },
    /** Closes the card at once and removes its host from the page. */
    destroy() {
      close(true);
      host.remove();
    },
  };
}
