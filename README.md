# Wordcloud

Wordcloud is a small R Shiny app for turning a column of free-text responses into an interactive word cloud. Users can upload a `.csv` or `.xlsx` file, choose the text column to analyze, click words to inspect matching responses, and export the result as standalone HTML, SVG, or PNG.

Live app: https://philip-leftwich.github.io/wordcloud/

## Key features

- Uploads `.csv` and `.xlsx` datasets
- Lets the user choose which column contains the responses
- Removes common stop words before counting terms
- Builds an interactive word cloud in the browser
- Shows the source responses for any clicked word
- Exports the current cloud in multiple formats

## Project structure

- `app/` - source Shiny app and browser-side assets
- `docs/` - exported shinylive site for static hosting
- `prototypes/` - sample input data
- `scripts/` - helper script for exporting and previewing the app locally

## Run the Shiny app locally

1. Install R packages used by the app:
   - `shiny`
   - `dplyr`
   - `tibble`
   - `stringr`
   - `tidyr`
   - `tidytext`
   - `readxl`
   - `readr`
   - `jsonlite`
   - `DT`
   - `viridisLite`
   - `scales`
2. Start R in the repository root.
3. Run `shiny::runApp("app")`.

You can try the app with `prototypes/sample_data.csv`.

## Preview the browser-only shinylive build

This repository also includes a static export of the app for browser-only use.

You can also use the published GitHub Pages version at https://philip-leftwich.github.io/wordcloud/.

1. Install the `shinylive` package in a normal local R session.
2. Run `scripts/export_and_serve.R`.
3. Open the local URL printed by `httpuv`.

The exported app must be served over `http://` or `https://`; opening the HTML directly with `file://` will not work.

## Short explainer: D3

D3 is a JavaScript library for drawing interactive, data-driven graphics in the browser. In this project, the browser-side code uses D3 together with `d3.layout.cloud` to position and render the words, handle word selection, and support client-side export of the current cloud.

## Short explainer: shinylive

shinylive is a way to run Shiny apps entirely in the browser by bundling the app with webR. Instead of sending requests to a live R server, the R code runs client-side inside the browser. In this repository, the `docs` folder contains that static shinylive export, which makes the app suitable for simple static hosting.
