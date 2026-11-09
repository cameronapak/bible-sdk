# Scripture Inline Context

Scripture Inline gives any web page Scripture with no framework: a script finds Bible references in the page, and web components show passages and pick passages or translations. Bible text comes from HelloAO's Free Use Bible API by default, with optional YouVersion Platform support. The project is independent and not affiliated with YouVersion.

## Terms

- **Bible reference** - Text in a page that names a passage, such as "Rom 8:28-30". The reference finder parses these with grab-bcv.
- **Reference finder** - `scriptureInline()`, or the script tag. It turns Bible references into reference links.
- **Reference link** - The `a.scripture-inline-ref` element that replaces a Bible reference. It lays out exactly like the text it replaced.
- **Mode** - What a reference link does. `card` opens a Scripture card. `link` goes to route.bible.
- **Trigger** - What opens a card: `click`, or `hover` with a mouse.
- **Scripture card** - The popover that shows a passage next to a reference link. It renders a passage inside a shadow root.
- **Passage** - The Bible text that `<si-passage>` shows.
- **Passage ID** - A USFM passage, such as `JHN.3.16`, `ROM.8.28-30`, or a whole chapter, `ROM.8`. Passages can't cross chapters.
- **Bible provider** - A source of Bible text implementing the shared `BibleProvider` contract. `helloao` is the key-free default; `youversion` must be selected explicitly.
- **Bible version** - A translation chosen by `bible-version-id`. IDs are provider-specific. HelloAO defaults to `BSB`, the Berean Standard Bible. YouVersion defaults to `3034` and also accepts `yvp-bible-version-id`.
- **Reference layout** - Where a passage shows its reference: `heading`, `citation`, `quote`, or `none`.
- **Attribution** - The version's copyright line and the Bible provider's source credit. It always sits below the Bible text.
- **Public app key** - The optional YouVersion Platform key. It is public and safe in page markup. The script tag's key is the page-wide default. HelloAO needs no key.
- **Passage input** - `<si-passage-input>`, a form field that autocompletes books, chapters, and verses into a passage ID.
- **Translation picker** - `<si-version-input>`, a form field that searches the selected provider's versions by name and language. It submits a provider-specific version ID, not a cross-provider mapping.
- **Version Packages PR** - The pull request the Release workflow opens to bump the version. Merging it publishes to npm.

## Boundaries

- No React or other framework. Components are plain custom elements.
- `src/providers.ts` owns the shared passage and version-listing contracts and both adapters. HelloAO uses `free-use-bible-api` and local styles. The optional YouVersion adapter uses `@youversion/platform-core` and its styles. Scripture Inline does not own Bible data.
- Sensible UI styles only the docs page. The published components don't depend on it.
