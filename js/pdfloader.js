/* pdfloader.js - loads the PDF reader that is bundled in /lib (no internet needed) */
let promise = null;
export function getPdfjs() {
  if (!promise) {
    promise = import("../lib/pdf.min.mjs").then(m => {
      m.GlobalWorkerOptions.workerSrc = new URL("../lib/pdf.worker.min.mjs", import.meta.url).href;
      return m;
    });
  }
  return promise;
}
