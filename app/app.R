library(shiny)
library(ggplot2)
library(ggwordcloud)
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

ui <- fluidPage(
  titlePanel("Wordcloud — Step 1 (static, hardcoded data)"),
  plotOutput("cloud", height = "500px")
)

server <- function(input, output, session) {
  output$cloud <- renderPlot({
    ggplot(words, aes(label = word, size = freq)) +
      geom_text_wordcloud() +
      scale_size_area(max_size = 20) +
      theme_minimal()
  })
}

shinyApp(ui, server)
