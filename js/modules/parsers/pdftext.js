/* pdftext.js - turns a PDF into plain text pieces that the parsers can read. Only this file touches pdf.js. */
let lib = null;
async function loadLib() {
  if (!lib) {
    lib = await import("../../../lib/pdf.min.mjs");
    lib.GlobalWorkerOptions.workerSrc = new URL("../../../lib/pdf.worker.min.mjs", import.meta.url).href;
  }
  return lib;
}
export async function readPdf(file) {
  const L = await loadLib();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await L.getDocument({ data }).promise;
  return pagesFromDoc(doc);
}
/* page = { w, h, items:[{str,x,y,w,fs}], links:[{url,x1,x2,y1,y2}] }   (y grows downward, in points) */
export async function pagesFromDoc(doc) {
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i), vp = page.getViewport({ scale: 1 }), tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (it.str === undefined || it.str === "") continue;
      items.push({ str: it.str, x: it.transform[4], y: vp.height - it.transform[5], w: it.width, fs: Math.hypot(it.transform[0], it.transform[1]) });
    }
    let links = [];
    try { links = (await page.getAnnotations()).filter(a => a.subtype === "Link" && a.url).map(a => ({ url: a.url, x1: a.rect[0], x2: a.rect[2], y1: vp.height - a.rect[3], y2: vp.height - a.rect[1] })); } catch (e) { /* no links */ }
    pages.push({ w: vp.width, h: vp.height, items, links });
  }
  return pages;
}
function joinItems(arr) {
  let s = "", prev = null;
  for (const it of arr) {
    if (prev && it.x - (prev.x + prev.w) > 0.6 && !/\s$/.test(s) && !/^\s/.test(it.str)) s += " ";
    s += it.str; prev = it;
  }
  return s.replace(/\s+/g, " ").trim();
}
/* visual lines: items on the same height are one line (columns of a table end up side by side) */
export function linesOf(items, tol = 2.6) {
  const its = items.filter(i => i.str.trim() !== "").slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of its) {
    let L = lines.find(l => Math.abs(l.y - it.y) <= tol);
    if (!L) { L = { y: it.y, items: [] }; lines.push(L); }
    L.items.push(it);
  }
  lines.sort((a, b) => a.y - b.y);
  lines.forEach(L => { L.items.sort((a, b) => a.x - b.x); L.x = L.items[0].x; L.text = joinItems(L.items); });
  return lines;
}
export const visualText = pages => pages.map(p => linesOf(p.items).map(l => l.text).join("\n")).join("\n");
/* reading order exactly as the PDF stores it: best for booking confirmations whose columns would interleave visually */
export function streamText(pages) {
  const out = [];
  for (const p of pages) {
    let s = "", prev = null;
    for (const it of p.items) {
      if (prev) { const sameLine = Math.abs(it.y - prev.y) < 2.6 && it.x >= prev.x; s += sameLine && it.x - (prev.x + prev.w) <= 0.6 ? "" : " "; }
      s += it.str; prev = it;
    }
    out.push(s);
  }
  return out.join("\n");
}
