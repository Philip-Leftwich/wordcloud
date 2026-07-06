# Human-run only — exports the Shinylive site and serves it locally so the
# Step 1 gate (ggwordcloud rendering under webR) can be checked in a browser.
# webR requires the app be served over http(s); opening site/index.html via
# file:// will not work.
#
# Prerequisite (run once, ordinary local R, not webR):
#   install.packages("shinylive")

shinylive::export("app", "site")
httpuv::runStaticServer("site")
