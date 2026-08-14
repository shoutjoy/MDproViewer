import * as pdfjsLib from '../../vendor/pdfjs/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '../../vendor/pdfjs/build/pdf.worker.min.mjs',
  import.meta.url
).href;

window.pdfjsLib = pdfjsLib;
