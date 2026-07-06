library(shiny)
library(ggplot2)
library(ggiraph)
library(dplyr)
library(tibble)
library(stringr)
library(tidyr)
library(tidytext)
library(readxl)
library(readr)
library(svglite)
library(DT)

google_fonts_href <- paste0(
  "https://fonts.googleapis.com/css2?",
  "family=Lora&family=Merriweather&family=Montserrat&",
  "family=Oswald&family=Source+Sans+3&display=swap"
)

font_choices <- c(
  "Default sans" = "sans",
  "Lora (serif)" = "Lora",
  "Merriweather (serif)" = "Merriweather",
  "Montserrat" = "Montserrat",
  "Oswald (condensed)" = "Oswald",
  "Source Sans 3" = "Source Sans 3"
)

palette_choices <- c("Viridis", "Magma", "Blues", "Warm", "Steel")

palette_scale <- function(name) {
  switch(
    name,
    Viridis = scale_colour_viridis_c(begin = 0.10, end = 0.90),
    Magma = scale_colour_viridis_c(option = "magma", begin = 0.15, end = 0.85),
    Blues = scale_colour_gradient(low = "#9ecae1", high = "#08306b"),
    Warm = scale_colour_gradient(low = "#fdae61", high = "#a50026"),
    Steel = scale_colour_gradient(low = "#a8b8c8", high = "#1f4e79")
  )
}

# Chromium bug 468227 breaks Shinylive/webR downloads in Chrome/Edge/Brave
# (Firefox unaffected) unless the download attribute is stripped.
downloadButton <- function(...) {
  tag <- shiny::downloadButton(...)
  tag$attribs$download <- NULL
  tag
}

# Deterministic elliptical spiral packer with rectangular collision checks.
# padding scales the bounding boxes; eccentricity < 1 flattens the cloud;
# rotate_prop rotates a deterministic subset of words by 90 degrees,
# excluding the three most frequent.
pack_words <- function(
  words,
  freq,
  max_size = 14,
  min_size = 3,
  padding = 1,
  eccentricity = 0.65,
  rotate_prop = 0,
  max_iter = 5000L
) {
  ord <- order(freq, decreasing = TRUE)
  words <- words[ord]
  freq <- freq[ord]
  n <- length(words)

  sizes <- scales::rescale(sqrt(freq), to = c(min_size, max_size))

  angle <- rep(0, n)
  if (rotate_prop > 0 && n > 4) {
    candidates <- seq(4L, n)
    n_rot <- floor(length(candidates) * rotate_prop)
    if (n_rot > 0) {
      picked <- unique(round(seq(1, length(candidates), length.out = n_rot)))
      angle[candidates[picked]] <- 90
    }
  }

  text_half_long <- nchar(words) * sizes * 0.30
  text_half_short <- sizes * 0.65
  half_w <- ifelse(angle == 0, text_half_long, text_half_short) * padding
  half_h <- ifelse(angle == 0, text_half_short, text_half_long) * padding

  x <- numeric(n)
  y <- numeric(n)

  for (i in seq_len(n)) {
    theta <- 0
    iter <- 0L
    repeat {
      r <- 0.25 * theta
      cx <- r * cos(theta)
      cy <- r * sin(theta) * eccentricity
      ok <- if (i == 1L) {
        TRUE
      } else {
        prev <- seq_len(i - 1L)
        all(
          abs(cx - x[prev]) > (half_w[i] + half_w[prev]) |
            abs(cy - y[prev]) > (half_h[i] + half_h[prev])
        )
      }
      iter <- iter + 1L
      if (ok || iter > max_iter) {
        break
      }
      theta <- theta + 0.1
    }
    x[i] <- cx
    y[i] <- cy
  }

  tibble(word = words, freq = freq, size = sizes, angle = angle, x = x, y = y)
}

cloud_base <- function(layout_df, family, palette) {
  ggplot(
    layout_df,
    aes(x = x, y = y, label = word, size = size, angle = angle, colour = freq)
  ) +
    palette_scale(palette) +
    scale_size_identity() +
    coord_equal() +
    theme_void() +
    theme(legend.position = "none") +
    labs(colour = NULL) -> p
  attr(p, "family") <- family
  p
}

ui <- fluidPage(
  tags$head(tags$link(rel = "stylesheet", href = google_fonts_href)),
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
        "spacing",
        "Word spacing",
        min = 0.7,
        max = 1.8,
        value = 1,
        step = 0.1
      ),
      sliderInput(
        "eccentricity",
        "Cloud shape (flat to circular)",
        min = 0.4,
        max = 1,
        value = 0.65,
        step = 0.05
      ),
      sliderInput(
        "rotate_prop",
        "Proportion of rotated words",
        min = 0,
        max = 0.5,
        value = 0,
        step = 0.05
      ),
      downloadButton("download_html", "Download standalone HTML")
    ),
    mainPanel(
      uiOutput("upload_message"),
      girafeOutput("cloud", height = "500px"),
      hr(),
      h4("Click a word in the cloud to see its statements"),
      DTOutput("statement_table")
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

  cloud_layout <- reactive({
    df <- term_freq()
    pack_words(
      df$word,
      df$freq,
      padding = input$spacing,
      eccentricity = input$eccentricity,
      rotate_prop = input$rotate_prop
    )
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

  output$cloud <- renderGirafe({
    base <- cloud_base(cloud_layout(), input$font_family, input$palette)
    p <- base +
      geom_text_interactive(
        aes(data_id = word, tooltip = word),
        family = input$font_family
      )
    girafe(
      ggobj = p,
      width_svg = 8,
      height_svg = 6,
      options = list(
        opts_selection(type = "single"),
        opts_hover(css = "cursor: pointer; opacity: 0.6;")
      )
    )
  })

  output$statement_table <- renderDT({
    req(input$cloud_selected)
    term_statement_map() %>%
      filter(word == input$cloud_selected) %>%
      select(Statement = statement_text)
  })

  output$download_html <- downloadHandler(
    filename = "wordcloud_export.html",
    content = function(file) {
      svg_dev <- svglite::svgstring(width = 8, height = 6, standalone = FALSE)
      print(
        cloud_base(cloud_layout(), input$font_family, input$palette) +
          geom_text(family = input$font_family)
      )
      svg_string <- svg_dev()
      dev.off()

      mapping_json <- term_statement_map() %>%
        group_by(word) %>%
        summarise(statements = list(statement_text), .groups = "drop") %>%
        with(setNames(statements, word)) %>%
        jsonlite::toJSON(auto_unbox = FALSE)

      # DOM built with textContent throughout: statement text is never
      # interpreted as HTML, so no injection is possible.
      js <- paste0(
        "const mapping = ",
        mapping_json,
        ";\n",
        "const svg = document.querySelector('svg');\n",
        "svg.style.cursor = 'pointer';\n",
        "svg.addEventListener('click', function (e) {\n",
        "  const t = e.target.closest('text');\n",
        "  if (!t) return;\n",
        "  const word = t.textContent.trim();\n",
        "  const div = document.getElementById('statements');\n",
        "  div.replaceChildren();\n",
        "  const h2 = document.createElement('h2');\n",
        "  h2.textContent = word;\n",
        "  div.appendChild(h2);\n",
        "  const rows = mapping[word];\n",
        "  if (!rows) {\n",
        "    const p = document.createElement('p');\n",
        "    p.textContent = 'No statements found.';\n",
        "    div.appendChild(p);\n",
        "    return;\n",
        "  }\n",
        "  const ul = document.createElement('ul');\n",
        "  rows.forEach(function (s) {\n",
        "    const li = document.createElement('li');\n",
        "    li.textContent = s;\n",
        "    ul.appendChild(li);\n",
        "  });\n",
        "  div.appendChild(ul);\n",
        "});"
      )

      html <- paste0(
        "<!doctype html><html><head><meta charset='utf-8'>",
        "<link rel='stylesheet' href='",
        google_fonts_href,
        "'>",
        "<title>Wordcloud export</title></head><body>",
        "<h1>Wordcloud (standalone export, no R)</h1>",
        svg_string,
        "<div id='statements'><p>Click a word above.</p></div>",
        "<script>",
        js,
        "</script>",
        "</body></html>"
      )

      writeLines(html, file)
    }
  )
}

shinyApp(ui, server)
