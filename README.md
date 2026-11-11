# Bible SDK

A unified Bible data SDK, with optional drop-in Scripture components for web pages.

<img src="assets/banner.png" width="2533" height="718" alt="A passage input suggesting Isaiah 40:3, a Scripture card showing John 3:16 under a reference link, and a passage showing Isaiah 40:8">

Choose the surface your application needs:

- **[Bible data SDK](#bible-data-sdk):** Discover versions, books, and chapters, and retrieve Scripture with attribution and display guidance. Use async/await or native Effect v4 without a DOM.
- **[Browser components](#getting-started):** Display passages, choose passages and translations, or turn Bible references into Scripture cards. No framework is required.

Bible text comes from [AO Lab's Free Use Bible API](https://bible.helloao.org/docs/) by default, with no API key. The [YouVersion Platform](https://developers.youversion.com/), [fetch.bible](https://fetch.bible/), and server-only [API.Bible](https://api.bible/) are optional providers. Bible SDK is an independent community project, not affiliated with YouVersion or Life.Church.

> Bible SDK is in preview. Expect changes before 1.0.

## Migrating from Scripture Inline

Bible SDK is the new name for Scripture Inline. Replace `@faith-tools/scripture-inline` with `@faith-tools/bible-sdk` in your dependencies and imports, keeping `/data`, `/data/effect`, and `/providers/*` subpaths. For script tags, update the package URL and use `dist/bible-sdk.js`; `dist/scripture-inline.js` remains an identical compatibility copy in the new package. Load only one script.

Use `<bible-sdk-passage>`, `<bible-sdk-passage-input>`, and `<bible-sdk-version-input>`. We mistakenly published `bible-sk-*` during the rebrand; those names are deprecated but still work, as do `si-*`. New tag constants use `BIBLE_SDK_*_TAG`; existing constants keep their values. Update CSS selectors and DOM queries when renaming tags. Scripts pinned to 0.9.1 or earlier need an upgrade for the corrected names.

Attributes (including `data-scripture-inline-ignore`), `scriptureInline()` and other JavaScript exports, `scripture-*` events, and CSS classes and custom properties remain compatible. Existing pinned old-package CDN URLs continue to use their original release; they do not automatically upgrade or register the new tags.

## Bible data SDK

The data SDK works in a browser, Node, or Bun without components, DOM access, CSS injection, or page-wide component defaults. API.Bible is server-only because its API key is private. Import `/data` for async/await, or [`/data/effect`](#native-effect-api) for native Effect programs. Both use the same Effect v4 implementation, validation, errors, and caching.

Install the package. You do not need to import or directly install Effect for async/await. Effect remains a transitive runtime dependency and contributes to bundle size.

```sh
pnpm add @faith-tools/bible-sdk
```

```ts
import { createScriptureClient } from "@faith-tools/bible-sdk/data";

const scripture = createScriptureClient(); // AO Lab, default BSB
const versions = await scripture.listVersions();
const books = await scripture.listBooks({ versionId: "BSB" });
const chapters = await scripture.listChapters({ versionId: "BSB", bookId: "JHN" });
const passage = await scripture.getPassage({
  versionId: "BSB", passageId: "JHN.3.16-18",
});
console.log(passage.text);
console.log(passage.attribution.text);
console.log(passage.instructions);
```

The example returns John 3:16–18 as `passage.text`, with separate attribution and instructions. AO Lab is the default. To use another source, [choose a provider](#choose-a-bible-provider). See the [data reference](#data-reference) for supported passage IDs and result fields.

### Native Effect API

If your application uses Effect, install `effect@^4` directly and import from `/data/effect`. Methods return lazy Effects with the same results and `ScriptureError` in the failure channel.

The same discovery and passage example, composed as one Effect program:

```ts
import { Effect } from "effect";
import { createScriptureClient } from "@faith-tools/bible-sdk/data/effect";

const scripture = createScriptureClient(); // AO Lab, default BSB
const program = Effect.gen(function*() {
  const versions = yield* scripture.listVersions();
  const books = yield* scripture.listBooks({ versionId: "BSB" });
  const chapters = yield* scripture.listChapters({ versionId: "BSB", bookId: "JHN" });
  const passage = yield* scripture.getPassage({
    versionId: "BSB", passageId: "JHN.3.16-18",
  });
  console.log(passage.text);
  console.log(passage.attribution.text);
  console.log(passage.instructions);
});

await Effect.runPromise(program);
```

Use `Effect.catchTag("ScriptureError", ...)` for expected failures. Layers, `RequestPolicy`, and service-based `scripture` programs are exported from `/data/effect`, not `/data`. See [Effect configuration and custom providers](#effect-configuration-and-custom-providers) for composition and testing.

### Verse of the day

`getVerseOfTheDay({ date?, versionId?, calendarSource? })` returns `{ date, calendarSource: { provider, sourceUrl }, passage }`. `calendarSource` chooses the daily reference calendar, not the Bible text provider; it defaults to `"provider"`, the selected provider's native calendar. `passage` is the full `ScripturePassage`, including attribution, licenses, source limitations, and display instructions. Available in both `/data` and `/data/effect`; Effect consumers can also use `scripture.getVerseOfTheDay()` with a `BibleSource` Layer.

```ts
import { createScriptureClient } from "@faith-tools/bible-sdk/data";

const scripture = createScriptureClient(); // AO Lab, default BSB
const daily = await scripture.getVerseOfTheDay();
console.log(daily.date, daily.passage.reference);
console.log(daily.passage.text);
console.log(daily.passage.attribution.text);
```

`date` is a real `YYYY-MM-DD` calendar date, not a timestamp. Omit it for the runtime's local date when the operation executes. On a server, pass the reader's date explicitly if their timezone differs. Invalid dates fail with `invalid_reference`.

| Provider | Native calendar (`capabilities.verseOfTheDay`) | Notes |
| --- | --- | --- |
| AO Lab | `true` | Its SDK selects from an [MIT-licensed reference dataset](https://bible.helloao.org/docs/reference/datasets/#verse-of-the-day), using the shared convention, including Christian holidays. Dates have a deterministic yearly order. |
| YouVersion | `true` | Its [calendar API](https://developers.youversion.com/api/verse-of-the-days) accepts day 1-366, with no year parameter. The SDK accepts only dates in the runtime's current year, not historical or future-year lookups. This does not promise a published schedule for future days. |
| fetch.bible | `false` | No native calendar is documented in its [client API](https://fetch.bible/access/client/). Opt into the shared reference calendar. |
| API.Bible | `false` | Its [daily-verse tutorial](https://docs.api.bible/tutorials/verse-of-the-day) uses an app-owned reference list, not a native calendar endpoint. Opt into the shared reference calendar with a data adapter. |

Check `scripture.capabilities.verseOfTheDay` to label or disable a **provider calendar** option in your interface. It reports the provider's implementation, not credentials, translation availability, or rights. Without native support, the default call fails with `unsupported` and makes no calendar request. Existing custom providers remain compatible; implement optional `BibleDataProvider.getVerseOfTheDay(date)` returning an Effect of `{ passageId, sourceUrl }` to expose a native calendar.

For a shared daily selection with any data provider, opt in explicitly:

```ts
const daily = await scripture.getVerseOfTheDay({
  calendarSource: "ao-lab", // Only the reference comes from AO Lab.
  date: "2026-12-25",
  // versionId: "eng_bsb", // If scripture uses fetch.bible.
});
```

The result records the calendar in `daily.calendarSource` separately from the text provider in `daily.passage.provider`. This is AO Lab's selection, not fetch.bible's, API.Bible's, or YouVersion's own daily verse. There is no automatic fallback after authentication, network, or availability failures. If the selected translation lacks the book or verse, the request fails with `unavailable`; it does not replace the verse or translation. References use standard English/BSB numbering; cross-provider versification differences remain possible, not automatically mapped.

The shared list contains references, not Scripture text. Its MIT license does not grant rights to the selected translation. [fetch.bible](https://fetch.bible/access/) requires following each translation's terms. [YouVersion](https://platform.youversion.com/terms) still requires your public app key, publisher agreements, attribution, and applicable paid-app and AI-use conditions. [API.Bible](https://care.api.bible/article/396-licensing-policies-quick-reference) still requires your own server-side credentials, applicable plan and translation permissions, copyright display, FUMS web-display reporting, and refreshing cached content within 30 days. Daily results preserve the passage's instructions; no new persistent caching or offline rights are established. Verse art and devotional content are not included.

To use the existing passage component, resolve the daily selection, then set its `passage-id` to `daily.passage.passageId`. Use the same provider and version on the component. The data API does not register components or start an automatic midnight refresh; call it again when your app needs a new day's verse.

## Getting started

### Add the script

Add this script to register the browser components and turn Bible references into Scripture cards. Cards and passages use AO Lab's Berean Standard Bible (BSB) without an API key.

```html
<script
  src="https://cdn.jsdelivr.net/npm/@faith-tools/bible-sdk@0.9.1/dist/bible-sdk.js"
></script>
```

To use another source, [choose a provider](#choose-a-bible-provider). Attributes that start with `yvp-` are YouVersion settings. Passage IDs such as `JHN.3.16` use [USFM book codes](https://ubsicap.github.io/usfm/).

## Bible references

Turn references such as "John 3:16" and "Rom 8:28-30" into links that open Scripture cards or [route.bible](https://route.bible). The links preserve the original text layout.

The reference finder skips `code`, `pre`, links, form fields, and elements marked `data-scripture-inline-ignore`. It also finds references in content added later, including pages that Turbo or Astro view transitions swap in. Mark content that React or another framework renders with `data-scripture-inline-ignore` so the reference finder does not modify framework-owned text.

| Script tag / JavaScript | Default | Purpose |
| --- | --- | --- |
| `data-provider` / `provider` | `ao-lab` | `ao-lab` or `youversion`. JavaScript also accepts a `BibleProvider` object. `helloao` is a deprecated input alias. |
| `data-bible-version-id` / `bibleVersionId` | Provider default | `BSB` for AO Lab; `3034` for YouVersion. IDs are provider-specific. |
| `data-yvp-public-app-key` / `yvpPublicAppKey` | None | Your public app key. Required only for YouVersion. |
| `data-yvp-api-host` / `yvpApiHost` | YouVersion's API | Another YouVersion API host, for testing. |
| `data-mode` / `mode` | `card` | `card` opens a Scripture card. `link` links to route.bible. |
| `data-trigger` / `trigger` | `click` | `hover` also opens cards on mouse hover. |
| `data-yvp-bible-version-id` / `yvpBibleVersionId` | `3034` | YouVersion-only alias. `bibleVersionId` takes precedence. |
| `data-reference` / `reference` | `heading` | The card's reference layout, as on `<bible-sdk-passage>`. |
| `root` | Whole page | The element to look for references in. Leave it unset on sites that replace `<body>`. JavaScript only. |
| `watch` | `true` | Also links references in content added later, such as pages that Turbo swaps in. `false` scans once. JavaScript only. |

## `<bible-sdk-passage>`

```html
<bible-sdk-passage passage-id="JHN.3.16"></bible-sdk-passage>
```

| Attribute | Default | Purpose |
| --- | --- | --- |
| `provider` | The script's provider, or `ao-lab` | `ao-lab` or `youversion`. `helloao` is a deprecated input alias. |
| `bible-version-id` | The script's version, or provider default | `BSB` for AO Lab; `3034` for YouVersion. |
| `yvp-bible-version-id` | `3034` | YouVersion-only alias. `bible-version-id` takes precedence. |
| `passage-id` | None | A USFM passage such as `ROM.8.28-30`, or a whole chapter such as `ROM.8`. Required. |
| `reference` | `heading` | Where the reference shows: `heading`, `citation`, `quote`, or `none`. |
| `verse-numbers` | Shown | `hide` removes verse numbers. |
| `headings` | Shown | `hide` removes section headings. |
| `red-letter` | Provider styling | `on` colors marked words of Jesus red; `off` uses the text color. Omitted: red for AO Lab, YouVersion, and fetch.bible; official muted styling for API.Bible. Requires source markers. |
| `theme` | `light` | `light`, `dark`, or `auto` to follow the system. |
| `direction` | From the passage | `ltr` or `rtl`. |
| `yvp-public-app-key` | The script tag's key | Overrides the page-wide app key. |
| `yvp-api-host` | YouVersion's API | Another API host, for testing. |

Attributes choose what the passage shows. CSS properties choose how it looks, so one rule can style every passage on a page:

```css
bible-sdk-passage {
  --scripture-font-size: 18px;
  --scripture-max-width: 40rem;
}
```

| CSS property | Default | Purpose |
| --- | --- | --- |
| `--scripture-font-size` | `20px` | The Bible text size. The reference line scales with it. |
| `--scripture-line-height` | `1.625` | Line height of the Bible text. |
| `--scripture-font-family` | Georgia (AO Lab), Untitled Serif (YouVersion) | Font of the Bible text. |
| `--scripture-max-width` | `32rem` | Line length of the text, reference, and copyright. |

The passage renders in a shadow root, so page CSS can't change it by accident. To restyle a piece on purpose, use its part, such as `bible-sdk-passage::part(citation) { font-style: italic; }`.

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
| `scripture-load` | `provider`, `passageId`, `bibleVersionId`, `bibleVersion` | The passage has rendered, not necessarily become visible. `bibleVersion` has `id`, `abbreviation`, and `title`. API.Bible also supplies `reporting` and `cache`. YouVersion includes the original `yvpBibleVersionId` and `yvpBibleVersion`. |
| `scripture-error` | The error | The passage could not load. |

## `<bible-sdk-passage-input>`

```html
<form>
  <label for="passage">Passage</label>
  <bible-sdk-passage-input id="passage" name="passage" placeholder="Romans 8 or John 3:16"></bible-sdk-passage-input>
</form>
```

Use the field to choose a book, chapter, verse, or range. Focus the empty field to browse every book. Type "Roman 8" to find Romans 8. The field stores a USFM ID such as `ROM.8` or `ROM.8.1`.

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

The field renders in a shadow root. It reads the page's `--input`, `--ring`, `--radius`, `--popover`, `--accent`, and `--font-sans` tokens when they exist. To restyle it further, use its parts: `input`, `listbox`, `option`, and `count`, such as `bible-sdk-passage-input::part(input) { height: 2.5rem; }`.

To show the picked passage:

```js
const input = document.querySelector("bible-sdk-passage-input");
const passage = document.querySelector("bible-sdk-passage");
input.addEventListener("change", (event) => {
  if (event.detail.passageId) passage.setAttribute("passage-id", event.detail.passageId);
});
```

## `<bible-sdk-version-input>`

```html
<label for="translation">Translation</label>
<bible-sdk-version-input id="translation" name="translation" value="BSB"></bible-sdk-version-input>
```

Search translations by name or abbreviation and filter by language. The field starts with the selected translation's language, or the browser's language. Typing does not change the selection until you choose a translation.

Use the arrow keys and Enter to choose a translation, or Escape to close the list. Form reset restores the initial selection. If the catalog fails to load, select **Retry**.

| Attribute | Default | Purpose |
| --- | --- | --- |
| `value` | The script's version, or provider default | The selected provider's translation ID, such as `BSB`. |
| `name` | None | The form field name. The form submits the translation ID. |
| `language` | Selected translation or browser language | A language tag such as `en`, or `all`. Filters choices, not the selected passage. |
| `placeholder` | `Search translations` | Hint text in the search field. |
| `disabled` | Off | Turns the field off. |
| `provider` | The script's provider, or `ao-lab` | `ao-lab` or `youversion`. `helloao` is a deprecated input alias. |
| `yvp-public-app-key` | The script tag's key | Your public app key. Required only for YouVersion. |
| `yvp-api-host` | YouVersion's API | Another YouVersion API host, for testing. |

| Event | Detail | When |
| --- | --- | --- |
| `change` | `provider`, `bibleVersionId`, `bibleVersion` | The reader picks a different translation. |
| `scripture-versions-load` | `provider`, `versions` | The provider's catalog loads. |
| `scripture-error` | The error | The catalog could not load. |

The `value` property reads or sets the selected ID. `bibleVersion` has `id`, `abbreviation`, `title`, and optional `language` and `languageName`. An ID unavailable from the selected provider clears the field and marks it invalid. IDs are unique within a provider, not across providers. AO Lab's `BSB` and YouVersion's `3034` both name the Berean Standard Bible, but matching names or abbreviations do not guarantee identical editions.

To connect the picker to a passage using the same provider:

```js
document.querySelector("bible-sdk-version-input").addEventListener("change", (event) => {
  document.querySelector("bible-sdk-passage").setAttribute("bible-version-id", event.detail.bibleVersionId);
});
```

The field uses the same page style tokens as the passage input. Its parts are `language`, `input`, `listbox`, `option`, `status`, and `retry`.

## JavaScript

If you use a bundler, install the package and register the browser components you need:

```sh
npm install @faith-tools/bible-sdk
```

```js
import { defineScripturePassage, definePassageInput, defineVersionInput, scriptureInline } from "@faith-tools/bible-sdk";

defineScripturePassage();
definePassageInput();
defineVersionInput();
scriptureInline({ root: document.querySelector("article") });
```

| Export | Purpose |
| --- | --- |
| `scriptureInline(options)` | Finds and links references. Takes the [Bible references](#bible-references) options and returns `{ links, stop }`. `stop()` restores the plain text. |
| `defineScripturePassage(options)` | Registers `<bible-sdk-passage>`, deprecated `<bible-sk-passage>`, and compatible `<si-passage>`. Accepts the provider options above as page-wide defaults. Passage attributes override them. |
| `aoLabProvider` | The default provider, using the `free-use-bible-api` SDK. `helloaoProvider` remains a deprecated alias. |
| `createYouVersionProvider({ yvpPublicAppKey, yvpApiHost })` | Creates the optional YouVersion provider. |
| `definePassageInput()` | Registers `<bible-sdk-passage-input>`, deprecated `<bible-sk-passage-input>`, and compatible `<si-passage-input>`. |
| `defineVersionInput(options)` | Registers `<bible-sdk-version-input>`, deprecated `<bible-sk-version-input>`, and compatible `<si-version-input>`. Shares provider defaults with `defineScripturePassage()`. |
| `listBibleVersions(options)` | Returns the provider's catalog as `Promise<BibleVersion[]>`. Accepts provider options; caches successful requests. |
| `findReferences(text)` | Returns the references in a string, without touching the page. |

Use the shared catalog for your own controls, too:

```js
import { listBibleVersions } from "@faith-tools/bible-sdk";

const versions = await listBibleVersions(); // AO Lab, unless page defaults select another provider
const english = versions.filter((version) => version.language === "en");
```

## Choose a Bible provider

Use AO Lab by default, or select fetch.bible, YouVersion, or API.Bible. All four support the same data API; API.Bible runs only on your server. Each client uses one provider; it never substitutes a translation or falls back to another source.

| Provider | Setup | Default version ID |
| --- | --- | --- |
| [AO Lab](https://bible.helloao.org/docs/) | No API key. Default provider. | `BSB` |
| [fetch.bible](https://fetch.bible/) | No API key. Declare your usage. | `eng_bsb` |
| [YouVersion](https://platform.youversion.com/) | Requires a public app key. | `3034` |
| [API.Bible](https://api.bible/) | Your own private key and official SDK client, server-only. | Explicitly choose an accessible edition. |

> [!IMPORTANT]
> API.Bible requires server-side setup. Keep your API.Bible key on your server. For browser components, use your app's backend or a compatible serverless function to fetch passages. You do not need a separate proxy service.
>
> If your site only serves static files, add a server endpoint or choose [AO Lab](#ao-lab-use-the-default) for a browser-only setup without an API key.

Version IDs belong to one provider: `BSB`, `eng_bsb`, and `3034` are not interchangeable. Review the selected translation's license before use. Free access and usage filters do not grant commercial, redistribution, or offline rights.

**YouVersion has additional paid-app and AI-use conditions.** Review the [YouVersion requirements](#youversion-requirements) before using that adapter.

### AO Lab: use the default

```ts
import { createScriptureClient } from "@faith-tools/bible-sdk/data";

const scripture = createScriptureClient(); // Default BSB
const passage = await scripture.getPassage({ passageId: "JHN.3.16" });
console.log(passage.text, passage.attribution);
```

AO Lab preserves headings, poetry, and words-of-Jesus formatting in native HTML when supplied by the translation. Its license notice, or the translation name linked to the license, appears below the displayed text. To create a separate provider instance, import `createAOLabProvider` from `@faith-tools/bible-sdk/providers/ao-lab`.

Use `aoLabProvider`, `createAOLabProvider()`, and `provider: "ao-lab"` for new code. The old `helloaoProvider`, `createHelloAOProvider()`, `/providers/helloao` import path, and `provider: "helloao"` input remain supported as deprecated aliases. Daily-verse selection uses `calendarSource: "ao-lab"`; `calendarSource: "helloao"` is also a deprecated alias. Returned provider IDs (including event details and daily calendar provenance) remain `helloao`, and tracing identifiers and upstream URLs stay unchanged. This additive migration does not change the source or its data.

### fetch.bible: declare your usage

```ts
import { createScriptureClient } from "@faith-tools/bible-sdk/data";
import { createFetchBibleProvider } from "@faith-tools/bible-sdk/providers/fetch-bible";

const scripture = createScriptureClient({
  provider: createFetchBibleProvider({ usage: { commercial: false } }),
}); // Default eng_bsb
const passage = await scripture.getPassage({ passageId: "JHN.3.16" });
console.log(passage.text, passage.attribution);
```

Set `usage.commercial` to your application's actual use. The example declares noncommercial use. The `derivatives`, `attributionless`, and `limitless` filters default to `false`, `false`, and `true`. Filters are not legal permission; review each translation's terms. The adapter uses the official collection.

### API.Bible: your own server-side client

**Browser components use your server.** Create an endpoint on your backend or a compatible serverless function. The component requests passages from that endpoint; only your server sends the private key to API.Bible.

Install the [official SDK](https://api.bible/sdk) alongside Bible SDK on a Node 20+ or Bun server. This adapter uses the `node` export condition; other server runtimes need Node-compatible package resolution:

```sh
pnpm add @faith-tools/bible-sdk @americanbible/api-bible-sdk
```

Each application supplies its own registered API.Bible account/key and applicable licenses. Bible SDK supplies adapter code, not access through a shared account. Keep the key in a server secret, never a browser bundle, `VITE_*` variable, element attribute, URL, or log. The adapter export rejects browser resolution and construction; that is not a replacement for keeping secrets out of client code.

```ts
// Server code only. The same provider works with /data/effect.
import { createBibleClient } from "@americanbible/api-bible-sdk";
import { createScriptureClient } from "@faith-tools/bible-sdk/data";
import { createApiBibleProvider } from "@faith-tools/bible-sdk/providers/api-bible";

const apiKey = process.env.API_DOT_BIBLE_API_KEY;
if (!apiKey) throw new Error("Set the server's API.Bible key.");

const scripture = createScriptureClient({
  provider: createApiBibleProvider({
    client: createBibleClient({ apiKey, retry: { maxAttempts: 1 } }),
    defaultVersionId: "bba9f40183526463-01", // BSB; verify access for your app.
  }),
});
const passage = await scripture.getPassage({ passageId: "JHN.3.16-18" });
// Your application renders text/attribution, preserves publisher metadata,
// and reports passage.reporting.token on each actual web display.
```

Set upstream `maxAttempts: 1` so Effect owns retries and deadlines, and avoid SDK hooks/custom transports that log credentials or response bodies. Choose `defaultVersionId` from your account's `listVersions()` results, not an AO Lab or YouVersion ID. No edition is chosen automatically. Chapters exclude intro entries. Plain text preserves scriptural superscriptions and poetry line breaks, not style-derived indentation, alignment, italics, or small caps. It omits editorial headings and notes and does not claim KJV numbering. Incomplete endpoint coverage fails rather than silently claiming the whole requested range; the upstream passage endpoint can limit results to 200 verses.

**Application obligations:** review the [Terms](https://api.bible/terms-and-conditions), [AUP and account agreements](https://care.api.bible/article/392-how-to-create-a-new-app), and each translation's metadata. Returned instructions are guidance, not certification of compliance.

- **Display reporting:** preserve `reporting.token` and report every actual web view to [FUMS](https://care.api.bible/article/417-understanding-fums), including cached displays. Do not report fetches/prefetches as views. The host owns device/session IDs and privacy requirements; the adapter sends no analytics automatically.
- **Attribution:** render `attribution.text` and links below Scripture, identify the translation, and provide the required linked copyright/about page. Preserve `publisher.copyrightHtml` and `publisher.infoHtml`; these are untrusted upstream HTML, so sanitize before rendering. Keep the visible API.Bible source link.
- **Caching and removal:** discovery/publisher caches refresh after 14 days. Refresh your own copies by `cache.expiresAt` (epoch milliseconds), never retain metadata/content over 30 days without refresh, and honor shorter removal/revocation deadlines. Some requests require removal within 24 hours; termination provisions can require immediate deletion. A TTL is not offline permission.
- **Plan and content restrictions:** Starter is noncommercial even for public-domain editions. Each app owner must accept the required account agreements, including the Statement of Orthodoxy, and check licenses, content-integrity requirements, territorial/export restrictions, and economic sanctions. Violations can lead to suspension/revocation, removal duties, audits, fees, and indemnification.
- **DRM and AI:** the published terms require application-level DRM restricting copying/distribution, printing over 100 verses, territory and device counts; they do not specify a universally compliant implementation. Keeping the key private does not satisfy that whole obligation. [Express Licensing guidance](https://care.api.bible/article/405-express-licensing-faqs) restricts copyrighted and Creative Commons Scripture in LLM prompts as well as training. Public-domain runtime prompts are permitted; confirm training, TTS, and exports separately.

#### API.Bible in the passage component

The same server provider implements `getPassageDisplay(versionId, passageId)`. It requests native HTML once, validates coverage, sanitizes unsafe markup, and preserves USX classes for poetry, scriptural titles, small caps, italics, and tables. The component loads a reviewed, commit-pinned copy of API.Bible's [official Scripture Styles](https://docs.api.bible/resources/scripture-styling/) inside its shadow root. That CSS is optional under API.Bible's guidance, not a required design. Its defaults remain customizable with `--scripture-*`; `theme`, `verse-numbers`, `headings`, and `direction` still work. Omit `red-letter` to keep the official muted `.wj` styling, use `red-letter="on"` to color marked words of Jesus red, or use `red-letter="off"` for the text color. These controls require the translation to supply words-of-Jesus markers. Hiding editorial headings leaves scriptural Psalm titles visible.

Keep the provider on your server. Expose safe displays through an app-owned endpoint, then pass a browser provider to `defineScripturePassage`. There is no private-key attribute and no built-in `provider="api-bible"` string option.

```ts
// Server route: GET /api/scripture. Use your own server's routing convention.
import { Effect } from "effect";
import { createBibleClient } from "@americanbible/api-bible-sdk";
import { createApiBibleProvider } from "@faith-tools/bible-sdk/providers/api-bible";

const provider = createApiBibleProvider({
  client: createBibleClient({ apiKey: process.env.API_DOT_BIBLE_API_KEY!, retry: { maxAttempts: 1 } }),
  defaultVersionId: "bba9f40183526463-01",
  copyrightUrl: "/copyright/bible", // Build this page before serving Scripture.
});
const allowedVersions = new Set([provider.defaultVersionId]); // Your licensed editions.

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const versionId = query.get("version") ?? provider.defaultVersionId;
  if (!allowedVersions.has(versionId)) return new Response("Edition unavailable", { status: 400 });
  try {
    const value = query.has("versions")
      ? (await Effect.runPromise(provider.listVersions())).filter(({ id }) => allowedVersions.has(id))
      : await Effect.runPromise(provider.getPassageDisplay(versionId, query.get("passage") ?? ""), { signal: request.signal });
    return Response.json(value, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response("Scripture unavailable", { status: 502 }); // Never return SDK diagnostics.
  }
}
```

```ts
// Browser code. Only your server endpoint receives requests, never your private key.
import { defineScripturePassage, type BibleProvider } from "@faith-tools/bible-sdk";

async function read(query: URLSearchParams) {
  const response = await fetch(`/api/scripture?${query}`);
  if (!response.ok) throw new Error("Scripture unavailable");
  return response.json();
}
const provider: BibleProvider = {
  id: "api-bible", defaultVersionId: "bba9f40183526463-01",
  getPassage: (version, passage) => read(new URLSearchParams({ version, passage })),
  listVersions: () => read(new URLSearchParams({ versions: "1" })),
};
defineScripturePassage({ provider });
// <bible-sdk-passage passage-id="PSA.3.1-2"></bible-sdk-passage>
```

Add your app's authentication, rate limits, edition/access controls, and privacy-aware FUMS integration. This example does not create a public shared-key proxy. The translation picker can use the same browser provider through `defineVersionInput({ provider })`.

`copyrightUrl` is required for display, not for plain-text data access. Every quotation page gets a visible link to it. Populate that app-owned page from sanitized `publisher.copyrightHtml` and `publisher.infoHtml`, the full translation name/abbreviation, the exact current dashboard/Appendix A citation, and a clickable rights-holder link. Check the result; raw metadata alone does not guarantee a complete notice. Applicable direct publisher formatting/citation agreements take precedence, and conflicts with API.Bible's remaining minimum requirements must be resolved before use.

After rendering, `scripture-load.detail.reporting` carries the FUMS token and `detail.cache.expiresAt` carries the absolute refresh deadline. Wire the event to your app's actual-view reporter, including later displays from the component's cache. The event is not proof of visibility: hidden/offscreen components and prerenders need host visibility handling. Layout/theme changes do not fire a new load event. The component sends no analytics itself. Cached displays refresh on the next load at the deadline; the host must also refresh/remove long-lived mounted displays and respond to earlier revocations. A host that still serves expired data causes a display error instead of stale Scripture.

### YouVersion: add a public app key

Get a public app key from [YouVersion Platform](https://platform.youversion.com/). Replace `YOUR_PUBLIC_APP_KEY` in this example:

```ts
import { createScriptureClient } from "@faith-tools/bible-sdk/data";
import { createYouVersionProvider } from "@faith-tools/bible-sdk/providers/youversion";

const scripture = createScriptureClient({
  provider: createYouVersionProvider({ yvpPublicAppKey: "YOUR_PUBLIC_APP_KEY" }),
}); // Default 3034
const passage = await scripture.getPassage({ passageId: "JHN.3.16" });
console.log(passage.text, passage.attribution);
```

#### YouVersion requirements

YouVersion has no commercial-use flag. Its [Platform terms](https://platform.youversion.com/terms) do not grant Bible-content rights. Check the selected publisher's license and applicable Tool terms.

- Paid applications are permitted subject to conditions, including conspicuously stating that the YouVersion Bible App is free. This is neither blanket permission nor a blanket commercial prohibition.
- The terms prohibit using Tools with AI for open-ended user chat except to retrieve and display Scripture verbatim.
- The terms prohibit using Tools to train, develop, refine, or improve AI. Cases beyond expressly permitted uses need prior written YouVersion approval.
- AI-assisted engineering and content generation have separate permissions and conditions in those terms.

These requirements also appear in returned YouVersion `instructions`.

### Use providers with browser components

With a bundler, pass the same provider object to the components and reference finder. This example uses fetch.bible; use an AO Lab or YouVersion provider object in the same way:

```js
import { defineScripturePassage, defineVersionInput, scriptureInline } from "@faith-tools/bible-sdk";
import { createFetchBibleProvider } from "@faith-tools/bible-sdk/providers/fetch-bible";

const provider = createFetchBibleProvider({ usage: { commercial: false } });
defineScripturePassage({ provider });
defineVersionInput({ provider });
scriptureInline({ provider });
```

For an individual passage or translation picker, assign `element.bibleProvider = provider`. Remove any `provider` attribute because it takes precedence. fetch.bible requires a bundler import; it is not a script-tag provider name.

Script tags support AO Lab by default and YouVersion through explicit settings:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@faith-tools/bible-sdk@0.9.1/dist/bible-sdk.js"
  data-provider="youversion"
  data-yvp-public-app-key="YOUR_PUBLIC_APP_KEY"
  data-bible-version-id="3034"
></script>
```

A standalone passage can set `provider="youversion"` and `yvp-public-app-key="YOUR_PUBLIC_APP_KEY"`. With JavaScript, the equivalent options are `{ provider: "youversion", yvpPublicAppKey: "YOUR_PUBLIC_APP_KEY" }`.

All built-in display providers add linked source credits. The fetch.bible adapter sanitizes native HTML, omits notes, loads its required stylesheet, and displays attribution separately.

### Build a custom display provider

Implement the exported `BibleProvider` interface with `id`, `defaultVersionId`, and `getPassage(versionId, passageId): Promise<PassageDisplay>`. Return safe `html`, `version: { id, abbreviation, title }`, and an `attribution` string. Optional fields are safe `attributionHtml` for links, `direction`, `containerAttributes`, and `stylesheets`. Providers must sanitize both HTML fields; Bible SDK inserts them into the shadow root.

Pass the object as `provider` to `defineScripturePassage()` or `scriptureInline()`, or assign it to a passage's `bibleProvider` property. A passage's `provider` attribute takes precedence.

To support the translation picker, also implement `listVersions(): Promise<BibleVersion[]>`. Assign the provider to its `bibleProvider` property or pass it to `defineVersionInput()`. Catalogs are scoped to the provider, including the YouVersion public app key and API host. Switching providers does not guess an equivalent translation. For a DOM-free provider, see [Effect configuration and custom providers](#effect-configuration-and-custom-providers).

## Data reference

Use uppercase [USFM book IDs](https://ubsicap.github.io/usfm/), such as `JHN` or `3JN`. `getPassage` accepts a verse (`JHN.3.16`), same-chapter inclusive range (`JHN.3.16-18`), or whole chapter (`JHN.3`).

Discovery follows the selected version's available content. Valid empty verse slots remain empty; nonexistent chapters or range endpoints fail rather than returning truncated text.

### Data and display instructions

Running `getPassage()` produces a Schema-validated, serializable `ScripturePassage`:

| Field | Meaning |
| --- | --- |
| `text` | Plain Scripture, without verse numbers, editorial headings, notes, or attribution. Meaningful breaks and wording remain. This is not a rich-text or lossless source model. |
| `provider`, `source` | Provider ID, source version ID, and source URL: the AO Lab chapter endpoint, fetch.bible TXT book endpoint, YouVersion HTTPS API base, or API.Bible website. Not a complete request log. |
| `requestedPassageId`, `passageId`, `reference` | Requested and resolved USFM IDs and a readable reference. |
| `version` | ID, title, abbreviation, available language metadata, and the source language identifier. |
| `attribution`, `licenses` | Attribution text, source/license URLs, and available license restrictions. Empty license metadata does not grant permission. |
| `publisher` | When supplied, `copyrightHtml` and `infoHtml` preserve untrusted publisher notices for your linked copyright/about page. Sanitize before rendering. |
| `reporting` | When supplied, `{ kind: "api-bible-fums", token }` identifies usage-reporting data. The host reports actual web displays, including cache hits. Fetching does not report views. |
| `cache` | When supplied, `expiresAt` is an epoch-millisecond downstream refresh deadline. It can reflect publisher metadata fetched earlier than the passage. Removal requests can override it. |
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
| `api-bible-fums`, `api-bible-publisher`, `api-bible-cache`, `api-bible-usage`, `api-bible-ai` | Implement actual-view reporting, safe publisher notices, downstream refresh/removal, account/plan/license/DRM controls, and AI restrictions. |
| `api-bible-html` | Native server-side displays preserve USX formatting and use the optional official stylesheet; plain text cannot reproduce it. Publisher formatting/citation agreements still apply. |
| `fetch-bible-native-html`, `youversion-native-html` | Apply `display.nativeHtml` resources only for separately requested native HTML. |

License restriction keys remain provider-specific. Review missing or unfamiliar fields:

- **AO Lab:** `attribution` is `required` or `not-required`. `commercialUse` and `derivatives` are `allowed` or `not-allowed`. `copyleft` and `publicDomain` are booleans.
- **fetch.bible:** `forbid_commercial`, `forbid_derivatives`, `forbid_attributionless`, `forbid_limitless`, and `forbid_other` describe restrictions. `true` prohibits that use; `false` means the filter found no such restriction, not legal permission. `forbid_derivatives: "same-license"` requires share-alike. Multiple licenses are alternative filtered choices, not cumulative grants; select and follow a suitable license.
- **YouVersion:** No unified license restriction flags are supplied.
- **API.Bible:** No unified license restriction flags are supplied. Review the returned publisher notices and API.Bible account/content terms.

To render plain text in a browser:

1. Assign `passage.text` to `textContent`. Never insert plain text or attribution as raw HTML.
2. Apply `white-space: pre-wrap` and the supplied direction and language.
3. Show `passage.attribution.text` and its links below the passage.

For native HTML, use the same provider object through the component display contract. Do not reconstruct HTML from flattened text. Native fetch.bible HTML requires its container and functional CSS so notes do not become Scripture. YouVersion HTML requires its returned container and stylesheets; do not download or self-host its font files. The data SDK does not invoke a renderer.

fetch.bible uses KJV-normalized numbering and the Protestant 66-book canon. Its `sourceLimitations` identifies these documented trimmed ranges:

- Exodus 35:1–40:38: `eng_bstj`, `eng_bstjb`, and `grc_lxx`.
- Jeremiah 25:14–52:34: those editions plus `eng_bst`, `eng_bstb`, and `grc_bre`.

An overlapping range does not establish why a particular verse is empty. Psalm requests including verse 1 supplement TXT with native HTML's scriptural descriptive title, without editorial headings. No universal offline or persistent caching rights are established.

### Errors, caching, and custom providers

Async methods reject with the original `ScriptureError` for expected failures. Its `code` distinguishes `invalid_reference`, `unavailable`, `unsupported`, `authentication`, `rate_limit`, `network`, `timeout`, and `invalid_response`. Upstream HTTP errors are classified when their status is available; other source failures use `network`. The original error can remain in `cause`, which can contain sensitive provider diagnostics, so do not expose it to readers. API.Bible discards upstream diagnostics and response-validation causes. Programming defects are not converted to expected errors.

```ts
import { createScriptureClient, ScriptureError } from "@faith-tools/bible-sdk/data";

const scripture = createScriptureClient();
try {
  const passage = await scripture.getPassage({ passageId: "JHN.3.16" });
  console.log(passage.text);
} catch (error) {
  if (!(error instanceof ScriptureError)) throw error;
  console.error(error.code, error.message);
}
```

Built-in source requests retry network and rate-limit failures twice, with exponential delays starting at 100ms. A 15-second deadline bounds each request's entire retry sequence. Authentication, unavailable content, invalid references, and invalid responses do not retry. Override `RequestPolicy` with `Effect.provideService` for a program. Legacy Promise-only custom providers have a deadline but no automatic retries.

Each client's discovery cache and each built-in adapter's payload cache have at most 256 entries, not a byte limit. Upstream response memoization is disabled; failed or malformed payloads can be downloaded again.

- AO Lab shares validated chapters. fetch.bible shares whole books and retains its collection catalog and loaded localized book-name metadata, whose size depends on the collection.
- API.Bible discovery and publisher metadata expire after 14 days; passage payloads are not memoized. Other built-in cache entries retain their existing lifetime until clearing/eviction. Custom data providers can set `cacheTimeToLive` to an Effect `Duration.Input` for client discovery caches. API.Bible downstream caches must honor `cache.expiresAt` and any earlier removal request.
- Run `client.clearCache()`, or provide its Layer to `scripture.clearCache`, to clear that client's discovery and its provider's payload caches. Shared providers share those caches. This does not invalidate other clients' discovery or the components' separate display/catalog caches.
- The client does not memoize passage data or YouVersion attribution. Persistent caching is not provided.

### Effect configuration and custom providers

Effects support fiber interruption and `Effect.runPromise(program, { signal })`. The simple async API does not expose an interruption option. AO Lab and API.Bible receive the transport's abort signal. YouVersion and fetch.bible SDKs do not expose transport cancellation; interruption stops waiting and ignores their late results, but does not claim to stop their underlying downloads. Components interrupt obsolete loads and use scoped listener/timer cleanup.

Named spans connect client operations, provider operations, and upstream requests to your application's Effect tracer. The SDK does not choose a telemetry backend or export content, credentials, or errors to a hosted service. Configure an Effect tracer or OTLP layer in your application.

```ts
import { Effect } from "effect";
import { RequestPolicy, createScriptureClient, scripture } from "@faith-tools/bible-sdk/data/effect";

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
| `/data` client's `getPassage({ versionId, passageId })` | Promise returning `ScripturePassage` data. |
| `/data/effect` client's `getPassage({ versionId, passageId })` | Lazy Effect returning the same `ScripturePassage` data. |
| `provider.effects.getPassageData(versionId, passageId)` | Built-in provider's native Effect data operation. |
| `provider.getPassage(versionId, passageId)` | Compatibility Promise returning HTML `PassageDisplay` for components. |

## Development

You need Node and pnpm. The docs and demos use AO Lab and need no app key.

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
- Default Bible text from [AO Lab's Free Use Bible API](https://bible.helloao.org/docs/), with optional [YouVersion Platform](https://developers.youversion.com/), [fetch.bible](https://fetch.bible/), and server-only [API.Bible](https://api.bible/) support.
- References parsed by [grab-bcv](https://github.com/dpshde/grab-bcv), and links open [route.bible](https://route.bible), both by [Dylan Shade](https://github.com/dpshde).
- Docs styled with [Sensible UI](https://sensibleui.com).

## License

[MIT](LICENSE.md)
