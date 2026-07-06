library(shiny)
library(ggplot2)
library(ggwordcloud)
library(ggiraph)
library(tibble)
library(svglite)
library(jsonlite)

# Chromium bug 468227 breaks Shinylive/webR downloads in Chrome/Edge/Brave
# (Firefox unaffected) unless the download attribute is stripped from the
# generated <a> tag. See posit-dev/r-shinylive discussion; confirmed fix
# during Step 3 prototyping (prototypes/download_test).
downloadButton <- function(...) {
  tag <- shiny::downloadButton(...)
  tag$attribs$download <- NULL
  tag
}

# Hardcoded word/frequency data — Step 1 gate only.
# Purpose: confirm ggwordcloud (and its ggplot2 dependency) render under webR.
words <- tribble(
  ~word,        ~freq,
  "shiny",      38,
  "webR",       34,
  "ggplot2",    30,
  "wordcloud",  28,
  "ggiraph",    24,
  "tidyverse",  22,
  "webassembly",20,
  "reactive",   18,
  "tibble",     16,
  "stringr",    15,
  "dplyr",      14,
  "purrr",      13,
  "tokenise",   12,
  "stopwords",  11,
  "colour",     10,
  "font",       9,
  "export",     8,
  "click",      7,
  "statement",  6,
  "upload",     5
)

# Simple grid layout for the click-handler mechanism test (Step 2 gate).
# Not wordcloud packing — ggwordcloud has no ggiraph hooks, so making the
# actual packed layout clickable is deferred to a later step.
words_grid <- words
words_grid$x <- (seq_len(nrow(words_grid)) - 1) %% 5
words_grid$y <- (seq_len(nrow(words_grid)) - 1) %/% 5

# Hardcoded term -> statement mapping for the Step 3 export gate. Real
# statements come from the uploaded file in a later step; this stands in
# for that mapping so the export mechanism itself can be gated now.
statements <- list(
  shiny = "The app is built entirely with Shiny.",
  webR = "webR compiles R to WebAssembly so the app runs with no server.",
  ggplot2 = "Plots are built with ggplot2's grammar of graphics.",
  wordcloud = "The wordcloud shows how often each term appears.",
  ggiraph = "ggiraph adds SVG interactivity to ggplot2 plots.",
  tidyverse = "The project favours tidyverse idioms over base R.",
  webassembly = "WebAssembly lets compiled R packages run inside the browser.",
  reactive = "Shiny's reactive model updates outputs automatically.",
  tibble = "Data is stored in tidy tibbles, one row per term.",
  stringr = "Tokenisation uses stringr for case-folding and splitting.",
  dplyr = "dplyr verbs filter and summarise the term-frequency table.",
  purrr = "purrr helps iterate over columns and lists functionally.",
  tokenise = "Tokenising splits statements into individual words.",
  stopwords = "Stopwords are removed before counting term frequency.",
  colour = "Users can choose a colour-blind-safe palette.",
  font = "Only webR-verified fonts are offered in the font selector.",
  export = "Users can export a standalone HTML file with no Pandoc dependency.",
  click = "Clicking a word reveals the statements that contain it.",
  statement = "Each statement is a row from the uploaded data file.",
  upload = "Users upload their own data file to build the wordcloud."
)

ui <- fluidPage(
  titlePanel("Wordcloud — Step 1/2/3 (static wordcloud, click-handler test, HTML export)"),
  plotOutput("cloud", height = "500px"),
  downloadButton("download_html", "Download standalone HTML"),
  hr(),
  h4("Step 2 gate: click a word below"),
  girafeOutput("click_test"),
  verbatimTextOutput("clicked_word_display")
)

server <- function(input, output, session) {
  cloud_plot <- reactive({
    ggplot(words, aes(label = word, size = freq)) +
      geom_text_wordcloud() +
      scale_size_area(max_size = 20) +
      theme_minimal()
  })

  output$cloud <- renderPlot(cloud_plot())

  output$download_html <- downloadHandler(
    filename = "wordcloud_export.html",
    content = function(file) {
      svg_dev <- svglite::svgstring(width = 8, height = 6, standalone = FALSE)
      print(cloud_plot())
      svg_string <- svg_dev()
      dev.off()

      mapping_json <- jsonlite::toJSON(statements, auto_unbox = TRUE)

      html_head <- "<!doctype html><html><head>"
      html_head2 <- "<meta charset='utf-8'>"
      html_head3 <- "<title>Wordcloud export</title></head><body>"
      html_h1 <- "<h1>Wordcloud (standalone export, no R)</h1>"
      html_div_open <- "<div id='statements'>"
      html_placeholder <- "<p>Click a word above.</p></div>"
      script_open <- "<script>"
      script_mapping <- paste0("const mapping = ", mapping_json, ";")
      script_listener_1 <- "document.querySelector('svg').addEventListener('click', function(e) {"
      script_listener_2 <- "if (e.target.tagName !== 'text') return;"
      script_listener_3 <- "const word = e.target.textContent;"
      script_listener_4 <- "const statement = mapping[word];"
      script_listener_5 <- "const div = document.getElementById('statements');"
      script_listener_6 <- "if (!statement) { div.innerHTML = '<p>No statement found.</p>'; return; }"
      script_listener_7 <- "div.innerHTML = '<h2>' + word + '</h2><p>' + statement + '</p>';"
      script_listener_8 <- "});"
      script_close <- "</script>"
      html_close <- "</body></html>"

      html <- paste0(
        html_head, html_head2, html_head3, html_h1,
        svg_string,
        html_div_open, html_placeholder,
        script_open,
        script_mapping,
        script_listener_1, script_listener_2, script_listener_3,
        script_listener_4, script_listener_5, script_listener_6,
        script_listener_7, script_listener_8,
        script_close,
        html_close
      )

      writeLines(html, file)
    }
  )

  output$click_test <- renderGirafe({
    p <- ggplot(words_grid, aes(x = x, y = y, label = word, size = freq)) +
      geom_text_interactive(
        aes(data_id = word, tooltip = word),
        colour = "steelblue"
      ) +
      scale_size_area(max_size = 10) +
      theme_void() +
      theme(legend.position = "none")
    girafe(ggobj = p)
  })

  output$clicked_word_display <- renderText({
    req(input$click_test_selected)
    paste("You clicked:", input$click_test_selected)
  })
}

shinyApp(ui, server)
