library(shiny)
library(dplyr)
library(tibble)
library(stringr)
library(tidyr)
library(tidytext)
library(readxl)
library(readr)
library(jsonlite) # attached is safe now: shiny::validate is qualified throughout

google_fonts_href <- paste0(
  "https://fonts.googleapis.com/css2?",
  "family=Lora&family=Merriweather&family=Montserrat&",
  "family=Oswald&family=Source+Sans+3&display=swap"
)

font_choices <- c(
  "Default sans" = "sans-serif",
  "Lora (serif)" = "Lora",
  "Merriweather (serif)" = "Merriweather",
  "Montserrat" = "Montserrat",
  "Oswald (condensed)" = "Oswald",
  "Source Sans 3" = "Source Sans 3"
)

palette_choices <- c("Viridis", "Magma", "Blues", "Warm", "Steel")

# Colour logic stays in R. viridisLite is already a ggplot2 dependency,
# but ggplot2 itself is no longer needed, so viridisLite is called direct.
palette_colours <- function(name, values) {
  ramp <- switch(
    name,
    Viridis = function(n) viridisLite::viridis(n, begin = 0.10, end = 0.90),
    Magma = function(n) viridisLite::magma(n, begin = 0.15, end = 0.85),
    Blues = grDevices::colorRampPalette(c("#9ecae1", "#08306b")),
    Warm = grDevices::colorRampPalette(c("#fdae61", "#a50026")),
    Steel = grDevices::colorRampPalette(c("#a8b8c8", "#1f4e79"))
  )
  cols <- ramp(100L)
  idx <- scales::rescale(values, to = c(1, 100))
  cols[round(idx)]
}

ui <- fluidPage(
  tags$head(
    tags$link(rel = "stylesheet", href = google_fonts_href),
    tags$script(src = "d3.v7.min.js"),
    tags$script(src = "d3.layout.cloud.js"),
    tags$script(src = "cloud.js")
  ),
  titlePanel("Wordcloud"),
  sidebarLayout(
    sidebarPanel(
      fileInput(
        "data_file",
        "Upload a data file (.xlsx or .csv)",
        accept = c(".xlsx", ".csv")
      ),
      selectInput(
        "statement_column",
        "Column containing the statements",
        choices = NULL
      ),
      numericInput(
        "max_words",
        "Maximum number of words",
        value = 100,
        min = 10,
        max = 300,
        step = 10
      ),
      selectInput("font_family", "Font", choices = font_choices),
      selectInput("palette", "Colour scheme", choices = palette_choices),
      sliderInput(
        "padding",
        "Word spacing (px)",
        min = 0,
        max = 10,
        value = 1,
        step = 1
      ),
      sliderInput(
        "rotate_prop",
        "Proportion of rotated words",
        min = 0,
        max = 0.5,
        value = 0,
        step = 0.05
      ),
      # Plain button: export is client-side, so downloadButton (and the
      # Chromium workaround it carried) no longer applies. See cloud.js
      # for the equivalent handling of Chromium bug 468227.
      actionButton(
        "noop",
        "Download standalone HTML",
        onclick = "cloudExport();"
      ),
      actionButton("dl_svg", "Download SVG", onclick = "cloudExportSvg();"),
      actionButton("dl_png", "Download PNG", onclick = "cloudExportPng();")
    ),

    mainPanel(
      uiOutput("upload_message"),
      div(id = "cloud_container", style = "width: 100%; height: 500px;"),
      div(id = "cloud_note", style = "color: grey; font-size: small;"),
      hr(),
      h4("Click a word in the cloud to see its statements"),
      DT::DTOutput("statement_table")
    )
  )
)

server <- function(input, output, session) {
  raw_upload <- reactive({
    req(input$data_file)
    ext <- tolower(tools::file_ext(input$data_file$name))
    path <- input$data_file$datapath

    # webR/Shinylive: datapath may lack the extension; readxl requires it
    if (tolower(tools::file_ext(path)) != ext) {
      path_ext <- paste0(path, ".", ext)
      file.copy(path, path_ext, overwrite = TRUE)
      path <- path_ext
    }

    tryCatch(
      switch(
        ext,
        xlsx = readxl::read_excel(path),
        csv = readr::read_csv(path, show_col_types = FALSE, lazy = FALSE),
        stop("Unsupported file type: .", ext)
      ),
      error = function(e) {
        structure(conditionMessage(e), class = "upload_error")
      }
    )
  })

  upload_error <- reactive({
    x <- raw_upload()
    if (inherits(x, "upload_error")) as.character(x) else NULL
  })

  uploaded_data <- reactive({
    shiny::validate(
      shiny::need(
        is.null(upload_error()),
        paste("Could not read this file:", upload_error())
      )
    )
    raw_upload() %>% mutate(statement_id = row_number())
  })

  chosen_column_is_text <- reactive({
    req(uploaded_data(), input$statement_column)
    col <- uploaded_data()[[input$statement_column]]
    is.character(col) || is.factor(col)
  })

  observeEvent(raw_upload(), {
    if (is.null(upload_error())) {
      updateSelectInput(
        session,
        "statement_column",
        choices = setdiff(names(raw_upload()), "statement_id")
      )
    } else {
      updateSelectInput(session, "statement_column", choices = character(0))
    }
  })

  output$upload_message <- renderUI({
    msg <- upload_error()
    if (!is.null(msg)) {
      return(div(
        style = "color: firebrick;",
        paste("Could not read this file:", msg)
      ))
    }
    req(uploaded_data(), input$statement_column)
    if (!chosen_column_is_text()) {
      div(style = "color: firebrick;", "Selected column does not contain text.")
    }
  })

  tokens <- reactive({
    req(uploaded_data(), input$statement_column, chosen_column_is_text())

    uploaded_data() %>%
      transmute(
        statement_id,
        text = as.character(.data[[input$statement_column]])
      ) %>%
      filter(!is.na(text), text != "") %>%
      mutate(word = str_extract_all(str_to_lower(text), "[\\p{L}']+")) %>%
      select(statement_id, word) %>%
      unnest(word) %>%
      anti_join(tidytext::stop_words, by = "word")
  })

  term_freq <- reactive({
    req(tokens())
    shiny::validate(
      shiny::need(nrow(tokens()) > 0, "No terms found in the selected column.")
    )
    tokens() %>%
      count(word, name = "freq", sort = TRUE) %>%
      slice_head(n = input$max_words)
  })

  term_statement_map <- reactive({
    req(tokens())
    tokens() %>%
      distinct(word, statement_id) %>%
      semi_join(term_freq(), by = "word") %>%
      left_join(
        uploaded_data() %>%
          select(statement_id, statement_text = all_of(input$statement_column)),
        by = "statement_id"
      )
  })

  # Push data and styling to the browser whenever anything relevant changes.
  observe({
    df <- term_freq()
    req(nrow(df) > 0)

    mapping <- term_statement_map() %>%
      group_by(word) %>%
      summarise(statements = list(statement_text), .groups = "drop")

    session$sendCustomMessage(
      "render_cloud",
      list(
        words = df$word,
        freq = df$freq,
        colours = palette_colours(input$palette, sqrt(df$freq)),
        mapping = setNames(mapping$statements, mapping$word),
        font = input$font_family,
        padding = input$padding,
        rotate_prop = input$rotate_prop
      )
    )
  })

  output$statement_table <- DT::renderDT({
    req(input$cloud_selected)
    term_statement_map() %>%
      filter(word == input$cloud_selected) %>%
      select(Statement = statement_text)
  })
}

shinyApp(ui, server)
