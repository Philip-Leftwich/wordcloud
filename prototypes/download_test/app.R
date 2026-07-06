library(shiny)

downloadButton <- function(...) {
  tag <- shiny::downloadButton(...)
  tag$attribs$download <- NULL
  tag
}

ui <- fluidPage(
  downloadButton("download_test", "Download test file")
)

server <- function(input, output, session) {
  output$download_test <- downloadHandler(
    filename = "test.txt",
    content = function(file) {
      writeLines("hello from webR", file)
    }
  )
}

shinyApp(ui, server)
