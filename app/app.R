library(shiny)
library(ggplot2)
library(ggwordcloud)
library(ggiraph)
library(tibble)

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
# actual packed layout clickable is deferred to Step 3.
words_grid <- words
words_grid$x <- (seq_len(nrow(words_grid)) - 1) %% 5
words_grid$y <- (seq_len(nrow(words_grid)) - 1) %/% 5

ui <- fluidPage(
  titlePanel("Wordcloud — Step 1/2 (static wordcloud + click-handler test)"),
  plotOutput("cloud", height = "500px"),
  hr(),
  h4("Step 2 gate: click a word below"),
  girafeOutput("click_test"),
  verbatimTextOutput("clicked_word_display")
)

server <- function(input, output, session) {
  output$cloud <- renderPlot({
    ggplot(words, aes(label = word, size = freq)) +
      geom_text_wordcloud() +
      scale_size_area(max_size = 20) +
      theme_minimal()
  })

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
