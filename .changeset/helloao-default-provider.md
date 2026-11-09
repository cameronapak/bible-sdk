---
"@faith-tools/scripture-inline": minor
---

Use HelloAO's Free Use Bible API and BSB by default, without an API key. Add a shared BibleProvider contract and provider/version settings for cards and passages. Keep YouVersion available through explicit provider selection, with its existing public app key, version settings, and load-event fields. Existing YouVersion integrations must select the youversion provider explicitly.

Add listBibleVersions() and a reusable si-version-input translation picker with language filtering, name/abbreviation search, keyboard selection, form submission, and catalog retry. Keep translation IDs scoped to their provider instead of guessing equivalent editions. Align poetry's first line with its verse number.

Add a concise, linked Bible provider source credit after each built-in provider's translation attribution, in passages and cards. Link the HelloAO translation name to its license when no copyright notice is supplied. Custom providers can optionally supply safe attributionHtml, with plain text still supported.

Keep attribution links understated: underline them only on hover, with a visible keyboard focus outline.
