---
"@faith-tools/bible-sdk": minor
---

Add verse of the day to the async and Effect data APIs, with native AO Lab and YouVersion calendars, native-support discovery, and an explicit AO Lab reference-calendar option for other text providers. Preserve passage attribution and licensing instructions, and document dates, provider support, and usage requirements.

Make createAOLabProvider, aoLabProvider, /providers/ao-lab, and ao-lab provider/calendar inputs primary. Keep the HelloAO exports, import path, and inputs as deprecated aliases without changing returned provider IDs, tracing identifiers, or upstream URLs.
