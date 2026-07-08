import * as d3 from "d3";
import cloud from "d3-cloud";

function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function createCloudRenderer({ container, note, onSelectWord }) {
  let lastLayout = null;
  let lastMapping = {};
  let lastFont = "sans-serif";
  let lastSize = [800, 500];
  let selectedWord = null;
  let currentRenderId = 0;

  function renderSvg(target, words, width, height, font, interactive) {
    target.replaceChildren();

    const svg = d3
      .select(target)
      .append("svg")
      .attr("xmlns", "http://www.w3.org/2000/svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", "100%");

    const group = svg
      .append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    const textSelection = group
      .selectAll("text")
      .data(words)
      .join("text")
      .attr("transform", (datum) => `translate(${datum.x},${datum.y}) rotate(${datum.rotate})`)
      .attr("text-anchor", "middle")
      .style("font-family", font)
      .style("font-size", (datum) => `${datum.size}px`)
      .style("fill", (datum) => datum.colour)
      .text((datum) => datum.text);

    if (interactive) {
      const setSelectedWord = (nextWord) => {
        selectedWord = nextWord;
        applyHighlight();
        onSelectWord(nextWord);
      };

      const applyHighlight = () => {
        textSelection
          .style("opacity", (datum) => (selectedWord === null || datum.text === selectedWord ? 1 : 0.35))
          .style("font-weight", (datum) => (datum.text === selectedWord ? "bold" : "normal"));
      };

      applyHighlight();

      svg.on("click", (event) => {
        if (event.target.closest("text")) {
          return;
        }
        setSelectedWord(null);
      });

      textSelection
        .style("cursor", "pointer")
        .on("mouseover", function handleMouseOver() {
          d3.select(this).style("opacity", 0.6);
        })
        .on("mouseout", applyHighlight)
        .on("click", function handleClick(event, datum) {
          event.stopPropagation();
          setSelectedWord(datum.text);
        });
    }

    return svg.node();
  }

  function currentSvgString() {
    if (!lastLayout) {
      return null;
    }

    const holder = document.createElement("div");
    renderSvg(holder, lastLayout, lastSize[0], lastSize[1], lastFont, false);
    const svg = holder.firstChild;
    svg.setAttribute("width", String(lastSize[0]));
    svg.setAttribute("height", String(lastSize[1]));
    return new XMLSerializer().serializeToString(svg);
  }

  function render(message) {
    currentRenderId += 1;
    const renderId = currentRenderId;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;
    lastSize = [width, height];
    lastMapping = message.mapping;
    lastFont = message.font;
    selectedWord = message.selectedWord === undefined ? selectedWord : message.selectedWord;

    if (!message.words.length) {
      lastLayout = null;
      container.replaceChildren();
      note.textContent = "";
      return;
    }

    const maxFrequency = Math.max(...message.freq);
    const minFrequency = Math.min(...message.freq);
    const wordCount = message.words.length;
    const maxSize = Math.min(90, (height / 5) * Math.sqrt(60 / Math.max(wordCount, 20)));
    const minSize = Math.max(10, maxSize / 6);
    const sizeScale =
      minFrequency === maxFrequency
        ? () => (minSize + maxSize) / 2
        : d3.scaleSqrt().domain([minFrequency, maxFrequency]).range([minSize, maxSize]);

    const rotationFlags = new Array(wordCount).fill(0);
    if (message.rotateProp > 0 && wordCount > 4) {
      const step = Math.round(1 / message.rotateProp);
      for (let index = 3; index < wordCount; index += 1) {
        if ((index - 3) % step === 0) {
          rotationFlags[index] = 90;
        }
      }
    }

    const entries = message.words.map((word, index) => ({
      text: word,
      size: sizeScale(message.freq[index]),
      colour: message.colours[index],
      rotate: rotationFlags[index],
    }));

    document.fonts.ready.then(() => {
      if (renderId !== currentRenderId) {
        return;
      }

      cloud()
        .size([width * 0.95, height * 0.95])
        .words(entries)
        .padding(message.padding)
        .spiral("archimedean")
        .font(message.font)
        .fontSize((datum) => datum.size)
        .rotate((datum) => datum.rotate)
        .random(mulberry32(42))
        .on("end", (placed) => {
          if (renderId !== currentRenderId) {
            return;
          }

          lastLayout = placed;
          if (selectedWord !== null && !placed.some((datum) => datum.text === selectedWord)) {
            selectedWord = null;
            onSelectWord(null);
          }
          renderSvg(container, placed, width, height, message.font, true);
          const dropped = entries.length - placed.length;
          note.textContent = dropped > 0 ? `${dropped} word(s) could not be placed and are not shown.` : "";
        })
        .start();
    });
  }

  function exportSvg() {
    const svgString = currentSvgString();
    if (!svgString) {
      return;
    }

    triggerDownload(new Blob([svgString], { type: "image/svg+xml" }), "wordcloud.svg");
  }

  function exportPng() {
    const svgString = currentSvgString();
    if (!svgString) {
      return;
    }

    const scale = 3;
    const image = new Image();
    const svgUrl = URL.createObjectURL(new Blob([svgString], { type: "image/svg+xml" }));

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = lastSize[0] * scale;
      canvas.height = lastSize[1] * scale;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.scale(scale, scale);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((blob) => {
        if (blob) {
          triggerDownload(blob, "wordcloud.png");
        }
      }, "image/png");
    };

    image.src = svgUrl;
  }

  function exportHtml() {
    if (!lastLayout) {
      return;
    }

    const svgString = currentSvgString();
    const exportStyles = `
      :root {
        color-scheme: light;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.5;
        color: #1f2933;
        background: #f5f7fa;
      }
      * { box-sizing: border-box; }
      body { margin: 0; background: #f5f7fa; }
      button { font: inherit; }
      .page-shell { max-width: 1200px; margin: 0 auto; padding: 1.5rem; }
      .content-card {
        background: #ffffff;
        border: 1px solid #d9e2ec;
        border-radius: 12px;
        padding: 1rem;
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
      }
      .cloud-surface {
        width: 100%;
        height: 500px;
        border-radius: 10px;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        overflow: hidden;
      }
      .cloud-surface svg { width: 100%; height: 100%; }
      .cloud-note {
        min-height: 1.25rem;
        margin-top: 0.5rem;
        color: #7b8794;
        font-size: 0.9rem;
      }
      .statements-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      .statements-header h2 {
        margin: 0;
        font-size: 1.1rem;
      }
      .statements-empty {
        margin-top: 1rem;
        color: #52606d;
      }
      .statements-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 1rem;
        display: none;
      }
      .statements-table th,
      .statements-table td {
        text-align: left;
        vertical-align: top;
        padding: 0.75rem;
        border-bottom: 1px solid #e4e7eb;
      }
      .statements-table tbody tr:nth-child(odd) { background: #f8fafc; }
      button {
        width: auto;
        padding: 0.6rem 0.75rem;
        border: 1px solid #bcccdc;
        border-radius: 8px;
        background: #f8fafc;
        cursor: pointer;
        white-space: nowrap;
      }
      button:disabled {
        cursor: not-allowed;
        opacity: 0.65;
      }
      button:hover:enabled { background: #eef2f7; }
      @media (max-width: 900px) {
        .page-shell { padding: 1rem; }
        .statements-header { flex-direction: column; align-items: flex-start; }
      }
    `;

    const clickScript = [
      `const mapping = ${JSON.stringify(lastMapping)};`,
      `let selectedWord = ${JSON.stringify(selectedWord)};`,
      "let statementSortAscending = true;",
      "const svg = document.querySelector('.cloud-surface svg');",
      "const words = Array.from(svg.querySelectorAll('text'));",
      "const statementRows = document.getElementById('statement_rows');",
      "const statementsEmpty = document.getElementById('statements_empty');",
      "const statementsTable = document.querySelector('.statements-table');",
      "const sortButton = document.getElementById('sort_statements');",
      "function applyHighlight() {",
      "  words.forEach(function (text) {",
      "    const isSelected = text.textContent.trim() === selectedWord;",
      "    text.style.opacity = selectedWord === null || isSelected ? '1' : '0.35';",
      "    text.style.fontWeight = isSelected ? 'bold' : 'normal';",
      "    text.style.cursor = 'pointer';",
      "  });",
      "}",
      "function renderStatements() {",
      "  const statements = selectedWord ? [...(mapping[selectedWord] || [])] : [];",
      "  sortButton.disabled = statements.length === 0;",
      "  sortButton.textContent = statementSortAscending ? 'Sort Z–A' : 'Sort A–Z';",
      "  if (!statements.length) {",
      "    statementsEmpty.textContent = selectedWord ? 'No statements found.' : 'Click a word above.';",
      "    statementsEmpty.style.display = 'block';",
      "    statementsTable.style.display = 'none';",
      "    statementRows.replaceChildren();",
      "    return;",
      "  }",
      "  statements.sort(function (left, right) {",
      "    const comparison = left.localeCompare(right);",
      "    return statementSortAscending ? comparison : -comparison;",
      "  });",
      "  const fragment = document.createDocumentFragment();",
      "  statements.forEach(function (statement) {",
      "    const row = document.createElement('tr');",
      "    const cell = document.createElement('td');",
      "    cell.textContent = statement;",
      "    row.appendChild(cell);",
      "    fragment.appendChild(row);",
      "  });",
      "  statementRows.replaceChildren(fragment);",
      "  statementsEmpty.style.display = 'none';",
      "  statementsTable.style.display = 'table';",
      "}",
      "words.forEach(function (text) {",
      "  text.addEventListener('mouseover', function () {",
      "    text.style.opacity = '0.6';",
      "  });",
      "  text.addEventListener('mouseout', applyHighlight);",
      "  text.addEventListener('click', function (event) {",
      "    event.stopPropagation();",
      "    selectedWord = text.textContent.trim();",
      "    applyHighlight();",
      "    renderStatements();",
      "  });",
      "});",
      "svg.addEventListener('click', function (event) {",
      "  if (event.target.closest('text')) {",
      "    return;",
      "  }",
      "  selectedWord = null;",
      "  applyHighlight();",
      "  renderStatements();",
      "});",
      "sortButton.addEventListener('click', function () {",
      "  statementSortAscending = !statementSortAscending;",
      "  renderStatements();",
      "});",
      "applyHighlight();",
      "renderStatements();",
    ].join("\n");

    const fontsHref =
      "https://fonts.googleapis.com/css2?family=Lora&family=Merriweather&family=Montserrat&family=Oswald&family=Source+Sans+3&display=swap";

    const html =
      "<!doctype html><html><head><meta charset='utf-8'>" +
      "<meta name='viewport' content='width=device-width, initial-scale=1.0'>" +
      `<link rel='stylesheet' href='${fontsHref}'>` +
      `<title>Wordcloud export</title><style>${exportStyles}</style></head><body>` +
      "<div class='page-shell'><section class='content-card'>" +
      "<h1>Wordcloud</h1>" +
      "<p>Click a word in the cloud to see its statements below.</p>" +
      `<div class='cloud-surface'>${svgString}</div>` +
      `<div class='cloud-note'>${note.textContent}</div>` +
      "<hr />" +
      "<div class='statements-header'>" +
      "<h2>Click a word in the cloud to see its statements</h2>" +
      "<button id='sort_statements' type='button' disabled>Sort A–Z</button>" +
      "</div>" +
      "<div id='statements_empty' class='statements-empty'>Click a word above.</div>" +
      "<table class='statements-table' aria-live='polite'><thead><tr><th scope='col'>Statement</th></tr></thead><tbody id='statement_rows'></tbody></table>" +
      "</section></div>" +
      `<script>${clickScript}<\/script>` +
      "</body></html>";

    triggerDownload(new Blob([html], { type: "text/html" }), "wordcloud_export.html");
  }

  return {
    render,
    exportSvg,
    exportPng,
    exportHtml,
  };
}
