import * as d3 from "d3";
import cloud from "d3-cloud";

const SIZE_EMPHASIS_RANGE = Object.freeze({ min: 0.5, max: 2 });
const MINIMUM_RENDER_SIZE = 8;
const MAX_LAYOUT_RETRIES = 8;
const LAYOUT_REDUCTION_FACTOR = 0.94;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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

function resolveLayoutOptions(shape, width, height) {
  const insetWidth = width * 0.95;
  const insetHeight = height * 0.95;
  const side = Math.min(insetWidth, insetHeight);

  if (shape === "circle") {
    return { size: [side, side], spiral: "archimedean" };
  }

  if (shape === "square") {
    return { size: [side, side], spiral: "rectangular" };
  }

  return { size: [insetWidth, insetHeight], spiral: "archimedean" };
}

function createSizeScale(frequencies, height, wordCount, emphasis) {
  const maxFrequency = Math.max(...frequencies);
  const minFrequency = Math.min(...frequencies);
  const maxSize = Math.min(90, (height / 5) * Math.sqrt(60 / Math.max(wordCount, 20)));
  const minSize = Math.max(10, maxSize / 6);

  if (minFrequency === maxFrequency) {
    return () => (minSize + maxSize) / 2;
  }

  const domainWidth = maxFrequency - minFrequency;
  // Keep the emphasis slider within its UI bounds so layout behaviour stays predictable.
  const scaleExponent = clamp(emphasis ?? 1, SIZE_EMPHASIS_RANGE.min, SIZE_EMPHASIS_RANGE.max);

  return (frequency) => {
    const ratio = (frequency - minFrequency) / domainWidth;
    return minSize + (maxSize - minSize) * ratio ** scaleExponent;
  };
}

function canShrinkFurther(entries, scaleFactor, minimumSize) {
  return entries.some((entry) => entry.baseSize * scaleFactor > minimumSize);
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
      const applyHighlight = () => {
        textSelection
          .style("opacity", (datum) => (selectedWord === null || datum.text === selectedWord ? 1 : 0.35))
          .style("font-weight", (datum) => (datum.text === selectedWord ? "bold" : "normal"));
      };

      applyHighlight();

      textSelection
        .style("cursor", "pointer")
        .on("mouseover", function handleMouseOver() {
          d3.select(this).style("opacity", 0.6);
        })
        .on("mouseout", applyHighlight)
        .on("click", function handleClick(_event, datum) {
          selectedWord = datum.text;
          applyHighlight();
          onSelectWord(datum.text);
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

    const wordCount = message.words.length;
    const sizeScale = createSizeScale(message.freq, height, wordCount, message.emphasis);

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
      baseSize: sizeScale(message.freq[index]),
      colour: message.colours[index],
      rotate: rotationFlags[index],
    }));

    document.fonts.ready.then(() => {
      if (renderId !== currentRenderId) {
        return;
      }

      const layoutOptions = resolveLayoutOptions(message.shape, width, height);

      const runLayout = (scaleFactor, attemptsRemaining) => {
        const layoutWords = entries.map((entry) => ({
          text: entry.text,
          size: Math.max(MINIMUM_RENDER_SIZE, entry.baseSize * scaleFactor),
          colour: entry.colour,
          rotate: entry.rotate,
        }));

        cloud()
          .size(layoutOptions.size)
          .words(layoutWords)
          .padding(message.padding)
          .spiral(layoutOptions.spiral)
          .font(message.font)
          .fontSize((datum) => datum.size)
          .rotate((datum) => datum.rotate)
          .random(mulberry32(42))
          .on("end", (placed) => {
            if (renderId !== currentRenderId) {
              return;
            }

            if (
              placed.length < layoutWords.length &&
              attemptsRemaining > 0 &&
              canShrinkFurther(entries, scaleFactor, MINIMUM_RENDER_SIZE)
            ) {
              runLayout(scaleFactor * LAYOUT_REDUCTION_FACTOR, attemptsRemaining - 1);
              return;
            }

            lastLayout = placed;
            if (selectedWord !== null && !placed.some((datum) => datum.text === selectedWord)) {
              selectedWord = null;
              onSelectWord(null);
            }
            renderSvg(container, placed, width, height, message.font, true);
            const dropped = layoutWords.length - placed.length;
            note.textContent = dropped > 0 ? `${dropped} word(s) could not be placed and are not shown.` : "";
          })
          .start();
      };

      runLayout(1, MAX_LAYOUT_RETRIES);
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

    const holder = document.createElement("div");
    renderSvg(holder, lastLayout, lastSize[0], lastSize[1], lastFont, false);
    const svgString = new XMLSerializer().serializeToString(holder.firstChild);

    const clickScript = [
      `const mapping = ${JSON.stringify(lastMapping)};`,
      "const svg = document.querySelector('svg');",
      "svg.style.cursor = 'pointer';",
      "svg.addEventListener('click', function (event) {",
      "  const text = event.target.closest('text');",
      "  if (!text) return;",
      "  const word = text.textContent.trim();",
      "  const rows = mapping[word];",
      "  const root = document.getElementById('statements');",
      "  root.replaceChildren();",
      "  const heading = document.createElement('h2');",
      "  heading.textContent = word;",
      "  root.appendChild(heading);",
      "  if (!rows || rows.length === 0) {",
      "    const empty = document.createElement('p');",
      "    empty.textContent = 'No statements found.';",
      "    root.appendChild(empty);",
      "    return;",
      "  }",
      "  const list = document.createElement('ul');",
      "  rows.forEach(function (statement) {",
      "    const item = document.createElement('li');",
      "    item.textContent = statement;",
      "    list.appendChild(item);",
      "  });",
      "  root.appendChild(list);",
      "});",
    ].join("\n");

    const fontsHref =
      "https://fonts.googleapis.com/css2?family=Lora&family=Merriweather&family=Montserrat&family=Oswald&family=Source+Sans+3&display=swap";

    const html =
      "<!doctype html><html><head><meta charset='utf-8'>" +
      `<link rel='stylesheet' href='${fontsHref}'>` +
      "<title>Wordcloud export</title></head><body>" +
      "<h1>Wordcloud (standalone export, no R)</h1>" +
      "<p>Click a word in the cloud to see its statements below.</p>" +
      `<div style='max-width: 900px;'>${svgString}</div>` +
      "<div id='statements'><p>Click a word above.</p></div>" +
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
