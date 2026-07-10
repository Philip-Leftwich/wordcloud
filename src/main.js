import * as d3 from "d3";
import readXlsxFile from "read-excel-file";
import stopwords from "stopwords-iso/stopwords-iso.json";
import "./styles.css";
import appStylesText from "./styles.css?raw";
import { createCloudRenderer } from "./cloud.js";

const FONT_CHOICES = [
  { label: "Default sans", value: "sans-serif" },
  { label: "Lora (serif)", value: "Lora" },
  { label: "Merriweather (serif)", value: "Merriweather" },
  { label: "Montserrat", value: "Montserrat" },
  { label: "Oswald (condensed)", value: "Oswald" },
  { label: "Source Sans 3", value: "Source Sans 3" },
];

const PALETTE_CHOICES = ["Viridis", "Magma", "Blues", "Warm", "Steel"];
const SHAPE_CHOICES = [
  { label: "Oval", value: "oval" },
  { label: "Circle", value: "circle" },
  { label: "Square", value: "square" },
];
const STOP_WORDS = new Set(stopwords.en.map((word) => String(word).toLowerCase()));

const state = {
  records: [],
  columns: [],
  selectedColumn: "",
  maxWords: 100,
  sizeEmphasis: 1,
  fontFamily: "sans-serif",
  palette: "Viridis",
  colourEmphasis: 1,
  shape: "oval",
  padding: 1,
  rotateProp: 0,
  uploadError: "",
  selectedWord: null,
  statementSortAscending: true,
  statementMap: new Map(),
  termFrequency: [],
};

const elements = {
  fileInput: document.getElementById("data_file"),
  columnSelect: document.getElementById("statement_column"),
  maxWordsInput: document.getElementById("max_words"),
  sizeEmphasisInput: document.getElementById("size_emphasis"),
  sizeEmphasisValue: document.getElementById("size_emphasis_value"),
  fontSelect: document.getElementById("font_family"),
  paletteSelect: document.getElementById("palette"),
  colourEmphasisInput: document.getElementById("colour_emphasis"),
  colourEmphasisValue: document.getElementById("colour_emphasis_value"),
  shapeSelect: document.getElementById("shape"),
  paddingInput: document.getElementById("padding"),
  paddingValue: document.getElementById("padding_value"),
  rotateInput: document.getElementById("rotate_prop"),
  rotateValue: document.getElementById("rotate_prop_value"),
  uploadMessage: document.getElementById("upload_message"),
  cloudContainer: document.getElementById("cloud_container"),
  cloudNote: document.getElementById("cloud_note"),
  statementRows: document.getElementById("statement_rows"),
  statementsEmpty: document.getElementById("statements_empty"),
  statementsTable: document.querySelector(".statements-table"),
  sortStatementsButton: document.getElementById("sort_statements"),
  downloadHtmlButton: document.getElementById("download_html"),
  downloadSvgButton: document.getElementById("download_svg"),
  downloadPngButton: document.getElementById("download_png"),
};

const renderer = createCloudRenderer({
  container: elements.cloudContainer,
  note: elements.cloudNote,
  onSelectWord(word) {
    state.selectedWord = word;
    renderStatements();
  },
});

function formatSliderValue(value) {
  return Number(value).toString();
}

function populateStaticOptions() {
  elements.fontSelect.innerHTML = FONT_CHOICES.map(
    (choice) => `<option value="${choice.value}">${choice.label}</option>`
  ).join("");
  elements.paletteSelect.innerHTML = PALETTE_CHOICES.map(
    (choice) => `<option value="${choice}">${choice}</option>`
  ).join("");
  elements.shapeSelect.innerHTML = SHAPE_CHOICES.map(
    (choice) => `<option value="${choice.value}">${choice.label}</option>`
  ).join("");

  elements.fontSelect.value = state.fontFamily;
  elements.paletteSelect.value = state.palette;
  elements.shapeSelect.value = state.shape;
  elements.sizeEmphasisValue.value = formatSliderValue(state.sizeEmphasis);
  elements.colourEmphasisValue.value = formatSliderValue(state.colourEmphasis);
  elements.paddingValue.value = String(state.padding);
  elements.rotateValue.value = String(state.rotateProp);
}

function dedupeHeaders(headers) {
  const counts = new Map();
  return headers.map((header, index) => {
    const base = String(header ?? "").trim() || `Column ${index + 1}`;
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    return seen === 0 ? base : `${base} (${seen + 1})`;
  });
}

function normaliseValue(value) {
  if (value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return value;
}

function buildRecordsFromRows(rows) {
  if (!rows.length) {
    return { records: [], columns: [] };
  }

  const [headerRow, ...dataRows] = rows;
  const columns = dedupeHeaders(headerRow);
  const records = dataRows.map((row, rowIndex) => {
    const record = { statement_id: rowIndex + 1 };
    columns.forEach((column, columnIndex) => {
      record[column] = normaliseValue(row[columnIndex]);
    });
    return record;
  });

  return { records, columns };
}

function parseCsv(text) {
  const records = d3.csvParse(text.replace(/^\uFEFF/, ""), d3.autoType);
  const columns = dedupeHeaders(records.columns || []);
  const parsedRecords = records.map((record, rowIndex) => {
    const nextRecord = { statement_id: rowIndex + 1 };
    (records.columns || []).forEach((originalColumn, columnIndex) => {
      nextRecord[columns[columnIndex]] = normaliseValue(record[originalColumn]);
    });
    return nextRecord;
  });
  return { records: parsedRecords, columns };
}

async function parseFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv") {
    return parseCsv(await file.text());
  }
  if (extension === "xlsx") {
    return buildRecordsFromRows(await readXlsxFile(file));
  }
  throw new Error(`Unsupported file type: .${extension ?? ""}`);
}

function isTextColumn(records, column) {
  const values = records
    .map((record) => record[column])
    .filter((value) => value !== null && value !== undefined && value !== "");
  if (!values.length) {
    return true;
  }
  return values.every((value) => typeof value === "string");
}

function paletteColours(name, values, emphasis = 1) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const interpolator = {
    Viridis: d3.interpolateViridis,
    Magma: d3.interpolateMagma,
    Blues: d3.interpolateRgb("#9ecae1", "#08306b"),
    Warm: d3.interpolateRgb("#fdae61", "#a50026"),
    Steel: d3.interpolateRgb("#a8b8c8", "#1f4e79"),
  }[name];

  if (min === max) {
    return values.map(() => interpolator(0.5));
  }

  return values.map((value) => {
    const ratio = (value - min) / (max - min);
    const adjustedRatio = Math.pow(ratio, emphasis / 2);
    const scaled = 0.1 + adjustedRatio * 0.8;
    return interpolator(name === "Viridis" ? scaled : name === "Magma" ? 0.15 + adjustedRatio * 0.7 : scaled);
  });
}

function computeData() {
  state.statementMap = new Map();
  state.termFrequency = [];

  if (!state.records.length || !state.selectedColumn) {
    return;
  }

  if (!isTextColumn(state.records, state.selectedColumn)) {
    return;
  }

  const tokenStats = new Map();
  let tokenIndex = 0;

  state.records.forEach((record) => {
    const rawText = record[state.selectedColumn];
    const text = typeof rawText === "string" ? rawText : rawText === null || rawText === undefined ? "" : String(rawText);
    if (!text) {
      return;
    }

    const matches = text.toLowerCase().match(/[\p{L}']+/gu) || [];
    const statementWords = new Set();

    matches.forEach((word) => {
      if (STOP_WORDS.has(word)) {
        tokenIndex += 1;
        return;
      }

      const current = tokenStats.get(word) ?? { freq: 0, firstSeen: tokenIndex };
      current.freq += 1;
      tokenStats.set(word, current);
      statementWords.add(word);
      tokenIndex += 1;
    });

    statementWords.forEach((word) => {
      const statements = state.statementMap.get(word) ?? [];
      statements.push(text);
      state.statementMap.set(word, statements);
    });
  });

  state.termFrequency = Array.from(tokenStats.entries())
    .map(([word, stats]) => ({ word, freq: stats.freq, firstSeen: stats.firstSeen }))
    .sort((left, right) => right.freq - left.freq || left.firstSeen - right.firstSeen)
    .slice(0, state.maxWords);

  const visibleWords = new Set(state.termFrequency.map((entry) => entry.word));
  state.statementMap = new Map(
    Array.from(state.statementMap.entries()).filter(([word]) => visibleWords.has(word))
  );

  if (state.selectedWord && !visibleWords.has(state.selectedWord)) {
    state.selectedWord = null;
  }
}

function renderUploadMessage() {
  elements.uploadMessage.className = "status-message";
  if (state.uploadError) {
    elements.uploadMessage.textContent = `Could not read this file: ${state.uploadError}`;
    elements.uploadMessage.classList.add("error");
    return;
  }

  if (state.records.length && state.selectedColumn && !isTextColumn(state.records, state.selectedColumn)) {
    elements.uploadMessage.textContent = "Selected column does not contain text.";
    elements.uploadMessage.classList.add("error");
    return;
  }

  if (state.records.length && state.selectedColumn && state.termFrequency.length === 0) {
    elements.uploadMessage.textContent = "No terms found in the selected column.";
    elements.uploadMessage.classList.add("error");
    return;
  }

  elements.uploadMessage.textContent = "";
}

function renderColumnOptions() {
  const options = [
    '<option value="">Select a column</option>',
    ...state.columns.map((column) => `<option value="${column}">${column}</option>`),
  ];
  elements.columnSelect.innerHTML = options.join("");
  elements.columnSelect.disabled = state.columns.length === 0;
  if (state.selectedColumn) {
    elements.columnSelect.value = state.selectedColumn;
  }
}

function renderStatements() {
  const statements = state.selectedWord ? [...(state.statementMap.get(state.selectedWord) ?? [])] : [];

  elements.sortStatementsButton.disabled = statements.length === 0;
  elements.sortStatementsButton.textContent = state.statementSortAscending ? "Sort Z–A" : "Sort A–Z";

  if (!statements.length) {
    elements.statementsEmpty.textContent = state.selectedWord ? "No statements found." : "Click a word above.";
    elements.statementsEmpty.style.display = "block";
    elements.statementsTable.style.display = "none";
    elements.statementRows.replaceChildren();
    return;
  }

  statements.sort((left, right) => {
    const comparison = left.localeCompare(right);
    return state.statementSortAscending ? comparison : -comparison;
  });

  const fragment = document.createDocumentFragment();
  statements.forEach((statement) => {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.textContent = statement;
    row.append(cell);
    fragment.append(row);
  });

  elements.statementRows.replaceChildren(fragment);
  elements.statementsEmpty.style.display = "none";
  elements.statementsTable.style.display = "table";
}

function renderCloud() {
  if (!state.records.length || !state.selectedColumn || !isTextColumn(state.records, state.selectedColumn) || state.termFrequency.length === 0) {
    renderer.render({
      words: [],
      freq: [],
      colours: [],
      mapping: {},
      font: state.fontFamily,
      shape: state.shape,
      padding: state.padding,
      rotateProp: state.rotateProp,
      selectedWord: null,
    });
    return;
  }

  const words = state.termFrequency.map((entry) => entry.word);
  const frequencies = state.termFrequency.map((entry) => entry.freq);
  const colours = paletteColours(state.palette, frequencies, state.colourEmphasis);
  const mapping = Object.fromEntries(state.statementMap.entries());

  renderer.render({
    words,
    freq: frequencies,
    colours,
    mapping,
    font: state.fontFamily,
    sizeEmphasis: state.sizeEmphasis,
    shape: state.shape,
    padding: state.padding,
    rotateProp: state.rotateProp,
    selectedWord: state.selectedWord,
  });
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value).replace(/[<>&]/g, (character) => ({
    "<": "\\u003c",
    ">": "\\u003e",
    "&": "\\u0026",
  })[character]);
}

function buildStandaloneExportScript() {
  return `
const exportStateNode = document.getElementById("wordcloud-export-state");
const exportState = JSON.parse(exportStateNode.textContent);
const wordSelector = "#cloud_container text[data-word]";
let selectedWord = exportState.selectedWord;
let statementSortAscending = exportState.statementSortAscending;

function textNodes() {
  return Array.from(document.querySelectorAll(wordSelector));
}

function applyHighlight() {
  textNodes().forEach((node) => {
    const isSelected = node.dataset.word === selectedWord;
    node.style.opacity = selectedWord === null || isSelected ? "1" : "0.35";
    node.style.fontWeight = isSelected ? "bold" : "normal";
    node.style.cursor = "pointer";
  });
}

function renderStatements() {
  const sourceStatements = selectedWord ? (exportState.mapping[selectedWord] ?? []) : [];
  const statements = sourceStatements.length > 0 ? [...sourceStatements] : [];
  const sortButton = document.getElementById("sort_statements");
  const empty = document.getElementById("statements_empty");
  const table = document.querySelector(".statements-table");
  const rows = document.getElementById("statement_rows");

  sortButton.disabled = statements.length === 0;
  sortButton.textContent = statementSortAscending ? "Sort Z–A" : "Sort A–Z";

  if (!statements.length) {
    empty.textContent = selectedWord ? "No statements found." : "Click a word above.";
    empty.style.display = "block";
    table.style.display = "none";
    rows.replaceChildren();
    return;
  }

  statements.sort((left, right) => {
    const comparison = left.localeCompare(right);
    return statementSortAscending ? comparison : -comparison;
  });

  const fragment = document.createDocumentFragment();
  statements.forEach((statement) => {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.textContent = statement;
    row.append(cell);
    fragment.append(row);
  });

  rows.replaceChildren(fragment);
  empty.style.display = "none";
  table.style.display = "table";
}

textNodes().forEach((node) => {
  node.addEventListener("mouseover", () => {
    node.style.opacity = "0.6";
  });
  node.addEventListener("mouseout", applyHighlight);
  node.addEventListener("click", (event) => {
    event.stopPropagation();
    selectedWord = node.dataset.word;
    applyHighlight();
    renderStatements();
  });
});

document.querySelector("#cloud_container svg")?.addEventListener("click", (event) => {
  if (event.target.closest("text")) {
    return;
  }
  selectedWord = null;
  applyHighlight();
  renderStatements();
});

document.getElementById("sort_statements").addEventListener("click", () => {
  statementSortAscending = !statementSortAscending;
  renderStatements();
});

applyHighlight();
renderStatements();
`;
}

function buildStandaloneExportHtml() {
  const svgString = renderer.getSvgString();
  if (!svgString) {
    return null;
  }

  const pageShell = document.querySelector(".page-shell").cloneNode(true);
  pageShell.querySelector(".controls-card")?.remove();
  const cloneElements = {
    uploadMessage: pageShell.querySelector("#upload_message"),
    cloudContainer: pageShell.querySelector("#cloud_container"),
    cloudNote: pageShell.querySelector("#cloud_note"),
    sortButton: pageShell.querySelector("#sort_statements"),
  };

  cloneElements.uploadMessage.className = elements.uploadMessage.className;
  cloneElements.uploadMessage.innerHTML = elements.uploadMessage.innerHTML;
  cloneElements.cloudContainer.innerHTML = svgString;
  cloneElements.cloudNote.textContent = elements.cloudNote.textContent;
  cloneElements.sortButton.textContent = elements.sortStatementsButton.textContent;
  cloneElements.sortButton.disabled = elements.sortStatementsButton.disabled;

  const exportState = {
    mapping: Object.fromEntries(state.statementMap.entries()),
    selectedWord: state.selectedWord,
    statementSortAscending: state.statementSortAscending,
  };

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    "  <title>Wordcloud</title>",
    `  <style>${appStylesText}</style>`,
    "</head>",
    "<body>",
    pageShell.outerHTML,
    `  <script id="wordcloud-export-state" type="application/json">${escapeJsonForHtml(exportState)}</script>`,
    `  <script>${buildStandaloneExportScript()}</script>`,
    "</body>",
    "</html>",
  ].join("\n");
}

function downloadStandaloneHtml() {
  const html = buildStandaloneExportHtml();
  if (!html) {
    return;
  }

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "wordcloud-export.html";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function renderApp() {
  renderColumnOptions();
  computeData();
  renderUploadMessage();
  renderCloud();
  renderStatements();
}

async function handleFileChange(event) {
  const [file] = event.target.files || [];
  state.uploadError = "";
  state.selectedWord = null;

  if (!file) {
    state.records = [];
    state.columns = [];
    state.selectedColumn = "";
    renderApp();
    return;
  }

  try {
    const { records, columns } = await parseFile(file);
    state.records = records;
    state.columns = columns;
    state.selectedColumn = columns[0] ?? "";
  } catch (error) {
    state.records = [];
    state.columns = [];
    state.selectedColumn = "";
    state.uploadError = error instanceof Error ? error.message : String(error);
  }

  renderApp();
}

function attachEvents() {
  elements.fileInput.addEventListener("change", handleFileChange);
  elements.columnSelect.addEventListener("change", (event) => {
    state.selectedColumn = event.target.value;
    state.selectedWord = null;
    renderApp();
  });
  elements.maxWordsInput.addEventListener("change", (event) => {
    const nextValue = Number.parseInt(event.target.value, 10);
    state.maxWords = Number.isFinite(nextValue) ? Math.min(300, Math.max(10, nextValue)) : 100;
    elements.maxWordsInput.value = String(state.maxWords);
    state.selectedWord = null;
    renderApp();
  });
  elements.sizeEmphasisInput.addEventListener("input", (event) => {
    state.sizeEmphasis = Number(event.target.value);
    elements.sizeEmphasisValue.value = formatSliderValue(state.sizeEmphasis);
    renderApp();
  });
  elements.fontSelect.addEventListener("change", (event) => {
    state.fontFamily = event.target.value;
    renderApp();
  });
  elements.paletteSelect.addEventListener("change", (event) => {
    state.palette = event.target.value;
    renderApp();
  });
  elements.colourEmphasisInput.addEventListener("input", (event) => {
    state.colourEmphasis = Number(event.target.value);
    elements.colourEmphasisValue.value = formatSliderValue(state.colourEmphasis);
    renderApp();
  });
  elements.shapeSelect.addEventListener("change", (event) => {
    state.shape = event.target.value;
    renderApp();
  });
  elements.paddingInput.addEventListener("input", (event) => {
    state.padding = Number(event.target.value);
    elements.paddingValue.value = formatSliderValue(state.padding);
    renderApp();
  });
  elements.rotateInput.addEventListener("input", (event) => {
    state.rotateProp = Number(event.target.value);
    elements.rotateValue.value = formatSliderValue(state.rotateProp);
    renderApp();
  });
  elements.sortStatementsButton.addEventListener("click", () => {
    state.statementSortAscending = !state.statementSortAscending;
    renderStatements();
  });
  elements.downloadHtmlButton.addEventListener("click", downloadStandaloneHtml);
  elements.downloadSvgButton.addEventListener("click", () => renderer.exportSvg());
  elements.downloadPngButton.addEventListener("click", () => renderer.exportPng());
  window.addEventListener("resize", () => renderCloud());
}

populateStaticOptions();
attachEvents();
renderApp();
