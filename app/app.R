library(shiny)
library(ggplot2)
library(ggwordcloud)
library(ggiraph)
library(tibble)
library(svglite)
library(jsonlite)
library(dplyr)
library(tidytext)
library(readxl)
library(readr)
library(DT)

# Chromium bug 468227 breaks Shinylive/webR downloads in Chrome/Edge/Brave
# (Firefox unaffected) unless the download attribute is stripped from the
# generated <a> tag. Confirmed fix during Step 3 prototyping.
downloadButton <- function(...) {
  tag <- shiny::downloadButton(...)
  tag$attribs$download <- NULL
  tag
}

ui <- fluidPage(
  titlePanel("Wordcloud"),
  fileInput(
    "data_file",
    "Upload a data file (.xlsx or .csv)",
    accept = c(".xlsx", ".csv")
  ),
  selectInput("statement_column", "Column containing the statements", choices = NULL),
  uiOutput("upload_message"),
  plotOutput("cloud", height = "500px"),
  downloadButton("download_html", "Download standalone HTML"),
  hr(),
  h4("Click a word below to see its statements"),
  girafeOutput("click_test"),
  DTOutput("statement_table")
)

server <- function(input, output, session) {
  uploaded_data <- reactive({
    req(input$data_file)
    ext <- tools::file_ext(input$data_file$name)

    data <- tryCatch(
      {
        if (ext == "xlsx") {
          readxl::read_excel(input$data_file$datapath)
        } else if (ext == "csv") {
          readr::read_csv(input$data_file$datapath, show_col_types = FALSE)
        } else {
          NULL
        }
      },
      error = function(e) NULL
    )

    validate(
      need(!is.null(data), "Could not read this file. Please upload a valid .xlsx or .csv file.")
    )

    data %>% mutate(statement_id = row_number())
  })

  observeEvent(uploaded_data(), {
    updateSelectInput(
      session,
      "statement_column",
      choices = setdiff(names(uploaded_data()), "statement_id")
    )
  })

  chosen_column_is_text <- reactive({
    req(uploaded_data(), input$statement_column)
    is.character(uploaded_data()[[input$statement_column]])
  })

  output$upload_message <- renderUI({
    req(uploaded_data(), input$statement_column)
    if (!chosen_column_is_text()) {
      div(style = "color: firebrick;", "Selected column does not contain text.")
    }
  })

  tokens <- reactive({
    req(uploaded_data(), input$statement_column)
    req(chosen_column_is_text())

    uploaded_data() %>%
      select(statement_id, text = all_of(input$statement_column)) %>%
      tidytext::unnest_tokens(word, text) %>%
      anti_join(tidytext::stop_words, by = "word")
  })

  term_freq <- reactive({
    req(tokens())
    validate(
      need(nrow(tokens()) > 0, "No terms found in the selected column.")
    )
    tokens() %>% count(word, name = "freq", sort = TRUE)
  })

  term_statement_map <- reactive({
    req(tokens())
    tokens() %>%
      distinct(word, statement_id) %>%
      left_join(
        uploaded_data() %>%
          select(statement_id, statement_text = all_of(input$statement_column)),
        by = "statement_id"
      )
  })

  # Simple grid layout for the click mechanism (not wordcloud packing).
  # ggwordcloud has no ggiraph hooks, so making the actual packed layout
  # clickable remains a separate, unsolved problem.
  term_grid <- reactive({
    df <- term_freq()
    df$x <- (seq_len(nrow(df)) - 1) %% 5
    df$y <- (seq_len(nrow(df)) - 1) %/% 5
    df
  })

  cloud_plot <- reactive({
    ggplot(term_freq(), aes(label = word, size = freq)) +
      geom_text_wordcloud() +
      scale_size_area(max_size = 20) +
      theme_minimal()
  })

  output$cloud <- renderPlot(cloud_plot())

  output$click_test <- renderGirafe({
    p <- ggplot(term_grid(), aes(x = x, y = y, label = word, size = freq)) +
      geom_text_interactive(
        aes(data_id = word, tooltip = word),
        colour = "steelblue"
      ) +
      scale_size_area(max_size = 10) +
      theme_void() +
      theme(legend.position = "none")
    girafe(ggobj = p) %>%
      girafe_options(opts_selection(type = "single"))
  })

  output$statement_table <- renderDT({
    req(input$click_test_selected)
    term_statement_map() %>%
      filter(word == input$click_test_selected) %>%
      select(Statement = statement_text)
  })

  output$download_html <- downloadHandler(
    filename = "wordcloud_export.html",
    content = function(file) {
      svg_dev <- svglite::svgstring(width = 8, height = 6, standalone = FALSE)
      print(cloud_plot())
      svg_string <- svg_dev()
      dev.off()

      mapping_df <- term_statement_map() %>%
        group_by(word) %>%
        summarise(statements = list(statement_text), .groups = "drop")
      mapping_list <- setNames(mapping_df$statements, mapping_df$word)
      mapping_json <- jsonlite::toJSON(mapping_list, auto_unbox = FALSE)

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
      script_listener_4 <- "const rows = mapping[word];"
      script_listener_5 <- "const div = document.getElementById('statements');"
      script_listener_6 <- "if (!rows) { div.innerHTML = '<p>No statements found.</p>'; return; }"
      script_listener_7 <- "div.innerHTML = '<h2>' + word + '</h2><ul>' + rows.map(function(s){return '<li>' + s + '</li>';}).join('') + '</ul>';"
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
}

shinyApp(ui, server)
