/*
 * Export entry manager
 * - Detailed PPT export implementation: ./Export/pptExport.js
 * - MPP import/export implementation: ./Export/mppExport.js
 */

const EXPORT_MODULES = {
  ppt: "./js/Export/pptExport.js",
  mpp: "./js/Export/mppExport.js"
};

const EXPORT_DEPENDENCY_SOURCES = Object.freeze({
  html2canvas: [
    "../../../vendor/html2canvas/html2canvas.min.js?v=1.4.1-local",
    "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
    "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js"
  ],
  jszip: [
    "../../../vendor/jszip/jszip.min.js?v=3.10.1-local",
    "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
    "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"
  ],
  pptxgen: [
    "../../../vendor/pptxgenjs/pptxgen.bundle.js?v=3.12.0-local",
    "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js",
    "https://unpkg.com/pptxgenjs@3.12.0/dist/pptxgen.bundle.js"
  ]
});

function formatExportError(error, fallback) {
  const raw = error && error.message ? error.message : error;
  const message = String(raw || fallback || "Unknown export error").replace(/\s+/g, " ").trim();
  return message.length > 320 ? message.slice(0, 317) + "..." : message;
}
