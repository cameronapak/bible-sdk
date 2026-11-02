# @faith-tools/scripture-inline

## 0.3.1

### Patch Changes

- 4b6b85d: `<si-passage-input>`: Tapping a suggestion on iPhone now picks it and keeps the keyboard open. Before, the tap closed the list and dismissed the keyboard. On touch screens, the field's text is now 16px, so iOS Safari no longer zooms the page when the field gets focus.

## 0.3.0

### Minor Changes

- fadec07: `<si-passage>` and `<si-passage-input>` now render in a shadow root, so page CSS, such as a global `*` reset, can't restyle verse numbers or other Bible text by accident. Typography still comes from the `--scripture-*` properties. To restyle a piece on purpose, use its CSS part, such as `si-passage::part(citation)` or `si-passage-input::part(input)`. Page rules that targeted the components' inner markup no longer apply.

## 0.2.0

### Minor Changes

- 58935c8: The reference finder now watches the page and links Bible references in content added later, such as pages that Turbo or Astro view transitions swap in. Cards keep working after `<body>` is replaced. Set `watch: false` to scan once, and mark content that React or another framework renders with `data-scripture-inline-ignore`.

## 0.1.1

### Patch Changes

- 6adb332: Update the README now that the package is on npm.
