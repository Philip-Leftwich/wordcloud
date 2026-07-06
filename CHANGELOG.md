# Changelog

Entries are reverse-chronological.

## Step 1 — Minimal Shinylive app, static ggwordcloud (GATE)

Added `app/app.R`: a single-file Shiny app rendering a static `ggwordcloud`
plot from a hardcoded tibble of ~20 (word, frequency) pairs. No click
capture, no ggiraph, no file upload — those belong to later steps. Added
`scripts/export_and_serve.R` to export the app via `{shinylive}` and serve it
locally over HTTP for browser testing.

**Gate result: PASS.** Human-confirmed: `scripts/export_and_serve.R` exported
and served the app; the wordcloud rendered in-browser under webR with no
console errors. `ggwordcloud` and `ggplot2` are available in the webR
package repository.
