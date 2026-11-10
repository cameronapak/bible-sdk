---
"@faith-tools/scripture-inline": minor
---

Add a DOM-free Bible data SDK with HelloAO by default, optional YouVersion, and fetch.bible. Use async/await through `/data` or native Effect programs through `/data/effect`, sharing one implementation. Async consumers do not need a direct Effect install or import; Effect remains a runtime dependency. Return Scripture text, discovery, attribution, license metadata, and structured display instructions. Keep custom display-only providers compatible and add fetch.bible support for passages, cards, and translation pickers through its provider factory.

Use Effect v4 for data operations, typed Schema errors and validation, injectable BibleSource Layers, trace spans, retry/deadline policy, 256-entry discovery and provider payload caches, and interruptible component loading and scoped resources. Disable upstream response memoization. Preserve Psalm superscriptions and poetry boundaries, recover from malformed payloads, and identify documented fetch.bible trimming. Keep the released Promise-based display-provider interface as a compatibility boundary. Document instruction codes, provider-specific license metadata, and YouVersion commercial and AI-use requirements without claiming automatic legal compliance.

Remove the passage spinner before revealing loaded Scripture. Match translation controls to the passage input's background and focus ring, and inset the language selector's decorative chevron without changing native selection behavior.
