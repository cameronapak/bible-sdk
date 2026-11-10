# Bible SDK Context

Bible SDK provides a unified, DOM-free Bible data SDK with optional browser UI. The SDK discovers versions, books, and chapters and returns Scripture with attribution, source limitations, and display guidance. The reference finder and web components add framework-free passages and passage/translation inputs. Bible text comes from HelloAO's Free Use Bible API by default, with optional YouVersion Platform and fetch.bible adapters. The project is independent and not affiliated with YouVersion.

Bible SDK is the new name for Scripture Inline. The package is `@faith-tools/bible-sdk`. Existing `si-*` elements, `scriptureInline()` and other JavaScript exports, attributes, `scripture-*` events, CSS names, and Effect service keys remain compatible. The old browser-script filename is included alongside `bible-sdk.js`.

## Terms

- **Bible reference** - Text in a page that names a passage, such as "Rom 8:28-30". The reference finder parses these with grab-bcv.
- **Reference finder** - `scriptureInline()`, or the script tag. It turns Bible references into reference links.
- **Reference link** - The `a.scripture-inline-ref` element that replaces a Bible reference. It lays out exactly like the text it replaced.
- **Mode** - What a reference link does. `card` opens a Scripture card. `link` goes to route.bible.
- **Trigger** - What opens a card: `click`, or `hover` with a mouse.
- **Scripture card** - The popover that shows a passage next to a reference link. It renders a passage inside a shadow root.
- **Passage** - Scripture for a verse, range, or chapter, returned as data by the SDK or displayed by `<si-passage>`.
- **Passage ID** - A USFM passage, such as `JHN.3.16`, `ROM.8.28-30`, or a whole chapter, `ROM.8`. Passages can't cross chapters.
- **Bible data provider** - A source implementing the DOM-free, Effect-native `BibleDataProvider` contract. HelloAO is the key-free default; YouVersion and fetch.bible are explicit choices. IDs remain provider-specific.
- **Display provider** - The compatible `BibleProvider` Promise contract for safe HTML in browser components. Built-ins expose their native data/display Effects through `.effects`; custom data providers need no renderer.
- **Bible version** - A translation chosen by `bible-version-id`. IDs are provider-specific. HelloAO defaults to `BSB`, the Berean Standard Bible. YouVersion defaults to `3034` and also accepts `yvp-bible-version-id`.
- **Reference layout** - Where a passage shows its reference: `heading`, `citation`, `quote`, or `none`.
- **Attribution** - The version's copyright line and the Bible provider's source credit. It always sits below the Bible text.
- **Public app key** - The optional YouVersion Platform key. It is public and safe in page markup. The script tag's key is the page-wide default. HelloAO needs no key.
- **Passage input** - `<si-passage-input>`, a form field that autocompletes books, chapters, and verses into a passage ID.
- **Translation picker** - `<si-version-input>`, a form field that searches the selected provider's versions by name and language. It submits a provider-specific version ID, not a cross-provider mapping.
- **Bible data SDK** - Two DOM-free surfaces over one Effect v4 implementation: `/data` returns Promises for async/await, and `/data/effect` returns lazy native Effects with the `BibleSource` service and Layers for composition and tests. Both provide version, book, and chapter discovery and clean Scripture text, with the same models and `ScriptureError` failures. Async consumers do not need to import or directly install Effect; it remains a runtime dependency. IDs remain provider-specific.
- **Display instructions** - Structured rendering fields plus classified explanations returned with Scripture data. Codes identify attribution, licensing, formatting, and provider-specific HTML guidance; consumers must read the prose and terms. This is not a renderer or automatic legal-compliance engine.
- **Version Packages PR** - The pull request the Release workflow opens to bump the version. Merging it publishes to npm.

## Boundaries

- No React or other framework. Components are plain custom elements.
- `src/providers.ts` owns the existing display contract and the HelloAO/YouVersion adapters. `src/data-effect.ts` and `src/data-types.ts` own the shared Effect data API and instructions contract; `src/data.ts` runs those operations at the Promise boundary. `src/providers/fetch-bible.ts` uses the official fetch.bible client and sanitizes native HTML. Built-in providers share transport and metadata between data and display; custom display-only providers need not implement data methods. Bible SDK does not own Bible data.
- Sensible UI styles only the docs page. The published components don't depend on it.
- Effect owns asynchronous workflows, request policy, tracing, caches, and resource lifetimes. The released Promise-based display-provider methods remain compatibility edges. Pure parsing, formatting, and synchronous DOM updates remain plain code inside Effect boundaries.
