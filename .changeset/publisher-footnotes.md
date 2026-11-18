---
"@faith-tools/bible-sdk": minor
---

Add publisher footnotes for AO Lab and YouVersion. Passages and reference cards now show an asterisk button after each noted word that opens the note in a popover; set `notes="hide"` (or `notes: false`) to turn them off. In data, `getPassage({ includeNotes: true })` returns `notes` with each note's position in `text`, and text without notes is unchanged.
