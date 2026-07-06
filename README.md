# Wordcloud

Wordcloud is a small R Shiny app for turning a column of free-text responses into an interactive word cloud. Users can upload a `.csv` or `.xlsx` file, choose the text column to analyse, click words to inspect matching statements, and export the result as standalone HTML, SVG, or PNG.

## Key features

- Uploads `.csv` and `.xlsx` datasets
- Lets the user choose which column contains the statements
- Removes common stop words before counting terms
- Builds an interactive word cloud in the browser
- Shows the source statements for any clicked word
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

1. Install the `shinylive` package in a normal local R session.
2. Run `scripts/export_and_serve.R`.
3. Open the local URL printed by `httpuv`.

The exported app must be served over `http://` or `https://`; opening the HTML directly with `file://` will not work.

## Short explainer: React.js

React.js is a JavaScript library for building user interfaces from reusable components. It is commonly used for rich single-page web apps where UI state changes frequently. This project does **not** use React; this note is included to make that distinction clear because the app has a browser-based interface but is built with R Shiny plus a small amount of custom JavaScript for rendering and exporting the cloud.

## Short explainer: shinylive

shinylive is a way to run Shiny apps entirely in the browser by bundling the app with webR. Instead of sending requests to a live R server, the R code runs client-side inside the browser. In this repository, the `docs` folder contains that static shinylive export, which makes the app suitable for simple static hosting.
