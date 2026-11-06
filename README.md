# Scripture Inline

Drop-in Scripture for any web page: show a passage, pick a passage, or bring every Bible reference to life.

<img src="assets/banner.png" width="2533" height="718" alt="A passage input suggesting Isaiah 40:3, a Scripture card showing John 3:16 under a reference link, and a passage showing Isaiah 40:8">

Scripture Inline has three parts:

- **Bible references.** A script finds references such as "John 3:16" or "Rom 8:28-30" in your page's text. It makes each one open a Scripture card or link to [route.bible](https://route.bible).
- **`<si-passage>`** shows a Bible passage.
- **`<si-passage-input>`** is a form field that lets readers pick a passage, with autocomplete for books, chapters, and verses.

Bible text comes from the [YouVersion Platform](https://developers.youversion.com/). Scripture Inline is an independent community project. It is not affiliated with, endorsed by, or supported by YouVersion or Life.Church.

> Scripture Inline is in preview. Expect changes before 1.0.

## Getting started

### 1. Get an app key

Cards and passages need a free YouVersion Platform app key. Sign up at [platform.youversion.com](https://platform.youversion.com/), then create an app and copy its app key. The key is public, so you can put it in page markup. Link mode works without a key.

### 2. Add the script

```html
<script
  src="https://cdn.jsdelivr.net/npm/@faith-tools/scripture-inline@0.3.2/dist/scripture-inline.js"
  data-yvp-public-app-key="YOUR_PUBLIC_APP_KEY"
></script>
```

The script registers both components and turns the Bible references on the page into Scripture cards. Its app key is the default for every `<si-passage>` on the page.

Attributes that start with `yvp-` are YouVersion Platform settings. Passage IDs such as `JHN.3.16` use the [USFM](https://ubsicap.github.io/usfm/) book codes, so they have no prefix.

## Bible references

The script looks for references in the page's text, including abbreviations. It skips text in `code`, `pre`, links, form fields, and anything marked `data-scripture-inline-ignore`. Links lay out exactly like the text they replace, so lines never reflow. The script keeps watching the page, so it also finds references in content that loads later, including pages that Turbo or Astro view transitions swap in. Mark content that React or another framework renders with `data-scripture-inline-ignore`, because the framework expects its text to stay as it left it.

| Script tag / JavaScript | Default | Purpose |
| --- | --- | --- |
| `data-yvp-public-app-key` / `yvpPublicAppKey` | None | Your public app key. Required for `card`. |
| `data-mode` / `mode` | `card` | `card` opens a Scripture card. `link` links to route.bible. The script tag uses `link` when it has no key. |
| `data-trigger` / `trigger` | `click` | `hover` also opens cards on mouse hover. |
| `data-yvp-bible-version-id` / `yvpBibleVersionId` | `3034` | The Bible version for cards. 3034 is the Berean Standard Bible (BSB). |
| `data-reference` / `reference` | `heading` | The card's reference layout, as on `<si-passage>`. |
| `root` | Whole page | The element to look for references in. Leave it unset on sites that replace `<body>`. JavaScript only. |
| `watch` | `true` | Also links references in content added later, such as pages that Turbo swaps in. `false` scans once. JavaScript only. |

## `<si-passage>`

```html
<si-passage yvp-bible-version-id="3034" passage-id="JHN.3.16"></si-passage>
```

| Attribute | Default | Purpose |
| --- | --- | --- |
| `yvp-bible-version-id` | None | The Bible version, such as `3034` for the BSB. Required. |
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
| `--scripture-font-family` | Untitled Serif | Font of the Bible text. |
| `--scripture-max-width` | `32rem` | Line length of the text, reference, and copyright. |

The passage renders in a shadow root, so page CSS can't change it by accident. To restyle a piece on purpose, use its part, such as `si-passage::part(citation) { font-style: italic; }`.

| Part | What it is |
| --- | --- |
| `text` | The Bible text. |
| `citation` | The reference and version. |
| `version` | The version abbreviation inside the citation. |
| `attribution` | The copyright line. |
| `quote` | The block quote in the `quote` layout. |
| `loader` | The spinner while the text loads. |
| `error` | The message when the text can't load. |

| Event | Detail | When |
| --- | --- | --- |
| `scripture-load` | `passageId`, `yvpBibleVersionId`, `yvpBibleVersion` | The passage is on screen. |
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

## JavaScript

With a bundler, install the package and call the same functions the script tag uses:

```sh
npm install @faith-tools/scripture-inline
```

```js
import { defineScripturePassage, definePassageInput, scriptureInline } from "@faith-tools/scripture-inline";

defineScripturePassage({ yvpPublicAppKey: "YOUR_PUBLIC_APP_KEY" });
definePassageInput();
scriptureInline({ yvpPublicAppKey: "YOUR_PUBLIC_APP_KEY", root: document.querySelector("article") });
```

| Export | Purpose |
| --- | --- |
| `scriptureInline(options)` | Finds and links references. Takes the [Bible references](#bible-references) options and returns `{ links, stop }`. `stop()` restores the plain text. |
| `defineScripturePassage({ yvpPublicAppKey })` | Registers `<si-passage>`. The optional `yvpPublicAppKey` is the default for every passage. |
| `definePassageInput()` | Registers `<si-passage-input>`. |
| `findReferences(text)` | Returns the references in a string, without touching the page. |

## Development

You need Node and pnpm. Put your app key in `.env.local`:

```sh
VITE_YVP_APP_KEY=your-public-app-key
```

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

Under **Build variables and secrets**, add `VITE_YVP_APP_KEY` with your YouVersion public app key. Set `NODE_VERSION` to `24` to match CI. The public app key is included in the website's JavaScript at build time, so a runtime variable does not replace it. Rebuild the website when you change the key.

The website build is separate from `pnpm build`, which still produces the npm package in `dist`.

### Releasing

Releases use [Changesets](https://github.com/changesets/changesets). Run `pnpm changeset` in a PR to describe the change and pick a version bump. When the PR merges, a "Version Packages" PR opens. Merging that PR publishes the new version to npm.

## Credits

- From [Cameron Pak](https://cameronpak.com), part of [Faith Tools Software Solutions, LLC](https://faith.tools).
- Bible text from the [YouVersion Platform](https://developers.youversion.com/).
- References parsed by [grab-bcv](https://github.com/dpshde/grab-bcv), and links open [route.bible](https://route.bible), both by [Dylan Shade](https://github.com/dpshde).
- Docs styled with [Sensible UI](https://sensibleui.com).

## License

[MIT](LICENSE.md)
