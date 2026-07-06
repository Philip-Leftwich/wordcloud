# Changelog

Entries are reverse-chronological.

## Step 3 — Embedded-mapping HTML export (GATE, highest risk)

Added a "Download standalone HTML" button to `app/app.R`, next to the Step 1
wordcloud. On click, the server captures the wordcloud's actual packed
layout as an SVG string (`svglite::svgstring()`), embeds a term→statement
mapping as JSON (`jsonlite::toJSON`), and hand-assembles a single HTML file
(inline SVG + `<script>` + mapping) via `writeLines()` — no `htmlwidgets`,
no `shinylive::export()`, no Pandoc involved in generating this file. The
mapping is hardcoded for now (one illustrative statement per word); real
statements arrive with file upload in a later step.

**Click detection in the exported file** matches on the clicked SVG `<text>`
element's own `textContent` (the word itself), not any `data-id`/`onclick`
attribute. This needs no ggiraph or Shiny machinery at all once exported —
the downloaded file has no R process and isn't running under webR, so
nothing from Step 2's mechanism (or its `onclick` failure) applies to it.

**Isolated prototypes run before wiring this in** (all committed under
`prototypes/`, per CLAUDE.local.md's highest-risk-assumption guidance):
- `step3_click_table.html`: hand-written, no R/Shiny/webR at all — confirmed
  the `textContent`-matching click mechanism works standalone.
- `download_test/`: minimal `downloadHandler` under webR — initially failed
  with "file wasn't available on site" even for a plain text file, with no
  console error. Traced to a known, documented bug: **Chromium issue
  468227**, which breaks Shinylive/webR downloads in Chrome/Edge/Brave
  (Firefox unaffected) unless the `download` HTML attribute is stripped from
  the generated link. Fixed by overriding `downloadButton()` to clear
  `tag$attribs$download` before the UI is built (now also applied in
  `app/app.R`). Confirmed fixed the download after the workaround.
- `svg_download_test/`: combined `svglite::svgstring()` capture + JSON
  mapping + the Chromium workaround — confirmed the assembled file, once
  downloaded, reproduces click-to-statement behaviour standalone.

**Known blocker (unchanged from Step 2, still relevant):** local
`shinylive::export()` remains broken for this app once `ggiraph` is a
dependency (posit-dev/r-shinylive#150, open upstream). All verification for
this step was done via the Shinylive online editor instead, matching Step 2.

**Gate result: PASS.** Human-confirmed via the Shinylive online editor,
using the actual `app/app.R`: the wordcloud renders, "Download standalone
HTML" saves a file with no error, and the downloaded file — opened
standalone, no R running — reproduces click-to-statement behaviour for the
real packed wordcloud layout. The Step 2 click-test grid was also
re-confirmed unaffected.

## Step 2 — Click capture via ggiraph data_id selection (GATE)

Added `ggiraph` and a click-handler mechanism test to `app/app.R`: a small
`geom_text_interactive()` plot (simple grid layout, not wordcloud packing)
using `data_id`/`tooltip` aesthetics, read back via ggiraph's built-in
`input$click_test_selected`. A `verbatimTextOutput` echoes the clicked word
so pass/fail is visible in-browser. Also added `site/` to `.gitignore`
(export build output should not be tracked).

**Design pivot from constraint 3.** The build order originally called for a
hand-bound JS handler via ggiraph's `onclick` aesthetic (embedding a literal
`Shiny.setInputValue()` call per element), preferred over ggiraph's built-in
`data_id` selection specifically so the same handler could be reused in
Step 3's offline HTML export. Extensive manual testing in the Shinylive
editor found:
- Basic Shiny reactivity and raw inline `onclick="Shiny.setInputValue(...)"`
  on a plain HTML button both work fine under webR.
- `ggwordcloud`'s `geom_text_wordcloud()` and `ggiraph`'s
  `geom_text_interactive()` both render correctly, alone and combined
  (confirming Step 1's original pass was correct — an earlier report of
  blank plots during this step's first attempt was a one-off browser/WASM
  flake, not reproducible).
- `geom_point_interactive(aes(onclick = ...))` **never fires** under webR,
  even though hover/tooltip on the same geom works correctly. The break is
  specific to ggiraph's onclick-string execution, not Shiny or inline JS
  generally.
- `geom_point_interactive(aes(data_id = ...))` with
  `input$<id>_selected` **does fire** correctly under webR.

Since `onclick` doesn't work at all under webR, constraint 3's "same handler
for both live app and export" premise no longer holds regardless of choice.
Step 2 therefore uses the built-in `data_id` selection for the live app.
**Flag for Step 3**: the offline HTML export has no live R/Shiny session, so
neither `onclick` nor `input$..._selected` will exist there either — Step 3
will need its own hand-written vanilla-JS click listener reading
`data-id`-equivalent attributes directly from the exported SVG DOM.

Research finding recorded for Step 3 (unchanged): `ggwordcloud` has no
ggiraph integration (no `tooltip`/`data_id`/`onclick` aesthetics), and its
non-overlap packing layout lives in an unexported `GeomTextWordcloud`
ggproto, not a reusable `Stat`. Making the actual packed wordcloud clickable
will require a custom interactive Geom built on `ggwordcloud:::GeomTextWordcloud`
— deferred to Step 3 by design (see CLAUDE.local.md's highest-risk section).

**Known blocker (separate from this gate):** the local
`scripts/export_and_serve.R` pipeline currently fails once `ggiraph`'s larger
dependency tree is involved, with `Error in desc$Repository : $ operator is
invalid for atomic vectors`. Confirmed as an open upstream bug in
`{shinylive}` itself (posit-dev/r-shinylive#150, filed by the package
maintainer, no fix or workaround yet) — not something fixable in this app's
code. This gate was verified by pasting `app/app.R` directly into the
Shinylive online editor (shinylive.io/r/editor) instead, which doesn't use
the local export pipeline. Needs revisiting before Step 3's actual export
deliverable, which does require local export to work.

**Gate result: PASS.** Human-confirmed via the Shinylive online editor: both
plots render, and clicking a word in the test plot updates "You clicked:
..." with the correct word.

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
