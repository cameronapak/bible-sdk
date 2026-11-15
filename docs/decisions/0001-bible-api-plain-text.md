# ADR 0001: Render bible-api.com as an explicitly limited plain-text extract

- Date: 2026-11-15
- Status: Accepted
- Scope: Optional bible-api.com adapter, not API.Bible, ESV or the default AO Lab provider

## Context and evidence

The SDK must preserve the selected provider's text and identity without presenting a flattened extract as the publisher's full edition. The same contract serves async clients, native Effect clients and passage components. A better font cannot restore missing content.

The [documented API](https://bible-api.com/) exposes chapter JSON, reference JSON and JSONP, not native Scripture HTML or a rich document tree. The [service source at a8531e0](https://github.com/seven1m/bible_api/blob/a8531e082dc14df5ee3f5b91756b9f520204a853/app.rb), still its latest commit when checked, reads the same verse records for these routes. JSONP only wraps JSON in a callback. The reference route's space-joined `text` is not a richer alternative to the chapter route.

The [importer](https://github.com/seven1m/bible_api/blob/a8531e082dc14df5ee3f5b91756b9f520204a853/lib/bible_importer.rb) stores integer-numbered verses, trims surrounding whitespace, and joins some lettered OSIS fragments. Its [USFX parser](https://github.com/seven1m/bible_parser/blob/v1.1.4/lib/bible_parser/parsers/usfx/document.rb) collects character data during verses, skips notes and does not return structural tags. Placement and source format affect which content survives; not every edition has identical omissions.

The [rendering audit](https://ampcode.com/artifacts/bible-api-com-provider-assessment-cface68c-a10f-4a5e-a82a-4d6c86b5c1d8) compared the pinned source XML with live Psalm 23 JSON. The [WEB XML](https://github.com/seven1m/open-bibles/blob/8b330654ade69f7c96268c761da18dc83a1f49b7/eng-web.usfx.xml#L17590-L17612) and [VBL XML](https://github.com/seven1m/open-bibles/blob/8b330654ade69f7c96268c761da18dc83a1f49b7/spa-vbl.usfx.xml#L17526-L17534) contain Psalm superscriptions and poetry elements that the API does not deliver. These are content and structure losses, not just missing CSS.

Bounded live chapter requests and the unchanged PR adapter reproduced the rendering problem in Chromium: WEB Psalm 23 retains internal newlines, but verse 2 starts on verse 1's last line when verse strings are joined with spaces. VBL has no such internal breaks and displays as continuous prose. Neither response contains the superscription. The adapter cannot recover lost trailing boundaries, stanza/indentation levels, notes, emphasis or red-letter markers. A surviving newline is not enough evidence to infer poetry: it may have come from source-file whitespace.

VBL's component attribution already preserves its returned creator/copyright and CC BY-SA link; it is not missing all attribution. The gap is a visible path to the imported source/rights notices. WEB's Public Domain link already points to those notices. [CC BY-SA 4.0 §3(a)(1)(A)(v) and §3(a)(2)](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en) address retaining a supplied source URI where reasonably practicable and reasonably linking to a resource containing notices. The [imported Spanish notices](https://github.com/seven1m/open-bibles/blob/8b330654ade69f7c96268c761da18dc83a1f49b7/README.md#translation-details) include source links and full notices. Adding that path is a conservative attribution improvement, not a legal certification.

## Decision

1. Preserve each received verse string. Do not trim, normalize Unicode, change punctuation/capitalization, synthesize quotation marks, remove slash markers or infer word spaces. Escape text for HTML rather than interpreting it as markup. Browser HTML parsing still applies its standard line-ending handling; the DOM-free data string retains received line endings.
2. Add one newline between verse strings in `passage.text` and a line break between escaped verse spans in displays. Apply this uniformly, including when verse numbers are hidden. This makes known verse boundaries explicit without classifying the passage as poetry. Internal whitespace remains intact; a supplied trailing newline can therefore leave an extra blank line at a boundary. Verse-per-line is SDK presentation, not recovered publisher layout.
3. Put a plain-text-extract notice below Scripture, outside the Scripture text. Include the same notice in attribution and the existing `bible-api-source` instruction so custom data/agent consumers know about possible missing Psalm superscriptions, headings, notes, translator emphasis and poetry. State that the SDK adds the verse boundaries. Do not claim complete publisher fidelity or native HTML.
4. Keep the exact received edition/creator/copyright/license notice and license link. If that link points elsewhere, also show an `Imported source/rights` link to open-bibles' translation details, which retain the publisher/source paths and notices. Do not replace an old import's CC license with a newer publisher revision's terms. For example, current publisher listings and the imported PDDPT/BES notices describe different rights/revisions; the adapter has no verified basis to relicense the old import.
5. Retain Hebrew language/RTL metadata, unchanged joined words and slash markers, the visible source-quality warning and host-font guidance. Direction and glyph coverage do not fix source text or certify cantillation fidelity. Do not call this an equivalent to WLC or a verified reader-quality Hebrew edition.
6. Keep the existing on-demand request, cache/deadline, clear/purge, no-retry and explicit-calendar behavior. Add no text fetches, provider fallback, bulk downloads, or ESV integration. The shared safeguards released in 0.10.2 are unchanged.

## Alternatives considered

- **Keep space-joined prose:** matches the reference route's convenience output but merges a new verse onto a surviving line. It conceals known boundaries. Rejected.
- **Add breaks only when a verse contains a newline:** cannot distinguish poetry from incidental source whitespace and produces inconsistent treatment of equally flattened editions. Rejected in favor of uniform verse boundaries.
- **Infer poetry, headings, superscriptions, indentation or Hebrew spacing:** the JSON lacks the evidence. Heuristics can invent Scripture, change its meaning or mix editions. Rejected.
- **Copy publisher reader CSS or bundle a particular font:** CSS cannot recreate discarded content. Font licensing and publisher site-material rights are separate from text rights. The host may select a suitable licensed font, but we do not imply a universal publisher stylesheet or typographic certification.
- **Fetch XML or publisher HTML behind this adapter:** open-bibles documents USFX/OSIS/Zefania source files and the service points bulk users there rather than to the hosted API. Those formats can legitimately carry more information under their per-edition terms. They are not a richer documented bible-api.com response. Importing them requires a separately scoped, explicit source integration with edition/revision identity, parsing, rights and distribution review. A current publisher file may differ from this older import. Do not silently combine it with API verse records or call a JSON-only self-host richer. No such fallback is implemented.
- **Disable all components for this provider:** unnecessary for consumers who knowingly choose a plain-text extract. Keep useful provider access with visible and structured limits. A use case requiring full publisher-intended text/layout must choose an explicitly richer source; this adapter does not meet that requirement.

## Consequences and host obligations

Data and components agree on verse-per-line output while retaining source strings. This changes multi-verse whitespace from the unreleased PR implementation. Single-verse text stays unchanged. Components retain normal configurable typography and hideable verse numbers; no edition CSS or new component option is needed.

The visible notice adds attribution height, especially in small Scripture cards. That is preferable to silently suggesting that missing content is complete. A host rendering plain data must preserve the notices, `pre-wrap` guidance, edition terms and source/rights path. Returned instructions are not an automatic compliance engine or permission for every use. Per-edition/territorial rights, host transformations, accessibility, fonts and real-device review remain host obligations. Publisher layout and exhaustive textual equivalence across the catalog are not verified.

## Verification

Run `pnpm check`. Regression fixtures distinguish Unicode normalization, trimmed leading/trailing whitespace, collapsed internal breaks, unsafe HTML interpolation, space-joined verse boundaries and dropped notices. Component tests verify that text remains separate from visible source-format/CC attribution. Existing cache, purge, expiry, Hebrew direction, error and explicit-calendar checks remain in place.

Use saved, bounded live WEB/VBL Psalm 23 and Hebrew Genesis 1 responses in real passage components. Check exact selected data strings, original internal breaks, distinct verse starts with verse numbers shown/hidden, visible imported rights and warnings, RTL and no stale text after errors/purge. Inspect desktop and 390px light/dark rendering and compare viewport/document widths. Build and install the package into a consumer before release. Do not use a screenshot alone as evidence of unchanged text or recoverability.

The bible-api.com adapter is not part of the published 0.10.2 safeguards release. Source availability and a production documentation deployment do not imply npm availability; package publication follows the separate Version Packages release workflow.
