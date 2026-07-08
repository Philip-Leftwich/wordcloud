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

  function getLayoutConfig(shape, width, height) {
    const safeWidth = Math.max(1, Math.floor(width * 0.95));
    const safeHeight = Math.max(1, Math.floor(height * 0.95));
    const squareSize = Math.max(1, Math.floor(Math.min(width, height) * 0.95));

    switch (shape) {
      case "circle":
        return { spiral: "archimedean", size: [squareSize, squareSize] };
      case "square":
        return { spiral: "rectangular", size: [squareSize, squareSize] };
      case "oval":
      default:
        return { spiral: "archimedean", size: [safeWidth, safeHeight] };
    }
  }

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
      .attr("data-word", (datum) => datum.text)
      .attr("transform", (datum) => `translate(${datum.x},${datum.y}) rotate(${datum.rotate})`)
      .attr("text-anchor", "middle")
      .style("font-family", font)
      .style("font-size", (datum) => `${datum.size}px`)
      .style("fill", (datum) => datum.colour)
      .text((datum) => datum.text);

    const applyHighlight = () => {
      textSelection
        .style("opacity", (datum) => (selectedWord === null || datum.text === selectedWord ? 1 : 0.35))
        .style("font-weight", (datum) => (datum.text === selectedWord ? "bold" : "normal"));
    };

    applyHighlight();

    if (interactive) {
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
    selectedWord = message.selectedWord ?? null;

    if (!message.words.length) {
      lastLayout = null;
      container.replaceChildren();
      note.textContent = "";
      return;
    }

    const layout = getLayoutConfig(message.shape, width, height);
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
        .size(layout.size)
        .words(entries)
        .padding(message.padding)
        .spiral(layout.spiral)
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

  function getSvgString() {
    return currentSvgString();
  }

  function exportSvg() {
    const svgString = getSvgString();
    if (!svgString) {
      return;
    }

    triggerDownload(new Blob([svgString], { type: "image/svg+xml" }), "wordcloud.svg");
  }

  function exportPng() {
    const svgString = getSvgString();
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

  return {
    render,
    getSvgString,
    exportSvg,
    exportPng,
  };
}
