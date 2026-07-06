# Changelog

Entries are reverse-chronological.

## Step 1 — Minimal Shinylive app, static ggwordcloud (GATE)

Added `app/app.R`: a single-file Shiny app rendering a static `ggwordcloud`
plot from a hardcoded tibble of ~20 (word, frequency) pairs. No click
capture, no ggiraph, no file upload — those belong to later steps. Added
`scripts/export_and_serve.R` to export the app via `{shinylive}` and serve it
locally over HTTP for browser testing.

**Gate result: PENDING.** This step requires human-run verification in a
webR/browser session (cannot be run in this environment). To confirm:
run `scripts/export_and_serve.R` locally, open the served URL, and check the
wordcloud renders with no console errors — specifically no "package not
available" error for `ggwordcloud` or `ggplot2` under webR.
