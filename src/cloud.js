import * as d3 from "d3";
import cloud from "d3-cloud";

const LAYOUT_SCALE_FACTOR = 0.95;
const PRIMARY_LAYOUT_SEED = 42;
const SECOND_PASS_LAYOUT_SEED = 4242;
const FIT_ATTEMPT_SCALE_FACTORS = [0.92, 0.85, 0.78, 0.72, 0.66];
const MIN_FONT_SIZE = 4;
const REDUCED_SIZE_NOTE = "Word sizes were reduced slightly to keep longer terms visible in the selected shape.";

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

function circleRadius(width, height) {
  return Math.min(width, height) / 2;
}

export function createCloudRenderer({ container, note, onSelectWord }) {
  let lastLayout = null;
  let lastFont = "sans-serif";
  let lastShape = "oval";
  let lastSize = [800, 500];
  let selectedWord = null;
  let currentRenderId = 0;
  let clipPathId = 0;

  function createShapeMask(shape, size) {
    const [width, height] = size;
    const centreX = width / 2;
    const centreY = height / 2;
    const radiusX = width / 2;
    const radiusY = height / 2;
    const squareHalf = Math.min(width, height) / 2;

    switch (shape) {
      case "circle": {
        const radius = circleRadius(width, height);
        return (x, y) => {
          const dx = x - centreX;
          const dy = y - centreY;
          return dx * dx + dy * dy <= radius * radius;
        };
      }
      case "square":
        return (x, y) => Math.abs(x - centreX) <= squareHalf && Math.abs(y - centreY) <= squareHalf;
      case "oval":
      default:
        return (x, y) => {
          const dx = (x - centreX) / radiusX;
          const dy = (y - centreY) / radiusY;
          return dx * dx + dy * dy <= 1;
        };
    }
  }

  function getLayoutConfig(shape, width, height) {
    const safeWidth = Math.max(1, Math.floor(width * LAYOUT_SCALE_FACTOR));
    const safeHeight = Math.max(1, Math.floor(height * LAYOUT_SCALE_FACTOR));
    const squareSize = Math.max(1, Math.floor(Math.min(width, height) * LAYOUT_SCALE_FACTOR));
    let config;

    switch (shape) {
      case "circle":
        config = { spiral: "archimedean", size: [squareSize, squareSize] };
        break;
      case "square":
        config = { spiral: "rectangular", size: [squareSize, squareSize] };
        break;
      case "oval":
      default:
        config = { spiral: "archimedean", size: [safeWidth, safeHeight] };
        break;
    }

    return { ...config, mask: createShapeMask(shape, config.size) };
  }

  function wordPoints(word, size) {
    const [width, height] = size;
    const offsetX = width / 2;
    const offsetY = height / 2;
    const left = word.x + word.x0;
    const right = word.x + word.x1;
    const top = word.y + word.y0;
    const bottom = word.y + word.y1;

    return [
      [word.x + offsetX, word.y + offsetY],
      [left + offsetX, top + offsetY],
      [left + offsetX, bottom + offsetY],
      [right + offsetX, top + offsetY],
      [right + offsetX, bottom + offsetY],
    ];
  }

  function isWordInsideMask(word, mask, size) {
    return wordPoints(word, size).every(([x, y]) => mask(x, y));
  }

  function pickBestLayout(attempts, layout) {
    return attempts.reduce(
      (best, placed) => {
        const filtered = placed.filter((word) => isWordInsideMask(word, layout.mask, layout.size));
        if (
          filtered.length > best.filtered.length ||
          (filtered.length === best.filtered.length && placed.length > best.placed.length)
        ) {
          return { placed, filtered };
        }
        return best;
      },
      { placed: [], filtered: [] }
    );
  }

  function appendClipPath(svg, shape, width, height) {
    clipPathId += 1;
    const clipId = `wordcloud-clip-${clipPathId}`;
    const layout = getLayoutConfig(shape, width, height);
    const [layoutWidth, layoutHeight] = layout.size;
    const offsetX = (width - layoutWidth) / 2;
    const offsetY = (height - layoutHeight) / 2;
    const clipPath = svg.append("defs").append("clipPath").attr("id", clipId).attr("clipPathUnits", "userSpaceOnUse");

    switch (shape) {
      case "circle":
        clipPath
          .append("circle")
          .attr("cx", width / 2)
          .attr("cy", height / 2)
          .attr("r", circleRadius(layoutWidth, layoutHeight));
        break;
      case "square":
        clipPath
          .append("rect")
          .attr("x", offsetX)
          .attr("y", offsetY)
          .attr("width", layoutWidth)
          .attr("height", layoutHeight);
        break;
      case "oval":
      default:
        clipPath
          .append("ellipse")
          .attr("cx", width / 2)
          .attr("cy", height / 2)
          .attr("rx", layoutWidth / 2)
          .attr("ry", layoutHeight / 2);
        break;
    }

    return clipId;
  }

  function renderSvg(target, words, width, height, font, shape, interactive, selectedWordOverride = selectedWord) {
    target.replaceChildren();

    const svg = d3
      .select(target)
      .append("svg")
      .attr("xmlns", "http://www.w3.org/2000/svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", "100%");

    const clipId = appendClipPath(svg, shape, width, height);
    const group = svg
      .append("g")
      .attr("clip-path", `url(#${clipId})`)
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
      const activeWord = interactive ? selectedWord : selectedWordOverride;
      textSelection
        .style("opacity", (datum) => (activeWord === null || datum.text === activeWord ? 1 : 0.35))
        .style("font-weight", (datum) => (datum.text === activeWord ? "bold" : "normal"));
    };

    applyHighlight();

    if (interactive) {
      const setSelectedWord = (nextWord) => {
        selectedWord = nextWord;
        applyHighlight();
        onSelectWord(nextWord);
      };

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

  function currentSvgString(selectedWordOverride = selectedWord) {
    if (!lastLayout) {
      return null;
    }

    const holder = document.createElement("div");
    renderSvg(holder, lastLayout, lastSize[0], lastSize[1], lastFont, lastShape, false, selectedWordOverride);
    const svg = holder.firstChild;
    svg.setAttribute("width", String(lastSize[0]));
    svg.setAttribute("height", String(lastSize[1]));
    return new XMLSerializer().serializeToString(svg);
  }

  function runLayoutAttempt(entries, layout, message, seed) {
    return new Promise((resolve) => {
      cloud()
        .size(layout.size)
        .words(entries.map((entry) => ({ ...entry })))
        .padding(message.padding)
        .spiral(layout.spiral)
        .font(message.font)
        .fontSize((datum) => datum.size)
        .rotate((datum) => datum.rotate)
        .random(mulberry32(seed))
        .on("end", resolve)
        .start();
    });
  }

  async function findBestFittedLayout(entries, layout, message) {
    const evaluateScale = async (scale) => {
      const scaledEntries = entries.map((entry) => ({
        ...entry,
        size: Math.max(MIN_FONT_SIZE, entry.size * scale),
      }));
      const attempts = await Promise.all([
        runLayoutAttempt(scaledEntries, layout, message, PRIMARY_LAYOUT_SEED),
        runLayoutAttempt(scaledEntries, layout, message, SECOND_PASS_LAYOUT_SEED),
      ]);
      const best = pickBestLayout(attempts, layout);
      return { ...best, scale };
    };

    let best = await evaluateScale(1);
    if (best.filtered.length === entries.length) {
      return best;
    }

    for (const scale of FIT_ATTEMPT_SCALE_FACTORS) {
      const candidate = await evaluateScale(scale);
      if (
        candidate.filtered.length > best.filtered.length ||
        (candidate.filtered.length === best.filtered.length && candidate.scale > best.scale)
      ) {
        best = candidate;
      }
      if (candidate.filtered.length === entries.length) {
        return candidate;
      }
    }

    return best;
  }

  function render(message) {
    currentRenderId += 1;
    const renderId = currentRenderId;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;
    lastSize = [width, height];
    lastFont = message.font;
    lastShape = message.shape ?? lastShape;
    if (message.selectedWord !== undefined) {
      selectedWord = message.selectedWord;
    }

    if (!message.words.length) {
      lastLayout = null;
      container.replaceChildren();
      note.textContent = "";
      return;
    }

    const layout = getLayoutConfig(lastShape, width, height);
    const maxFrequency = Math.max(...message.freq);
    const minFrequency = Math.min(...message.freq);
    const wordCount = message.words.length;
    const maxSize = Math.min(90, (height / 5) * Math.sqrt(60 / Math.max(wordCount, 20)));
    const minSize = Math.max(10, maxSize / 6);
    const sizePower = Math.max(0.25, message.sizeEmphasis ?? 1) / 2;
    const sizeScale =
      minFrequency === maxFrequency
        ? () => (minSize + maxSize) / 2
        : (value) => {
            const ratio = (value - minFrequency) / (maxFrequency - minFrequency);
            return minSize + (maxSize - minSize) * Math.pow(ratio, sizePower);
          };

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

      findBestFittedLayout(entries, layout, message).then(({ filtered, scale }) => {
        if (renderId !== currentRenderId) {
          return;
        }

        lastLayout = filtered;
        if (selectedWord !== null && !filtered.some((datum) => datum.text === selectedWord)) {
          selectedWord = null;
          onSelectWord(null);
        }
        renderSvg(container, filtered, width, height, message.font, lastShape, true);
        const dropped = entries.length - filtered.length;
        const scaleMessage = scale < 1 ? `${REDUCED_SIZE_NOTE} ` : "";
        note.textContent = dropped > 0
          ? `${scaleMessage}${dropped} word(s) could not be placed in the final masked layout and are not shown.`
          : scaleMessage.trim();
      });
    });
  }

  function getSvgString(selectedWordOverride = selectedWord) {
    return currentSvgString(selectedWordOverride);
  }

  function exportSvg() {
    const svgString = getSvgString(null);
    if (!svgString) {
      return;
    }

    triggerDownload(new Blob([svgString], { type: "image/svg+xml" }), "wordcloud.svg");
  }

  function exportPng() {
    const svgString = getSvgString(null);
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
