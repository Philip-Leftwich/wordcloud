import * as d3 from "d3";
import cloud from "d3-cloud";

const LAYOUT_SCALE_FACTOR = 0.95;
const PRIMARY_LAYOUT_SEED = 42;
const SECOND_PASS_LAYOUT_SEED = 4242;
const MAX_MANDATORY_WORDS = 5;
const LAYOUT_RETRY_MULTIPLIERS = [1, 0.94, 0.88, 0.82, 0.76];

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

  function compareLayoutSummaries(left, right) {
    if (left.missingMandatoryCount !== right.missingMandatoryCount) {
      return left.missingMandatoryCount < right.missingMandatoryCount ? left : right;
    }
    if (left.mandatoryScore !== right.mandatoryScore) {
      return left.mandatoryScore > right.mandatoryScore ? left : right;
    }
    if (left.totalScore !== right.totalScore) {
      return left.totalScore > right.totalScore ? left : right;
    }
    if (left.filtered.length !== right.filtered.length) {
      return left.filtered.length > right.filtered.length ? left : right;
    }
    if (left.placed.length !== right.placed.length) {
      return left.placed.length > right.placed.length ? left : right;
    }
    return left;
  }

  function summariseLayout(placed, layout, mandatoryWords) {
    const filtered = placed.filter((word) => isWordInsideMask(word, layout.mask, layout.size));
    const visibleWords = new Set(filtered.map((word) => word.text));
    const mandatoryScore = mandatoryWords.reduce((score, word, index) => (
      visibleWords.has(word) ? score + (mandatoryWords.length - index) : score
    ), 0);
    const totalScore = filtered.reduce((score, word) => score + word.priorityScore, 0);
    const missingMandatoryCount = mandatoryWords.filter((word) => !visibleWords.has(word)).length;
    return { placed, filtered, visibleWords, mandatoryScore, totalScore, missingMandatoryCount };
  }

  function pickBestLayout(attempts, layout, mandatoryWords) {
    return attempts.reduce(
      (best, placed) => compareLayoutSummaries(best, summariseLayout(placed, layout, mandatoryWords)),
      {
        placed: [],
        filtered: [],
        visibleWords: new Set(),
        mandatoryScore: -1,
        totalScore: -1,
        missingMandatoryCount: Number.POSITIVE_INFINITY,
      }
    );
  }

  function layoutRetryPadding(basePadding, retryIndex) {
    return Math.max(0, basePadding - Math.min(retryIndex, 2));
  }

  function tuneEntries(entries, retryIndex) {
    const sizeMultiplier = LAYOUT_RETRY_MULTIPLIERS[retryIndex] ?? 1;
    return entries.map((entry) => ({
      ...entry,
      size: Math.max(8, entry.baseSize * sizeMultiplier),
      rotate: entry.lockRotation ? 0 : entry.rotate,
    }));
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

  function runLayoutAttempt(entries, layout, { font, padding }, seed) {
    return new Promise((resolve) => {
      cloud()
        .size(layout.size)
        .words(entries.map((entry) => ({ ...entry })))
        .padding(padding)
        .spiral(layout.spiral)
        .font(font)
        .fontSize((datum) => datum.size)
        .rotate((datum) => datum.rotate)
        .random(mulberry32(seed))
        .on("end", resolve)
        .start();
    });
  }

  async function resolveLayout(entries, layout, message, mandatoryWords) {
    let best = null;

    for (let retryIndex = 0; retryIndex < LAYOUT_RETRY_MULTIPLIERS.length; retryIndex += 1) {
      const tunedEntries = tuneEntries(entries, retryIndex);
      const padding = layoutRetryPadding(message.padding, retryIndex);
      const seedOffset = retryIndex * 100;
      const attempts = await Promise.all([
        runLayoutAttempt(tunedEntries, layout, { font: message.font, padding }, PRIMARY_LAYOUT_SEED + seedOffset),
        runLayoutAttempt(tunedEntries, layout, { font: message.font, padding }, SECOND_PASS_LAYOUT_SEED + seedOffset),
      ]);
      const candidate = pickBestLayout(attempts, layout, mandatoryWords);
      best = best === null ? candidate : compareLayoutSummaries(best, candidate);
      if (candidate.missingMandatoryCount === 0) {
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
    const sizeScale =
      minFrequency === maxFrequency
        ? () => (minSize + maxSize) / 2
        : d3.scaleSqrt().domain([minFrequency, maxFrequency]).range([minSize, maxSize]);

    const mandatoryCount = Math.min(wordCount, MAX_MANDATORY_WORDS);
    const rotationFlags = new Array(wordCount).fill(0);
    if (message.rotateProp > 0 && wordCount > 4) {
      const step = Math.round(1 / message.rotateProp);
      for (let index = mandatoryCount; index < wordCount; index += 1) {
        if ((index - mandatoryCount) % step === 0) {
          rotationFlags[index] = 90;
        }
      }
    }

    const entries = message.words.map((word, index) => ({
      text: word,
      baseSize: sizeScale(message.freq[index]),
      size: sizeScale(message.freq[index]),
      colour: message.colours[index],
      rotate: rotationFlags[index],
      lockRotation: index < mandatoryCount,
      priorityScore: wordCount - index,
    }));
    const mandatoryWords = entries.slice(0, mandatoryCount).map((entry) => entry.text);

    document.fonts.ready.then(() => {
      if (renderId !== currentRenderId) {
        return;
      }

      resolveLayout(entries, layout, message, mandatoryWords).then((bestLayout) => {
        if (renderId !== currentRenderId) {
          return;
        }

        const { filtered, visibleWords } = bestLayout;
        lastLayout = filtered;
        if (selectedWord !== null && !filtered.some((datum) => datum.text === selectedWord)) {
          selectedWord = null;
          onSelectWord(null);
        }
        renderSvg(container, filtered, width, height, message.font, lastShape, true);
        const dropped = entries.slice(mandatoryCount).filter((entry) => !visibleWords.has(entry.text)).length;
        note.textContent = dropped > 0
          ? `${dropped} lower-priority word(s) could not be placed in the final masked layout and are not shown.`
          : "";
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
