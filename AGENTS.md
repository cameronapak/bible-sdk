# AGENTS.md - Scripture Inline

Drop-in Scripture for any web page. Published as `@faith-tools/scripture-inline`. A community project, not affiliated with YouVersion.

Read `CONTEXT.md` for the project's terms, and use them in code, docs, and messages.

## Commands
- `amp orb services ensure` - Start the docs and demo page and print its portal. HelloAO cards and passages need no API key.
- `pnpm dev` - The same page at http://localhost:5173, outside an orb.
- `pnpm check` - Typecheck, tests, and build. CI runs this.
- `pnpm build` - Browser script (`dist/scripture-inline.js`), ES module (`dist/index.js`), and types (`dist/types`).
- `pnpm changeset` - Describe a change for the next release. Add one to every PR that changes the published package.

## Architecture
- `src/embed.ts` - Script tag entry. Reads `data-*` attributes and registers everything.
- `src/providers.ts` - Shared Bible provider contract, default HelloAO adapter, and optional YouVersion adapter.
- `src/index.ts` - Bundler entry and `scriptureInline()`, the reference finder.
- `src/scripture-passage.ts` - `<si-passage>`. `src/passage-input.ts` - `<si-passage-input>`.
- `src/version-input.ts` - `<si-version-input>`, the translation picker using the provider's shared catalog.
- `src/card.ts` - The popover card. It renders `<si-passage>` inside a shadow root.
- `index.html` - Docs and demo page, styled with Sensible UI.

## Conventions
- Elements use the `si-` prefix. Never `yvp-`, because YouVersion doesn't own this project.
- YouVersion-specific parameters start with `yvp-` (`yvp-public-app-key`, `yvp-bible-version-id`). USFM passage IDs (`passage-id`) have no prefix.
- Always call the app key "public", in names and in docs.
- Attributes control content. CSS custom properties (`--scripture-*`) control typography.
- Use native event names when a component acts like a native element (`change` on `<si-passage-input>`). Use `scripture-*` names only when no native event fits.
- No React. No skeleton loaders. Use the circle spinner.
- Motion follows Emil Kowalski's standards. Never shift layout while content loads, links get wrapped, or popovers open.
- The docs page and the README each have attribute tables for every component. Change both together.

## Verifying UI
- Inspect changes in the browser with `agent-browser` at desktop width and 390px, in light and dark mode. Check that `document.documentElement.scrollWidth` matches the viewport width.
- HelloAO Scripture cards need no app key. Test the click and hover modes in the Bible references demo. Only the optional YouVersion provider needs a real public app key.

## Releasing
- Merging a PR with a changeset opens or updates the Version Packages PR. Merging that PR publishes to npm with trusted publishing. There is no npm token.
- The trusted publisher on npmjs.com is owner `cameronapak`, repo `scripture-inline`, workflow `release.yml`. Renaming the workflow file breaks publishing.
- The Version Packages PR also bumps the pinned CDN URLs in `index.html` and `README.md`, through `scripts/sync-cdn-version.ts`. Keep new CDN URLs in that `@faith-tools/scripture-inline@X.Y.Z` form so it finds them.
- After a release, if the CDN URL returns 404, purge jsDelivr: `https://purge.jsdelivr.net/npm/@faith-tools/scripture-inline@VERSION/dist/scripture-inline.js`.
- Before changing `exports` or the build, run `pnpm pack` and install the tarball into a scratch Vite app with `npm install <tarball>`. pnpm 12 can't add a local tarball by path.
