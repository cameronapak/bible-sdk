# Scripture Inline

Drop-in Scripture for any web page: show a passage, pick a passage, or bring every Bible reference to life.

<img src="assets/banner.png" width="2533" height="718" alt="A passage input suggesting Isaiah 40:3, a Scripture card showing John 3:16 under a reference link, and a passage showing Isaiah 40:8">

Scripture Inline has four parts:

- **Bible references.** A script finds references such as "John 3:16" or "Rom 8:28-30" in your page's text. It makes each one open a Scripture card or link to [route.bible](https://route.bible).
- **`<si-passage>`** shows a Bible passage.
- **`<si-passage-input>`** is a form field that lets readers pick a passage, with autocomplete for books, chapters, and verses.
- **`<si-version-input>`** lets readers choose a translation by name and language, without knowing its ID.

Bible text comes from [HelloAO's Free Use Bible API](https://bible.helloao.org/docs/) by default, with no API key. The [YouVersion Platform](https://developers.youversion.com/) is an optional provider. Scripture Inline is an independent community project, not affiliated with YouVersion or Life.Church.

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

HelloAO preserves headings, poetry, and words-of-Jesus formatting when present in the translation. It displays the translation's license notice below the text, or its name linked to the license when no notice is supplied. Both built-in providers add a short source credit with the provider name linked: "Source: HelloAO Free Use Bible API" or "Source: YouVersion Platform". Check the translation's license before using it. Neither provider supports passages spanning chapters.

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
- Default Bible text from [HelloAO's Free Use Bible API](https://bible.helloao.org/docs/), with optional [YouVersion Platform](https://developers.youversion.com/) support.
- References parsed by [grab-bcv](https://github.com/dpshde/grab-bcv), and links open [route.bible](https://route.bible), both by [Dylan Shade](https://github.com/dpshde).
- Docs styled with [Sensible UI](https://sensibleui.com).

## License

[MIT](LICENSE.md)
