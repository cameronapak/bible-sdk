# AGENTS.md - Bible SDK

Unified Bible data SDK with optional drop-in Scripture components. Package: `@faith-tools/bible-sdk`. A community project, not affiliated with YouVersion.

Read `CONTEXT.md` for the project's terms, and use them in code, docs, and messages.

## Commands
- `amp orb services ensure` - Start the docs and demo page and print its portal. AO Lab cards and passages need no API key.
- `pnpm dev` - The same page at http://localhost:5173, outside an orb.
- `pnpm check` - Typecheck, tests, and build. CI runs this.
- `pnpm build` - Browser script (`dist/bible-sdk.js`, plus the identical `dist/scripture-inline.js` compatibility copy), ES module (`dist/index.js`), and types (`dist/types`).
- `pnpm changeset` - Describe a change for the next release. Add one to every PR that changes the published package.

## Architecture
- `src/embed.ts` - Script tag entry. Reads `data-*` attributes and registers everything.
- `src/providers.ts` - Shared Bible provider contract, default AO Lab adapter, and optional YouVersion adapter.
- `src/index.ts` - Bundler entry and `scriptureInline()`, the reference finder.
- `src/scripture-passage.ts` - `<bible-sdk-passage>`. `src/passage-input.ts` - `<bible-sdk-passage-input>`.
- `src/version-input.ts` - `<bible-sdk-version-input>`, the translation picker using the provider's shared catalog.
- `src/card.ts` - The popover card. It renders `<si-passage>` inside a shadow root.
- `index.html` - Docs and demo page, styled with Sensible UI.

## Conventions
- New markup uses the `bible-sdk-` prefix. Keep the deprecated `bible-sk-*` names (a published rebrand typo), their exported tag-constant values, and `si-*` compatibility names working. Custom element names need separate constructors, so use thin subclasses. Never use `bs-` or `yvp-`.
- Keep the existing JavaScript exports, `si-*` tags, attributes, `scripture-*` events, CSS names, and Effect service keys compatible with Scripture Inline.
- YouVersion-specific parameters start with `yvp-` (`yvp-public-app-key`, `yvp-bible-version-id`). USFM passage IDs (`passage-id`) have no prefix.
- Always call the app key "public", in names and in docs.
- Attributes control content. CSS custom properties (`--scripture-*`) control typography.
- Use native event names when a component acts like a native element (`change` on `<si-passage-input>`). Use `scripture-*` names only when no native event fits.
- No React. No skeleton loaders. Use the circle spinner.
- Motion follows Emil Kowalski's standards. Never shift layout while content loads, links get wrapped, or popovers open.
- The docs page and the README each have attribute tables for every component. Change both together.

## Verifying UI
- Inspect changes in the browser with `agent-browser` at desktop width and 390px, in light and dark mode. Check that `document.documentElement.scrollWidth` matches the viewport width.
- AO Lab Scripture cards need no app key. Test the click and hover modes in the Bible references demo. Only the optional YouVersion provider needs a real public app key.

## Releasing
- Merging a PR with a changeset opens or updates the Version Packages PR. Merging that PR publishes to npm with trusted publishing. There is no npm token.
- Rebrand release gate: `@faith-tools/scripture-inline` used owner `cameronapak`, repo `scripture-inline`, workflow `release.yml`. Before publishing `@faith-tools/bible-sdk`, verify first-package setup and its trusted publisher against the final repository identity. Keep `release.yml`. Repository and domain metadata here describe the target state, not proof that external changes have happened.
- Keep Wrangler's internal Worker name `scripture-inline` until an approved deployment migration preserves the old workers.dev URL. Do not rename deployment identity with a branding replacement.
- After publishing, the Release workflow waits until jsDelivr serves the new version, then bumps the pinned CDN URLs in `index.html` and `README.md` through `scripts/sync-cdn-version.ts` and pushes that commit to main. The Version Packages PR leaves them alone, so the site never deploys copy/paste URLs for an unpublished version. Keep new CDN URLs in that `@faith-tools/bible-sdk@X.Y.Z` form so the script finds them.
- If that step fails, purge jsDelivr once the version exists (`https://purge.jsdelivr.net/npm/@faith-tools/bible-sdk@VERSION/dist/bible-sdk.js`, and the same for `scripture-inline.js`), then run the script and push its result.
- Before changing `exports` or the build, run `pnpm pack` and install the tarball into a scratch Vite app with `npm install <tarball>`. pnpm 12 can't add a local tarball by path.
