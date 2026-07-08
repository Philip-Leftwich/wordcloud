# Wordcloud

Wordcloud is a fully client-side JavaScript app for turning a column of free-text responses into an interactive word cloud. Users can upload a `.csv` or `.xlsx` file, choose the text column to analyze, click words to inspect matching responses, and export the result as standalone HTML, SVG, or PNG.

Live app: https://philip-leftwich.github.io/wordcloud/

## Key features

- Uploads `.csv` and `.xlsx` datasets in the browser
- Lets the user choose which column contains the responses
- Removes common stop words before counting terms
- Builds an interactive word cloud in the browser
- Lets the user switch the overall cloud shape between oval, circle, and square
- Shows the source responses for any clicked word
- Exports the current cloud in multiple formats, including a standalone HTML view that matches the app layout

## Project structure

- `/home/runner/work/wordcloud/wordcloud/src/` - JavaScript application source
- `/home/runner/work/wordcloud/wordcloud/docs/` - built static site for GitHub Pages
- `/home/runner/work/wordcloud/wordcloud/app/` - legacy R/Shiny implementation kept for reference
- `/home/runner/work/wordcloud/wordcloud/prototypes/` - sample input data

## Develop locally

1. Install dependencies with `npm install`.
2. Start the development server with `npm run dev`.
3. Open the local URL printed by Vite.

## Build the published app

1. Run `npm run build`.
2. Serve `/home/runner/work/wordcloud/wordcloud/docs/` over `http://` or `https://` to preview the built app locally.

You can try the app with `/home/runner/work/wordcloud/wordcloud/prototypes/sample_data.csv`.

## Legacy implementation

The repository still includes the earlier R/Shiny implementation in `/home/runner/work/wordcloud/wordcloud/app/` so the migration remains inspectable, but the published frontend is now the JavaScript app built from `/home/runner/work/wordcloud/wordcloud/src/`.

## Short explainer: D3

D3 is a JavaScript library for drawing interactive, data-driven graphics in the browser. In this project, D3 works together with `d3-cloud` to position and render the words, handle word selection, and support client-side export of the current cloud.
