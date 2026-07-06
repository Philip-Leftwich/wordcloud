# Changelog

Entries are reverse-chronological.

## Step 2 — Hand-bound click handler (GATE)

Added `ggiraph` and a click-handler mechanism test to `app/app.R`: a small
`geom_text_interactive()` plot (simple grid layout, not wordcloud packing)
where each word's `onclick` aesthetic embeds a literal
`Shiny.setInputValue('clicked_word', ...)` call — the hand-bound handler per
constraint 3, not ggiraph's own `data_id`-based selection input. A
`verbatimTextOutput` echoes the clicked word so pass/fail is visible
in-browser. Also added `site/` to `.gitignore` (export build output should
not be tracked).

Note: a first attempt at this step was built, tested, and found blank with
no console errors; diagnosis stalled when an unmodified official Shinylive
example also failed to source, indicating an environment/browser problem
rather than a real finding about our code or webR's text-rendering
capability. That attempt was discarded and this is a clean rebuild of the
same design.

Research finding recorded for Step 3: `ggwordcloud` has no ggiraph
integration (no `tooltip`/`data_id`/`onclick` aesthetics), and its
non-overlap packing layout lives in an unexported `GeomTextWordcloud`
ggproto, not a reusable `Stat`. Making the actual packed wordcloud clickable
will require a custom interactive Geom built on `ggwordcloud:::GeomTextWordcloud`
— deferred to Step 3 by design (see CLAUDE.local.md's highest-risk section).

**Gate result: PENDING.** Requires human-run verification in a webR/browser
session. Verify in a clean browser session (rule out environment issues
first — see the note above), then re-run `scripts/export_and_serve.R`, open
the served URL, check `ggiraph` loads with no console error, and click a
word in the test plot — the "You clicked: ..." text below it should update
with the correct word.

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
