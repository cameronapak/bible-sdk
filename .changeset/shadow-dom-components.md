---
"@faith-tools/scripture-inline": minor
---

`<si-passage>` and `<si-passage-input>` now render in a shadow root, so page CSS, such as a global `*` reset, can't restyle verse numbers or other Bible text by accident. Typography still comes from the `--scripture-*` properties. To restyle a piece on purpose, use its CSS part, such as `si-passage::part(citation)` or `si-passage-input::part(input)`. Page rules that targeted the components' inner markup no longer apply.
