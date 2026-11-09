# Scripture Inline

A unified Bible data SDK, with optional drop-in Scripture components for web pages.

<img src="assets/banner.png" width="2533" height="718" alt="A passage input suggesting Isaiah 40:3, a Scripture card showing John 3:16 under a reference link, and a passage showing Isaiah 40:8">

Choose the surface your application needs:

- **[Bible data SDK](#bible-data-sdk).** Discover versions, books, and chapters, and retrieve Scripture with attribution, source limitations, and display guidance through one DOM-free Effect v4 API. HelloAO is the default; YouVersion and fetch.bible are optional adapters.
- **[Browser UI](#getting-started).** Use the reference finder and web components without choosing a framework:

  - **Bible references.** A script finds references such as "John 3:16" or "Rom 8:28-30" in your page's text. It makes each one open a Scripture card or link to [route.bible](https://route.bible).
  - **`<si-passage>`** shows a Bible passage.
  - **`<si-passage-input>`** is a form field that lets readers pick a passage, with autocomplete for books, chapters, and verses.
  - **`<si-version-input>`** lets readers choose a translation by name and language, without knowing its ID.

Bible text comes from [HelloAO's Free Use Bible API](https://bible.helloao.org/docs/) by default, with no API key. The [YouVersion Platform](https://developers.youversion.com/) and [fetch.bible](https://fetch.bible/) are optional providers. Scripture Inline is an independent community project, not affiliated with YouVersion or Life.Church.

> Scripture Inline is in preview. Expect changes before 1.0.

## Getting started

### Add the script

```html
<script
  src="https://cdn.jsdelivr.net/npm/@faith-tools/scripture-inline@0.4.0/dist/scripture-inline.js"
></script>
```

The script registers the components and turns Bible references into Scripture cards using HelloAO's Berean Standard Bible (BSB). Cards and passages work without configuration.

Attributes that start with `yvp-` are YouVersion Platform settings. Passage IDs such as `JHN.3.16` use the [USFM](https://ubsicap.github.io/usfm/) book codes, so they have no prefix.

## Bible references

The script looks for references in the page's text, including abbreviations. It skips text in `code`, `pre`, links, form fields, and anything marked `data-scripture-inline-ignore`. Links lay out exactly like the text they replace, so lines never reflow. The script keeps watching the page, so it also finds references in content that loads later, including pages that Turbo or Astro view transitions swap in. Mark content that React or another framework renders with `data-scripture-inline-ignore`, because the framework expects its text to stay as it left it.

| Script tag / JavaScript | Default | Purpose |
| --- | --- | --- |
| `data-provider` / `provider` | `helloao` | `helloao` or `youversion`. JavaScript also accepts a `BibleProvider` object. |
| `data-bible-version-id` / `bibleVersionId` | Provider default | `BSB` for HelloAO; `3034` for YouVersion. IDs are provider-specific. |
| `data-yvp-public-app-key` / `yvpPublicAppKey` | None | Your public app key. Required only for YouVersion. |
| `data-yvp-api-host` / `yvpApiHost` | YouVersion's API | Another YouVersion API host, for testing. |
| `data-mode` / `mode` | `card` | `card` opens a Scripture card. `link` links to route.bible. |
| `data-trigger` / `trigger` | `click` | `hover` also opens cards on mouse hover. |
| `data-yvp-bible-version-id` / `yvpBibleVersionId` | `3034` | YouVersion-only alias. `bibleVersionId` takes precedence. |
| `data-reference` / `reference` | `heading` | The card's reference layout, as on `<si-passage>`. |
| `root` | Whole page | The element to look for references in. Leave it unset on sites that replace `<body>`. JavaScript only. |
| `watch` | `true` | Also links references in content added later, such as pages that Turbo swaps in. `false` scans once. JavaScript only. |

## `<si-passage>`

```html
<si-passage passage-id="JHN.3.16"></si-passage>
```

| Attribute | Default | Purpose |
| --- | --- | --- |
| `provider` | The script's provider, or `helloao` | `helloao` or `youversion`. |
| `bible-version-id` | The script's version, or provider default | `BSB` for HelloAO; `3034` for YouVersion. |
| `yvp-bible-version-id` | `3034` | YouVersion-only alias. `bible-version-id` takes precedence. |
| `passage-id` | None | A USFM passage such as `ROM.8.28-30`, or a whole chapter such as `ROM.8`. Required. |
| `reference` | `heading` | Where the reference shows: `heading`, `citation`, `quote`, or `none`. |
| `verse-numbers` | Shown | `hide` removes verse numbers. |
| `headings` | Shown | `hide` removes section headings. |
| `red-letter` | On | `off` shows the words of Jesus in the text color. |
| `theme` | `light` | `light`, `dark`, or `auto` to follow the system. |
| `direction` | From the passage | `ltr` or `rtl`. |
| `yvp-public-app-key` | The script tag's key | Overrides the page-wide app key. |
| `yvp-api-host` | YouVersion's API | Another API host, for testing. |

Attributes choose what the passage shows. CSS properties choose how it looks, so one rule can style every passage on a page:

```css
si-passage {
  --scripture-font-size: 18px;
  --scripture-max-width: 40rem;
}
```

| CSS property | Default | Purpose |
| --- | --- | --- |
| `--scripture-font-size` | `20px` | The Bible text size. The reference line scales with it. |
| `--scripture-line-height` | `1.625` | Line height of the Bible text. |
| `--scripture-font-family` | Georgia (HelloAO), Untitled Serif (YouVersion) | Font of the Bible text. |
| `--scripture-max-width` | `32rem` | Line length of the text, reference, and copyright. |

The passage renders in a shadow root, so page CSS can't change it by accident. To restyle a piece on purpose, use its part, such as `si-passage::part(citation) { font-style: italic; }`.

| Part | What it is |
| --- | --- |
| `text` | The Bible text. |
| `citation` | The reference and version. |
| `version` | The version abbreviation inside the citation. |
| `attribution` | The copyright line and Bible provider credit. |
| `quote` | The block quote in the `quote` layout. |
| `loader` | The spinner while the text loads. |
| `error` | The message when the text can't load. |

| Event | Detail | When |
| --- | --- | --- |
| `scripture-load` | `provider`, `passageId`, `bibleVersionId`, `bibleVersion` | The passage is on screen. `bibleVersion` has `id`, `abbreviation`, and `title`. YouVersion also includes the original `yvpBibleVersionId` and `yvpBibleVersion`. |
| `scripture-error` | The error | The passage could not load. |

## `<si-passage-input>`

```html
<form>
  <label for="passage">Passage</label>
  <si-passage-input id="passage" name="passage" placeholder="Romans 8 or John 3:16"></si-passage-input>
</form>
```

Readers can type a book, chapter, or verse, including typos like "Roman 8". The field suggests matches and stores a USFM ID such as `ROM.8` or `ROM.8.1`. When the field is focused and empty, it lists every book.

| Attribute | Default | Purpose |
| --- | --- | --- |
| `value` | Empty | The starting passage, as a USFM ID such as `JHN.3.16`. |
| `name` | None | The form field name. The form submits the passage ID. |
| `placeholder` | None | Hint text in the empty field. |
| `book-order` | `canonical` | `canonical` lists books Genesis to Revelation. `alphabetical` lists them A to Z. |
| `disabled` | Off | Turns the field off. |

| Event | Detail | When |
| --- | --- | --- |
| `change` | `passageId`, `label` | The reader picks a passage or clears the field. `passageId` is empty when cleared. |

The field renders in a shadow root. It reads the page's `--input`, `--ring`, `--radius`, `--popover`, `--accent`, and `--font-sans` tokens when they exist. To restyle it further, use its parts: `input`, `listbox`, `option`, and `count`, such as `si-passage-input::part(input) { height: 2.5rem; }`.

To show the picked passage:

```js
const input = document.querySelector("si-passage-input");
const passage = document.querySelector("si-passage");
input.addEventListener("change", (event) => {
  if (event.detail.passageId) passage.setAttribute("passage-id", event.detail.passageId);
});
```

## `<si-version-input>`

```html
<label for="translation">Translation</label>
<si-version-input id="translation" name="translation" value="BSB"></si-version-input>
```

Readers can filter by language and search translation names or abbreviations. The field starts with the selected translation's language, or the browser's language. It supports arrow keys, Enter, Escape, and form reset. Typing does not change the selection until the reader picks a translation. Failed catalog requests offer Retry.

| Attribute | Default | Purpose |
| --- | --- | --- |
| `value` | The script's version, or provider default | The selected provider's translation ID, such as `BSB`. |
| `name` | None | The form field name. The form submits the translation ID. |
| `language` | Selected translation or browser language | A language tag such as `en`, or `all`. Filters choices, not the selected passage. |
| `placeholder` | `Search translations` | Hint text in the search field. |
| `disabled` | Off | Turns the field off. |
| `provider` | The script's provider, or `helloao` | `helloao` or `youversion`. |
| `yvp-public-app-key` | The script tag's key | Your public app key. Required only for YouVersion. |
| `yvp-api-host` | YouVersion's API | Another YouVersion API host, for testing. |

| Event | Detail | When |
| --- | --- | --- |
| `change` | `provider`, `bibleVersionId`, `bibleVersion` | The reader picks a different translation. |
| `scripture-versions-load` | `provider`, `versions` | The provider's catalog loads. |
| `scripture-error` | The error | The catalog could not load. |

The `value` property reads or sets the selected ID. `bibleVersion` has `id`, `abbreviation`, `title`, and optional `language` and `languageName`. An ID unavailable from the selected provider clears the field and marks it invalid. IDs are unique within a provider, not across providers. HelloAO's `BSB` and YouVersion's `3034` both name the Berean Standard Bible, but matching names or abbreviations do not guarantee identical editions.

To connect the picker to a passage using the same provider:

```js
document.querySelector("si-version-input").addEventListener("change", (event) => {
  document.querySelector("si-passage").setAttribute("bible-version-id", event.detail.bibleVersionId);
});
```

The field uses the same page style tokens as the passage input. Its parts are `language`, `input`, `listbox`, `option`, `status`, and `retry`.

## JavaScript

With a bundler, install the package and call the same functions the script tag uses:

```sh
npm install @faith-tools/scripture-inline
```

```js
import { defineScripturePassage, definePassageInput, defineVersionInput, scriptureInline } from "@faith-tools/scripture-inline";

defineScripturePassage();
definePassageInput();
defineVersionInput();
scriptureInline({ root: document.querySelector("article") });
```

| Export | Purpose |
| --- | --- |
| `scriptureInline(options)` | Finds and links references. Takes the [Bible references](#bible-references) options and returns `{ links, stop }`. `stop()` restores the plain text. |
| `defineScripturePassage(options)` | Registers `<si-passage>`. Accepts the provider options above as page-wide defaults. Passage attributes override them. |
| `helloaoProvider` | The default provider, using the `free-use-bible-api` SDK. |
| `createYouVersionProvider({ yvpPublicAppKey, yvpApiHost })` | Creates the optional YouVersion provider. |
| `definePassageInput()` | Registers `<si-passage-input>`. |
| `defineVersionInput(options)` | Registers `<si-version-input>`. Shares provider defaults with `defineScripturePassage()`. |
| `listBibleVersions(options)` | Returns the provider's catalog as `Promise<BibleVersion[]>`. Accepts provider options; caches successful requests. |
| `findReferences(text)` | Returns the references in a string, without touching the page. |

Use the shared catalog for your own controls, too:

```js
import { listBibleVersions } from "@faith-tools/scripture-inline";

const versions = await listBibleVersions(); // HelloAO, unless page defaults select another provider
const english = versions.filter((version) => version.language === "en");
```

## Switching providers

To use YouVersion, get a public app key from [platform.youversion.com](https://platform.youversion.com/) and select the provider explicitly:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@faith-tools/scripture-inline@0.4.0/dist/scripture-inline.js"
  data-provider="youversion"
  data-yvp-public-app-key="YOUR_PUBLIC_APP_KEY"
  data-yvp-bible-version-id="3034"
></script>
```

With a bundler, pass `{ provider: "youversion", yvpPublicAppKey: "YOUR_PUBLIC_APP_KEY" }` to `scriptureInline()` and `defineScripturePassage()`. A standalone passage can override the page default with `provider="youversion"` and `yvp-public-app-key="YOUR_PUBLIC_APP_KEY"`.

**Migration:** Existing YouVersion integrations must add `data-provider="youversion"`, `provider="youversion"`, or `provider: "youversion"`. A public app key alone no longer selects YouVersion. The `yvp-*` settings and YouVersion load-event fields remain supported when that provider is selected. To switch to HelloAO, remove the YouVersion settings and use its translation IDs, not numeric YouVersion IDs.

For another provider, implement the exported `BibleProvider` interface: `id`, `defaultVersionId`, and `getPassage(versionId, passageId): Promise<PassageDisplay>`. The display contains safe `html`, `version: { id, abbreviation, title }`, and an `attribution` string. It can also supply safe `attributionHtml` for links, `direction`, `containerAttributes`, and `stylesheets`. Pass the object as `provider` to either function, or assign it to a passage's `bibleProvider` property. A passage's `provider` attribute takes precedence over that property. Providers must sanitize both HTML fields; Scripture Inline inserts them into the shadow root.

To support the translation picker, also implement `listVersions(): Promise<BibleVersion[]>`. Assign a custom provider to the picker's `bibleProvider` property, or pass it to `defineVersionInput()`. Catalogs are scoped to the provider, including the YouVersion public app key and API host. Switching providers does not guess an equivalent translation.

HelloAO preserves headings, poetry, and words-of-Jesus formatting when present in the translation. It displays the translation's license notice below the text, or its name linked to the license when no notice is supplied. All built-in providers add a linked source credit. Check the translation's license before using it. Passages cannot span chapters.

To use fetch.bible with components, create the provider shown below and pass that same object to `defineScripturePassage({ provider })`, `defineVersionInput({ provider })`, and `scriptureInline({ provider })`. Its version IDs include `eng_bsb`. For individual elements, assign `element.bibleProvider = provider` and remove any overriding `provider` attribute. This adapter is a bundler import, not a new script-tag provider name. It sanitizes native HTML, omits notes, loads the required fetch.bible stylesheet, and displays attribution separately.

## Bible data SDK

Use the same Effect v4 data API with HelloAO, YouVersion, or fetch.bible in a browser, Node, or Bun. The `/data` entry point does not register components, access the DOM, or inject CSS. It does not read page-wide component defaults. Methods return lazy Effects; run them at your application's boundary.

Install Effect in your application to compose and run the SDK's programs:

```sh
pnpm add @faith-tools/scripture-inline effect@^4
```

```ts
import { Effect } from "effect";
import { createScriptureClient } from "@faith-tools/scripture-inline/data";

const scripture = createScriptureClient(); // HelloAO, default version BSB
const program = Effect.gen(function*() {
  const versions = yield* scripture.listVersions();
  const books = yield* scripture.listBooks({ versionId: "BSB" });
  const chapters = yield* scripture.listChapters({ versionId: "BSB", bookId: "JHN" });
  return yield* scripture.getPassage({
    versionId: "BSB", passageId: "JHN.3.16-18",
  });
});
const passage = await Effect.runPromise(program);
console.log(passage.text);
console.log(passage.attribution.text);
console.log(passage.instructions);
```

Select an optional provider explicitly. A client uses one provider and never substitutes a translation or falls back to another source:

```ts
import { Effect } from "effect";
import { createScriptureClient } from "@faith-tools/scripture-inline/data";
import { createFetchBibleProvider } from "@faith-tools/scripture-inline/providers/fetch-bible";
import { createYouVersionProvider } from "@faith-tools/scripture-inline/providers/youversion";
import { createHelloAOProvider } from "@faith-tools/scripture-inline/providers/helloao";

const provider = createFetchBibleProvider({ usage: { commercial: true } });
const fetchScripture = createScriptureClient({ provider }); // Default eng_bsb
const youversionScripture = createScriptureClient({
  provider: createYouVersionProvider({ yvpPublicAppKey: "YOUR_PUBLIC_APP_KEY" }),
}); // Default 3034
const helloaoScripture = createScriptureClient({ provider: createHelloAOProvider() });
const passage = await Effect.runPromise(fetchScripture.getPassage({ passageId: "JHN.3.16" }));
console.log(passage.text, passage.attribution, passage.instructions);
```

Set `usage.commercial` to your application's actual use. fetch.bible also accepts `derivatives`, `attributionless`, and `limitless` usage filters; their defaults are `false`, `false`, and `true`. Filters exclude incompatible licenses but do not replace reviewing the translation's terms. The adapter uses the official collection. Free access is not a blanket commercial or redistribution license.

YouVersion has no equivalent commercial-use flag. Its [Platform terms](https://platform.youversion.com/terms) do not grant Bible-content rights; check the selected publisher's license and applicable Tool terms for your use. The terms permit paid applications subject to conditions, including conspicuously stating that the YouVersion Bible App is free. Do not interpret this as blanket permission or a blanket commercial prohibition. The terms prohibit using Tools with AI for open-ended user chat except to retrieve and display Scripture verbatim. They prohibit using Tools to train, develop, refine, or improve AI. Cases beyond expressly permitted uses need prior written YouVersion approval. AI-assisted engineering and content generation have separate permissions and conditions in those terms. These requirements also appear in returned YouVersion instructions.

IDs belong to one provider: `BSB`, `3034`, and `eng_bsb` are not interchangeable. Book IDs use uppercase USFM, such as `JHN` or `3JN`. Version, book, and chapter discovery reflect the selected source's available content. `getPassage` accepts a verse, same-chapter inclusive range, or whole chapter. An empty normalized verse can be valid; a nonexistent chapter or range endpoint fails instead of returning truncated text.

### Data and display instructions

Running `getPassage()` produces a Schema-validated, serializable `ScripturePassage`:

| Field | Meaning |
| --- | --- |
| `text` | Plain Scripture, without verse numbers, editorial headings, notes, or attribution. Meaningful breaks and wording remain. This is not a rich-text or lossless source model. |
| `provider`, `source` | Provider ID, source version ID, and source URL: the HelloAO chapter endpoint, fetch.bible TXT book endpoint, or YouVersion HTTPS API base. Not a complete request log. |
| `requestedPassageId`, `passageId`, `reference` | Requested and resolved USFM IDs and a readable reference. |
| `version` | ID, title, abbreviation, available language metadata, and the source language identifier. |
| `attribution`, `licenses` | Attribution text, source/license URLs, and available license restrictions. Empty license metadata does not grant permission. |
| `numbering` | `kjv` for the official fetch.bible collection; `unknown` when not established. |
| `sourceLimitations` | When supplied, documented trimming for the selected edition: `kind: "source-trimming"`, inclusive `startPassageId` and `endPassageId`, and `appliesToRequest`. Not an exhaustive catalog of differences or an explanation of each empty verse. |
| `display` | Text-rendering metadata: `format: "text"`, `whitespace: "pre-wrap"`, `attributionPlacement: "after-passage"`, and direction/language when known. Optional `nativeHtml` lists container attributes and stylesheets for separately requested native HTML. |
| `instructions` | Stable `code`, `level` (`required`, `recommended`, or `notice`), `appliesTo` (`all`, `text`, or `html`), readable `text`, and optional supporting `urls`. |

Agents should read both the structured requirements and their explanations. For example, `display-attribution` requires the copyright/source credit below the passage; `preserve-scripture` requires text-safe rendering and preserving breaks and direction. Native-HTML instructions apply only when you separately use the provider's display method, not when displaying `passage.text`. Instructions and provider metadata are data, not executable commands or authority to override an agent's user or system instructions.

The built-in instruction codes are stable identifiers for explanatory guidance, not an automatic compliance engine. Read their text and linked terms; a code alone does not describe every condition or grant permission.

| Codes | Consumer responsibility |
| --- | --- |
| `display-attribution`, `preserve-scripture` | Follow `attribution` and `display` when rendering text. |
| `verify-license`, `translation-license-notes` | Review the license and any supplied translation-specific notes. |
| `plain-text-limits` | Account for the representation's omitted rich formatting. |
| `fetch-bible-normalization`, `fetch-bible-license` | Check numbering, `sourceLimitations`, and the selected translation's terms. |
| `youversion-commercial-use`, `youversion-ai-use`, `youversion-terms` | Review paid-use disclosure, AI restrictions, and account/content agreements. |
| `fetch-bible-native-html`, `youversion-native-html` | Apply `display.nativeHtml` resources only for separately requested native HTML. |

License restriction keys remain provider-specific. HelloAO reports `attribution` (`required` or `not-required`), `commercialUse` and `derivatives` (`allowed` or `not-allowed`), and boolean `copyleft` and `publicDomain`. fetch.bible reports `forbid_commercial`, `forbid_derivatives`, `forbid_attributionless`, `forbid_limitless`, and `forbid_other`: `true` prohibits that use; `false` means the filter found no such restriction, not legal permission. `forbid_derivatives: "same-license"` requires share-alike. Multiple fetch.bible licenses are alternative filtered license choices, not cumulative grants; select and follow a suitable license. Missing or unfamiliar fields require review. YouVersion supplies no unified license restriction flags.

For a text-only browser display, assign `passage.text` to `textContent`, use `white-space: pre-wrap`, apply the supplied direction/language, and render `passage.attribution.text` after it with the supplied links. Never treat plain text or attribution as raw HTML. For native HTML in components, use the same provider object through the existing display contract; do not reconstruct HTML from flattened text. The data SDK does not invoke a renderer.

fetch.bible uses KJV-normalized numbering and the Protestant 66-book canon. `sourceLimitations` identifies documented trimming: Exodus 35:1–40:38 in `eng_bstj`, `eng_bstjb`, and `grc_lxx`; Jeremiah 25:14–52:34 in those editions plus `eng_bst`, `eng_bstb`, and `grc_bre`. Overlap does not establish why a particular verse is empty. Psalm requests including verse 1 supplement TXT with native HTML's scriptural descriptive title, without including editorial headings. Native fetch.bible HTML needs its container class and functional CSS so notes do not become Scripture. YouVersion instructions identify its HTML container/CSS requirements and prohibit downloading or self-hosting its font files. Neither integration establishes universal offline or persistent caching rights.

### Errors, caching, and custom providers

`ScriptureError` is a Schema-tagged error in the Effect failure channel. Its `code` distinguishes `invalid_reference`, `unavailable`, `unsupported`, `authentication`, `rate_limit`, `network`, `timeout`, and `invalid_response`. Upstream HTTP errors are classified when their status is available; other source failures use `network`. The original error remains in `cause`, which can contain sensitive provider diagnostics, so do not expose it to readers. Use `Effect.catchTag("ScriptureError", ...)` to handle expected failures without hiding defects.

Built-in source requests retry network and rate-limit failures twice, with exponential delays starting at 100ms. A 15-second deadline bounds each request's entire retry sequence. Authentication, unavailable content, invalid references, and invalid responses do not retry. Override `RequestPolicy` with `Effect.provideService` for a program. Legacy Promise-only custom providers have a deadline but no automatic retries.

Each client's discovery cache and each built-in adapter's payload cache have at most 256 entries, not a byte limit. Upstream response memoization is disabled; failed or malformed payloads can be downloaded again. HelloAO shares validated chapter payloads, and fetch.bible shares whole books. fetch.bible also retains its collection catalog and loaded localized book-name metadata, whose size depends on the collection. Running `client.clearCache()` or providing its Layer to `scripture.clearCache` clears that client's discovery and its provider's payload caches; shared providers share those caches. This does not invalidate other clients' discovery or the components' separate display/catalog caches. Passage data and YouVersion attribution are not memoized by the client. No persistent cache is provided.

Effects support fiber interruption and `Effect.runPromise(program, { signal })`. HelloAO receives the transport's abort signal. YouVersion and fetch.bible SDKs do not expose transport cancellation; interruption stops waiting and ignores their late results, but does not claim to stop their underlying downloads. Components interrupt obsolete loads and use scoped listener/timer cleanup.

Named spans connect client operations, provider operations, and upstream requests to your application's Effect tracer. The SDK does not choose a telemetry backend or export content, credentials, or errors to a hosted service. Configure an Effect tracer or OTLP layer in your application.

```ts
import { Effect } from "effect";
import { RequestPolicy, createScriptureClient, scripture } from "@faith-tools/scripture-inline/data";

const client = createScriptureClient();
const program = scripture.getPassage({ passageId: "JHN.3.16" }).pipe(
  Effect.provide(client.layer), // BibleSource service; replace the Layer in tests
  Effect.provideService(RequestPolicy, { timeout: "5 seconds", retries: 1 }),
  Effect.withSpan("application.scripture"),
);
const passage = await Effect.runPromise(program);
```

Custom data providers implement the exported `BibleDataProvider` interface with Effect-returning `listVersions()`, `listBooks(versionId)`, `listChapters(versionId, bookId)`, and `getPassageData(versionId, passageId)`, plus `id`, `defaultVersionId`, and a `clearCache` Effect value (`Effect.void` when unused). They do not need an HTML renderer. Provide them through `createScriptureClient({ provider })` or `Layer.succeed(BibleSource, provider)` with the service-based `scripture` programs. Existing custom Promise-based `BibleProvider` implementations remain valid for components; built-ins expose native operations through `.effects`. Missing data operations report `unsupported` rather than scraping HTML. Pure parsing, formatting, and DOM updates remain ordinary synchronous code inside these Effect boundaries.

| Call | Result |
| --- | --- |
| `client.getPassage({ versionId, passageId })` | Effect returning `ScripturePassage` data. |
| `provider.effects.getPassageData(versionId, passageId)` | Built-in provider's native Effect data operation. |
| `provider.getPassage(versionId, passageId)` | Compatibility Promise returning HTML `PassageDisplay` for components. |

## Development

You need Node and pnpm. The docs and demos use HelloAO and need no app key.

| Command | What it does |
| --- | --- |
| `pnpm install` | Installs dependencies. |
| `pnpm dev` | Serves the docs and demo page at `http://localhost:5173`. |
| `pnpm typecheck` | Checks types. |
| `pnpm test` | Runs the tests. |
| `pnpm build` | Builds the browser script, the ES module, and the type declarations into `dist`. |
| `pnpm build:site` | Builds the docs and demo page into `dist-site`. |
| `pnpm check` | Runs the typecheck, tests, and both builds, as CI does. |

### Deploying the website to Cloudflare Workers

Connect this repository to your Worker. In **Settings > Build**, use:

| Setting | Value |
| --- | --- |
| Build command | `pnpm build:site` |
| Deploy command | `npx wrangler deploy --assets ./dist-site` |
| Preview command | `npx wrangler preview` |

The repository's `wrangler.jsonc` points both production and preview deployments at `dist-site` and enables Cloudflare Previews.

Under **Build variables and secrets**, set `NODE_VERSION` to `24` to match CI. No Bible API key is required.

The website build is separate from `pnpm build`, which still produces the npm package in `dist`.

### Releasing

Releases use [Changesets](https://github.com/changesets/changesets). Run `pnpm changeset` in a PR to describe the change and pick a version bump. When the PR merges, a "Version Packages" PR opens. Merging that PR publishes the new version to npm.

## Credits

- From [Cameron Pak](https://cameronpak.com), part of [Faith Tools Software Solutions, LLC](https://faith.tools).
- Default Bible text from [HelloAO's Free Use Bible API](https://bible.helloao.org/docs/), with optional [YouVersion Platform](https://developers.youversion.com/) and [fetch.bible](https://fetch.bible/) support.
- References parsed by [grab-bcv](https://github.com/dpshde/grab-bcv), and links open [route.bible](https://route.bible), both by [Dylan Shade](https://github.com/dpshde).
- Docs styled with [Sensible UI](https://sensibleui.com).

## License

[MIT](LICENSE.md)
