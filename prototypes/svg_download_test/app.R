library(shiny)
library(ggplot2)
library(svglite)
library(jsonlite)

downloadButton <- function(...) {
  tag <- shiny::downloadButton(...)
  tag$attribs$download <- NULL
  tag
}

ui <- fluidPage(
  plotOutput("preview"),
  downloadButton("download_html", "Download standalone HTML")
)

server <- function(input, output, session) {
  df <- data.frame(
    word = c("shiny", "webR", "wordcloud", "ggiraph", "export"),
    x = c(1, 3, 1.5, 3.5, 2.5),
    y = c(1, 1, 2, 2, 0.5),
    size = c(10, 6, 8, 5, 4)
  )

  plot_obj <- reactive({
    ggplot(df, aes(x = x, y = y, label = word, size = size)) +
      geom_text() +
      scale_size_identity() +
      theme_void() +
      theme(legend.position = "none")
  })

  output$preview <- renderPlot(plot_obj())

  output$download_html <- downloadHandler(
    filename = "wordcloud_export.html",
    content = function(file) {
      svg_dev <- svglite::svgstring(
        width = 6,
        height = 4,
        standalone = FALSE
      )
      print(plot_obj())
      svg_string <- svg_dev()
      dev.off()

      mapping <- list(
        shiny = c(
          "The app is built with Shiny.",
          "Shiny apps can run serverless via Shinylive."
        ),
        webR = c("webR compiles R to WebAssembly."),
        wordcloud = c("The wordcloud shows term frequency."),
        ggiraph = c("ggiraph adds SVG interactivity to ggplot2 plots."),
        export = c("Users can export a standalone HTML file.")
      )
      mapping_json <- jsonlite::toJSON(mapping, auto_unbox = FALSE)

      html_head <- "<!doctype html><html><head>"
      html_head2 <- "<meta charset='utf-8'>"
      html_head3 <- "<title>Exported wordcloud</title></head><body>"
      html_h1 <- "<h1>Exported wordcloud (no R)</h1>"
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
