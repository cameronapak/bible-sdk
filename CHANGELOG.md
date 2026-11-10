# @faith-tools/bible-sdk

## 0.7.0

### Minor Changes

- 46c1717: Add an optional server-only API.Bible data provider using each application's own official SDK client. Preserve publisher notices, FUMS reporting tokens, and refresh deadlines, with provider-specific discovery cache expiry and application licensing/display guidance. AO Lab remains the default.

## 0.6.0

### Minor Changes

- 05e14ec: Rename Scripture Inline to Bible SDK, published as `@faith-tools/bible-sdk`. Add `bible-sk-passage`, `bible-sk-passage-input`, and `bible-sk-version-input` as the recommended component names while preserving all `si-*` names. Existing JavaScript exports, tag constants, attributes, events, CSS names, and data/provider subpaths remain compatible. The browser script is now `dist/bible-sdk.js`, with `dist/scripture-inline.js` retained as an identical compatibility copy. Existing pinned old-package embeds are unchanged; migrate by updating the package or script URL. Renaming component markup is optional; update matching selectors if you do.

## 0.5.0

### Minor Changes

- 9d82c1e: Add a DOM-free Bible data SDK with AO Lab by default, optional YouVersion, and fetch.bible. Use async/await through `/data` or native Effect programs through `/data/effect`, sharing one implementation. Async consumers do not need a direct Effect install or import; Effect remains a runtime dependency. Return Scripture text, discovery, attribution, license metadata, and structured display instructions. Keep custom display-only providers compatible and add fetch.bible support for passages, cards, and translation pickers through its provider factory.
  
  Use Effect v4 for data operations, typed Schema errors and validation, injectable BibleSource Layers, trace spans, retry/deadline policy, 256-entry discovery and provider payload caches, and interruptible component loading and scoped resources. Disable upstream response memoization. Preserve Psalm superscriptions and poetry boundaries, recover from malformed payloads, and identify documented fetch.bible trimming. Keep the released Promise-based display-provider interface as a compatibility boundary. Document instruction codes, provider-specific license metadata, and YouVersion commercial and AI-use requirements without claiming automatic legal compliance.
  
  Remove the passage spinner before revealing loaded Scripture. Match translation controls to the passage input's background and focus ring, and inset the language selector's decorative chevron without changing native selection behavior.
  
  Make the SDK and adapter declarations compatible with strict TypeScript NodeNext consumers, without leaking upstream fetch.bible implementation types. Check the built public entry points as part of CI.
  
  Keep footnote-split AO Lab poetry on its original line, and classify malformed YouVersion attribution metadata as a typed invalid-response failure.

## 0.4.0

### Minor Changes

- 7960f28: Use AO Lab's Free Use Bible API and BSB by default, without an API key. Add a shared BibleProvider contract and provider/version settings for cards and passages. Keep YouVersion available through explicit provider selection, with its existing public app key, version settings, and load-event fields. Existing YouVersion integrations must select the youversion provider explicitly.
  
  Add listBibleVersions() and a reusable si-version-input translation picker with language filtering, name/abbreviation search, keyboard selection, form submission, and catalog retry. Keep translation IDs scoped to their provider instead of guessing equivalent editions. Align poetry's first line with its verse number.
  
  Add a concise, linked Bible provider source credit after each built-in provider's translation attribution, in passages and cards. Link the AO Lab translation name to its license when no copyright notice is supplied. Custom providers can optionally supply safe attributionHtml, with plain text still supported.
  
  Keep attribution links understated: underline them only on hover, with a visible keyboard focus outline.

## 0.3.2

### Patch Changes

- a308916: Update grab-bcv to 0.1.8.

## 0.3.1

### Patch Changes

- 4b6b85d: `<si-passage-input>`: Tapping a suggestion on iPhone now picks it and keeps the keyboard open. Before, the tap closed the list and dismissed the keyboard. On touch screens, the field's text is now 16px, so iOS Safari no longer zooms the page when the field gets focus.

## 0.3.0

### Minor Changes

- fadec07: `<si-passage>` and `<si-passage-input>` now render in a shadow root, so page CSS, such as a global `*` reset, can't restyle verse numbers or other Bible text by accident. Typography still comes from the `--scripture-*` properties. To restyle a piece on purpose, use its CSS part, such as `si-passage::part(citation)` or `si-passage-input::part(input)`. Page rules that targeted the components' inner markup no longer apply.

## 0.2.0

### Minor Changes

- 58935c8: The reference finder now watches the page and links Bible references in content added later, such as pages that Turbo or Astro view transitions swap in. Cards keep working after `<body>` is replaced. Set `watch: false` to scan once, and mark content that React or another framework renders with `data-scripture-inline-ignore`.

## 0.1.1

### Patch Changes

- 6adb332: Update the README now that the package is on npm.
