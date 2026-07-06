// Renderer for the d3-cloud wordcloud, plus client-side exports
// (interactive HTML, SVG, PNG). State held at module level so the
// exports can serialise the current view.
(function () {
  "use strict";

  let lastLayout = null;   // words with computed x/y/rotate/size/colour
  let lastMapping = null;  // word -> array of statements
  let lastFont = "sans-serif";
  let lastSize = [800, 500];
  let selectedWord = null; // word currently highlighted, or null

  // Seeded PRNG (mulberry32) so re-renders with identical inputs give
  // identical layouts. d3-cloud uses Math.random unless overridden.
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function drawCloud(msg) {
    const container = document.getElementById("cloud_container");
    const note = document.getElementById("cloud_note");
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;
    lastSize = [width, height];
    lastMapping = msg.mapping;
    lastFont = msg.font;

    // Frequencies -> font sizes. Size ceiling responds to word count:
    // fewer words are allowed larger type. Ratio of roughly 6:1 between
    // largest and smallest.
    const fmax = Math.max(...msg.freq);
    const fmin = Math.min(...msg.freq);
    const n = msg.words.length;
    const maxSize = Math.min(90, (height / 5) * Math.sqrt(60 / Math.max(n, 20)));
    const minSize = Math.max(10, maxSize / 6);
    const sizeScale = d3.scaleSqrt()
      .domain([fmin, fmax])
      .range([minSize, maxSize]);

    // Deterministic rotation assignment: every kth eligible word,
    // top three exempt.
    const rotFlags = new Array(n).fill(0);
    if (msg.rotate_prop > 0 && n > 4) {
      const k = Math.round(1 / msg.rotate_prop);
      for (let i = 3; i < n; i++) {
        if ((i - 3) % k === 0) rotFlags[i] = 90;
      }
    }

    const entries = msg.words.map((w, i) => ({
      text: w,
      size: sizeScale(msg.freq[i]),
      colour: msg.colours[i],
      rotate: rotFlags[i]
    }));

    d3.layout.cloud()
      .size([width * 0.95, height * 0.95])
      .words(entries)
      .padding(msg.padding)
      .spiral("archimedean")
      .font(msg.font)
      .fontSize(d => d.size)
      .rotate(d => d.rotate)
      .random(mulberry32(42))
      .on("end", placed => {
        lastLayout = placed;
        // Clear a stale selection if the selected word is no longer
        // present (new file, changed max_words, changed column).
        if (selectedWord !== null &&
            !placed.some(d => d.text === selectedWord)) {
          selectedWord = null;
        }
        renderSvg(container, placed, width, height, msg.font, true);
        const dropped = entries.length - placed.length;
        note.textContent = dropped > 0
          ? dropped + " word(s) could not be placed and are not shown."
          : "";
      })
      .start();
  }

  function renderSvg(target, words, width, height, font, interactive) {
    target.replaceChildren();
    const svg = d3.select(target)
      .append("svg")
      .attr("xmlns", "http://www.w3.org/2000/svg")
      .attr("viewBox", "0 0 " + width + " " + height)
      .attr("width", "100%")
      .attr("height", "100%");

    const g = svg.append("g")
      .attr("transform",
            "translate(" + width / 2 + "," + height / 2 + ")");

    const sel = g.selectAll("text")
      .data(words)
      .join("text")
      .attr("transform", d =>
        "translate(" + d.x + "," + d.y + ") rotate(" + d.rotate + ")")
      .attr("text-anchor", "middle")
      .style("font-family", font)
      .style("font-size", d => d.size + "px")
      .style("fill", d => d.colour)
      .text(d => d.text);

    if (interactive) {
      const applyHighlight = function () {
        sel
          .style("opacity", d =>
            selectedWord === null || d.text === selectedWord ? 1 : 0.35)
          .style("font-weight", d =>
            d.text === selectedWord ? "bold" : "normal");
      };
      applyHighlight();

      sel.style("cursor", "pointer")
        .on("mouseover", function () { d3.select(this).style("opacity", 0.6); })
        .on("mouseout",  applyHighlight)
        .on("click", function (event, d) {
          selectedWord = d.text;
          applyHighlight();
          Shiny.setInputValue("cloud_selected", d.text,
                              { priority: "event" });
        });
    }
    return svg.node();
  }

  Shiny.addCustomMessageHandler("render_cloud", function (msg) {
    // Measure only after the web fonts are available: d3-cloud measures
    // on a hidden canvas, and premature measurement uses fallback metrics.
    document.fonts.ready.then(() => drawCloud(msg));
  });

  // ---- Exports ------------------------------------------------------
  // Downloads use a same-origin Blob anchor with the download attribute;
  // if Chromium bug 468227 resurfaces in the Shinylive iframe, revert
  // cloudExport's trigger to an anchor with target='_blank' and no
  // download attribute.

  function currentSvgString() {
    if (!lastLayout) return null;
    const holder = document.createElement("div");
    renderSvg(holder, lastLayout, lastSize[0], lastSize[1], lastFont, false);
    const svg = holder.firstChild;
    svg.setAttribute("width", lastSize[0]);
    svg.setAttribute("height", lastSize[1]);
    return new XMLSerializer().serializeToString(svg);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  window.cloudExportSvg = function () {
    const s = currentSvgString();
    if (!s) return;
    triggerDownload(
      new Blob([s], { type: "image/svg+xml" }),
      "wordcloud.svg"
    );
  };

  window.cloudExportPng = function () {
    const s = currentSvgString();
    if (!s) return;
    const scale = 3;  // ~3x for print-adequate resolution
    const img = new Image();
    const svgUrl = URL.createObjectURL(
      new Blob([s], { type: "image/svg+xml" })
    );
    img.onload = function () {
      const canvas = document.createElement("canvas");
      canvas.width = lastSize[0] * scale;
      canvas.height = lastSize[1] * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob(function (blob) {
        triggerDownload(blob, "wordcloud.png");
      }, "image/png");
    };
    img.src = svgUrl;
  };

  window.cloudExport = function () {
    if (!lastLayout) return;

    const holder = document.createElement("div");
    renderSvg(holder, lastLayout, lastSize[0], lastSize[1],
              lastFont, false);
    const svgString = new XMLSerializer()
      .serializeToString(holder.firstChild);

    const clickJs = [
      "const mapping = " + JSON.stringify(lastMapping) + ";",
      "const svg = document.querySelector('svg');",
      "svg.style.cursor = 'pointer';",
      "svg.addEventListener('click', function (e) {",
      "  const t = e.target.closest('text');",
      "  if (!t) return;",
      "  const word = t.textContent.trim();",
      "  const div = document.getElementById('statements');",
      "  div.replaceChildren();",
      "  const h2 = document.createElement('h2');",
      "  h2.textContent = word;",
      "  div.appendChild(h2);",
      "  const rows = mapping[word];",
      "  if (!rows) {",
      "    const p = document.createElement('p');",
      "    p.textContent = 'No statements found.';",
      "    div.appendChild(p);",
      "    return;",
      "  }",
      "  const ul = document.createElement('ul');",
      "  rows.forEach(function (s) {",
      "    const li = document.createElement('li');",
      "    li.textContent = s;",
      "    ul.appendChild(li);",
      "  });",
      "  div.appendChild(ul);",
      "});"
    ].join("\n");

    const fontsHref = "https://fonts.googleapis.com/css2?" +
      "family=Lora&family=Merriweather&family=Montserrat&" +
      "family=Oswald&family=Source+Sans+3&display=swap";

    const html = "<!doctype html><html><head><meta charset='utf-8'>" +
      "<link rel='stylesheet' href='" + fontsHref + "'>" +
      "<title>Wordcloud export</title></head><body>" +
      "<h1>Wordcloud (standalone export, no R)</h1>" +
      "<p>Click a word in the cloud to see its statements below.</p>" +
      "<div style='max-width: 900px;'>" + svgString + "</div>" +
      "<div id='statements'><p>Click a word above.</p></div>" +
      "<script>" + clickJs + "<\/script>" +
      "</body></html>";

    triggerDownload(
      new Blob([html], { type: "text/html" }),
      "wordcloud_export.html"
    );
  };
})();