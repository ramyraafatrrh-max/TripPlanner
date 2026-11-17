/* parser.js - turns PDF text into trip data. Pure functions, no DOM. */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

export function pad(n) { return (n < 10 ? "0" : "") + n; }

/* ---------- PDF page helpers ---------- */
export async function extractPages(pdfjs, data) {
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    let ann = [];
    try { ann = await page.getAnnotations(); } catch (e) { ann = []; }
    const vp = page.getViewport({ scale: 1 });
    const items = tc.items
      .filter(it => typeof it.str === "string" && it.str.trim() !== "")
      .map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height || 0 }));
    const links = ann.filter(a => a.subtype === "Link" && a.url && a.rect)
      .map(a => ({ url: a.url, x1: a.rect[0], y1: a.rect[1], x2: a.rect[2], y2: a.rect[3] }));
    pages.push({ items, links, width: vp.width, height: vp.height });
  }
  return pages;
}

export function pagesToText(pages) {
  const out = [];
  pages.forEach(p => { out.push(...groupLines(p.items).map(l => l.text)); out.push(""); });
  return out.join("\n");
}

/* group text items into lines (top to bottom, left to right) */
export function groupLines(items, tol = 2.5) {
  const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  sorted.forEach(it => {
    let line = lines.find(l => Math.abs(l.y - it.y) <= tol);
    if (!line) { line = { y: it.y, items: [] }; lines.push(line); }
    line.items.push(it);
  });
  lines.sort((a, b) => b.y - a.y);
  lines.forEach(l => {
    l.items.sort((a, b) => a.x - b.x);
    let t = "", prev = null;
    l.items.forEach(it => {
      if (prev && it.x - (prev.x + prev.w) > 1.2 && !t.endsWith(" ")) t += " ";
      t += it.s; prev = it;
    });
    l.text = t.replace(/\s+/g, " ").trim();
    l.x = l.items[0].x;
    l.h = Math.max(...l.items.map(i => i.h));
  });
  return lines;
}

/* ---------- dates ---------- */
export function parseDatesIn(text, defaultYear) {
  const res = [];
  const add = (y, m, d, idx) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return;
    res.push({ iso: `${y}-${pad(m)}-${pad(d)}`, idx });
  };
  let m;
  const r1 = /\b(20\d\d)[-\/.](\d{1,2})[-\/.](\d{1,2})\b/g;
  while ((m = r1.exec(text))) add(+m[1], +m[2], +m[3], m.index);
  const r2 = /\b(\d{1,2})(?:st|nd|rd|th)?[\s,.-]+([A-Za-z]{3,9})\.?[\s,.-]+(20\d\d)\b/g;
  while ((m = r2.exec(text))) { const mo = MONTHS[m[2].toLowerCase()]; if (mo) add(+m[3], mo, +m[1], m.index); }
  const r3 = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)\b/g;
  while ((m = r3.exec(text))) { const mo = MONTHS[m[1].toLowerCase()]; if (mo) add(+m[3], mo, +m[2], m.index); }
  const r4 = /\b(\d{1,2})\/(\d{1,2})\/(20\d\d)\b/g;
  while ((m = r4.exec(text))) { const a = +m[1], b = +m[2]; add(+m[3], a > 12 ? b : b > 12 ? a : b, a > 12 ? a : b > 12 ? b : a, m.index); }
  if (defaultYear) {
    const r5 = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\b(?!\s*,?\s*20\d\d)/g;
    while ((m = r5.exec(text))) { const mo = MONTHS[m[2].toLowerCase()]; if (mo) add(defaultYear, mo, +m[1], m.index); }
  }
  res.sort((a, b) => a.idx - b.idx);
  const seen = new Set();
  return res.filter(r => (seen.has(r.idx) ? false : (seen.add(r.idx), true)));
}

/* ---------- itinerary table parser (the format produced in this project) ---------- */
const ROW_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:\s*-\s*Stop\s*(\d+))?\s*(.*)$/i;

function colIndex(x, cols) {
  let idx = 0;
  for (let i = 0; i < cols.length; i++) if (x >= cols[i] - 5) idx = i;
  return idx;
}

export function detectYears(pages) {
  const txt = pages.slice(0, 2).map(p => p.items.map(i => i.s).join(" ")).join(" ");
  const years = (txt.match(/\b20\d\d\b/g) || []).map(Number);
  return years.length ? Math.min(...years) : null;
}

function parseTableItinerary(pages) {
  const rows = [];
  let cityState = "";
  for (const page of pages) {
    const lines = groupLines(page.items);
    const regions = [];
    let open = null;
    for (const ln of lines) {
      const big = ln.h > 10 && ln.x < 60;
      if (big) {
        if (open) { open.endY = ln.y + 1; regions.push(open); open = null; }
        const m = ln.text.match(/^(.*?)\s+Itinerary\s*\(/i);
        if (m) cityState = m[1].replace(/\band\b/gi, "&").trim();
        continue;
      }
      if (ln.items.some(i => i.s.trim() === "Date / Stop")) {
        if (open) { open.endY = ln.y + 1; regions.push(open); }
        const find = (re) => { const it = page.items.find(i => i.y <= ln.y + 3 && i.y > ln.y - 30 && re.test(i.s.trim())); return it ? it.x : null; };
        const cx = [ln.items.find(i => i.s.trim() === "Date / Stop").x,
          find(/^Location/), find(/^Google/), find(/^How to Get/), find(/^Activity/), find(/^Baby/), find(/^Budget/)];
        open = { topY: ln.y - 1, endY: -1e9, cols: cx.every(v => v != null) ? cx : null, city: cityState };
      }
    }
    if (open) { open.endY = -1e9; regions.push(open); }
    for (const reg of regions) {
      if (!reg.cols) continue;
      const inReg = page.items.filter(i => i.y < reg.topY && i.y > reg.endY);
      const starts = [];
      groupLines(inReg).forEach(ln => {
        const c0 = ln.items.filter(i => colIndex(i.x, reg.cols) === 0);
        if (!c0.length) return;
        const t = c0.map(i => i.s).join(" ").replace(/\s+/g, " ").trim();
        if (ROW_RE.test(t)) starts.push(ln.y);
      });
      starts.forEach((sy, k) => {
        const ey = k + 1 < starts.length ? starts[k + 1] + 3 : reg.endY;
        const cell = [[], [], [], [], [], [], []];
        inReg.filter(i => i.y <= sy + 3 && i.y > ey).forEach(i => cell[colIndex(i.x, reg.cols)].push(i));
        const text = cell.map(c => groupLines(c).map(l => l.text).join(" ").replace(/\s+/g, " ").trim());
        const m = text[0].match(ROW_RE);
        if (!m) return;
        const link = page.links.find(L => {
          const cy = (L.y1 + L.y2) / 2, cxm = (L.x1 + L.x2) / 2;
          return cy <= sy + 4 && cy > ey && colIndex(cxm, reg.cols) === 2;
        });
        let query = "";
        if (link) { try { query = new URL(link.url).searchParams.get("query") || ""; } catch (e) { query = ""; } }
        rows.push({
          month: m[1].slice(0, 3).toLowerCase(), day: +m[2], stopNo: m[3] ? +m[3] : null,
          name: m[4].trim(), area: text[1], query, transit: text[3], activity: text[4], baby: text[5], eats: text[6],
          city: reg.city
        });
      });
    }
  }
  return rows;
}

/* ---------- generic fallback parser: date headings + lines ---------- */
function parseGenericItinerary(pages, defaultYear) {
  const text = pagesToText(pages);
  const lines = text.split("\n").map(s => s.trim()).filter(Boolean);
  const rows = [];
  let cur = null;
  const dayRe = /^(?:day\s*\d+\s*[-:,]?\s*)?(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*[,.]?\s*)?((?:\d{1,2}\s+[A-Za-z]{3,9})|(?:[A-Za-z]{3,9}\.?\s+\d{1,2})|20\d\d-\d\d-\d\d)\b(.*)$/i;
  for (const ln of lines) {
    const m = ln.match(dayRe);
    if (m && ln.length < 90) {
      const d = parseDatesIn(m[1], defaultYear)[0];
      if (d) { cur = d.iso; if (m[2] && m[2].trim().length > 3) rows.push({ iso: cur, name: m[2].replace(/^[-:\u2013\s]+/, ""), query: m[2].replace(/^[-:\u2013\s]+/, "") }); continue; }
    }
    if (cur && ln.length > 3 && ln.length < 140) rows.push({ iso: cur, name: ln.replace(/^[\u2022*\-\s]+/, ""), query: ln.replace(/^[\u2022*\-\s]+/, "") });
  }
  return rows;
}

function yearFor(month, startMonth, startYear) { return month < startMonth ? startYear + 1 : startYear; }

export function parseItinerary(pages, opts = {}) {
  const detected = detectYears(pages);
  const year = opts.year || detected || new Date().getFullYear();
  const tableRows = parseTableItinerary(pages);
  let stops = [];
  let mode = "table";
  if (tableRows.length) {
    const startMonth = MONTHS[tableRows[0].month];
    stops = tableRows.map(r => {
      const mo = MONTHS[r.month];
      const y = yearFor(mo, startMonth, year);
      return { date: `${y}-${pad(mo)}-${pad(r.day)}`, label: r.stopNo ? `Stop ${r.stopNo}` : "", name: r.name, area: r.area, query: r.query || r.name,
        transit: r.transit, activity: r.activity, baby: r.baby, eats: r.eats, city: r.city };
    });
  } else {
    mode = "generic";
    stops = parseGenericItinerary(pages, year).map(r => ({ date: r.iso, label: "", name: r.name, area: "", query: r.query, transit: "", activity: "", baby: "", eats: "", city: "" }));
  }
  return { mode, year, stops, detectedYear: detected };
}

/* ---------- hotels ---------- */
function firstMatch(text, re) { const m = text.match(re); return m ? m[1].trim() : ""; }

export function parseHotel(text, filename, defaultYear) {
  const lines = text.split("\n").map(s => s.trim()).filter(Boolean);
  const out = { name: "", address: "", checkIn: "", checkOut: "", confirmation: "", phone: "", notes: "", source: filename || "", city: "" };
  const kw = /(hotel|inn\b|apartment|hostel|resort|suites?|villa|residence|ryokan|guest\s?house|lodg|stay\b)/i;
  const noise = /(booking\.com|agoda|expedia|airbnb|trip\.com|confirm|reservation|itinerary|e-?ticket|thank|welcome|invoice|receipt|page\s+\d|www\.|https?:|@|^\d+$|check-?\s?(in|out)|address|phone|\btel\b|guest|price|total|payment|cancel|policy|nights?|your booking)/i;
  const labelLine = /^[A-Za-z ]{2,24}:\s/;
  const cand = lines.filter(l => l.length >= 3 && l.length <= 70 && !noise.test(l) && !labelLine.test(l));
  out.name = (cand.slice(0, 12).find(l => kw.test(l)) || cand[0] || lines[0] || (filename || "").replace(/\.pdf$/i, "")).replace(/^[^A-Za-z0-9]+/, "");
  const ci = lines.findIndex(l => /check-?\s?in/i.test(l));
  const co = lines.findIndex(l => /check-?\s?out/i.test(l));
  const near = (i) => { if (i < 0) return ""; const seg = lines.slice(i, i + 3).join(" "); const d = parseDatesIn(seg, defaultYear); return d.length ? d[0].iso : ""; };
  out.checkIn = near(ci); out.checkOut = near(co);
  if (!out.checkIn || !out.checkOut) {
    const all = parseDatesIn(text, defaultYear).map(d => d.iso).filter((v, i, a) => a.indexOf(v) === i).sort();
    if (!out.checkIn && all[0]) out.checkIn = all[0];
    if (!out.checkOut && all.length > 1) out.checkOut = all[all.length - 1];
  }
  out.confirmation = firstMatch(text, /(?:confirmation|booking|reservation|reference)[ \t]*(?:number|no\.?|#|id|code)?[ \t]*[:#]?[ \t]*([A-Z0-9][A-Z0-9.\-]{5,})/i);
  out.phone = firstMatch(text, /(?:phone|tel(?:ephone)?|contact)[^\d\n+]{0,12}(\+?\d[\d \-().]{7,}\d)/i);
  const ai = lines.findIndex(l => /^address\b/i.test(l));
  if (ai >= 0) out.address = (lines[ai].replace(/^address\s*[:\-]?\s*/i, "") || lines[ai + 1] || "").trim();
  if (!out.address) out.address = lines.find(l => /\b\d{3}-\d{4}\b/.test(l) || /\b\d{1,4}[-\s]\d{1,3}[-\s]\d{1,3}\b.*(?:ku|city|tokyo|osaka|kyoto|hong kong)/i.test(l)) || "";
  const nights = firstMatch(text, /(\d+)\s*nights?/i);
  if (nights) out.notes = nights + " night(s)";
  return out;
}

/* ---------- flights ---------- */
const NOT_AIRPORT = new Set(["THE", "AND", "FOR", "PDF", "USD", "EUR", "EGP", "JPY", "HKD", "GMT", "UTC", "VAT", "TAX", "ONE", "SEP", "OCT", "NOV", "DEC", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "TUE", "WED", "THU", "FRI", "SAT", "SUN", "MON", "AIR", "NEW", "ADT", "INF", "CHD", "REF", "PNR", "ECO", "MIN", "MAX", "MRS", "SEAT"]);

export function parseFlights(text, filename, defaultYear) {
  const lines = text.split("\n").map(s => s.trim()).filter(Boolean);
  const bookingRef = firstMatch(text, /(?:booking|reservation|confirmation|pnr)[ \t]*(?:reference|ref|number|no\.?|code)?[ \t]*[:#]?[ \t]*\b([A-Z0-9]{6})\b/i);
  const re = /\b([A-Z][A-Z0-9]|[A-Z0-9][A-Z])\s?(\d{2,4})\b/g;
  const hits = [];
  const seen = new Set();
  lines.forEach((ln, i) => {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(ln))) {
      const code = m[1], num = m[2];
      if (/^\d\d$/.test(code)) continue;
      const ctx = lines.slice(Math.max(0, i - 3), i + 8).join(" | ");
      const looksFlight = /flight|depart|arriv|terminal|operated|airways|airlines|cabin|seat/i.test(ctx) || /\d{1,2}:\d{2}/.test(ln);
      if (!looksFlight) continue;
      if (!/flight/i.test(ln) && /^(AM|PM|ID|NO|AT|TO|IN|ON|OF|IS|IT|AS|BY|OR|UP|US|WE|BE|DO|GO|IF|SO|MY|HE)$/.test(code)) continue;
      const key = code + num;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ i, number: `${code} ${num}`, code, num });
    }
  });
  const flights = [];
  hits.forEach((hit, k) => {
    const end = k + 1 < hits.length ? hits[k + 1].i : Math.min(lines.length, hit.i + 10);
    const block = lines.slice(hit.i, Math.max(end, hit.i + 1)).join(" | ");
    const times = block.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/g) || [];
    let dates = parseDatesIn(block, defaultYear);
    if (!dates.length) dates = parseDatesIn(lines.slice(Math.max(0, hit.i - 3), hit.i + 1).join(" "), defaultYear);
    let codes = (block.match(/\(([A-Z]{3})\)/g) || []).map(c => c.slice(1, 4));
    if (codes.length < 2) codes = (block.match(/\b[A-Z]{3}\b/g) || []).filter(c => !NOT_AIRPORT.has(c) && c !== hit.code);
    const uniq = codes.filter((c, j) => codes.indexOf(c) === j);
    flights.push({ number: hit.number, date: dates[0] ? dates[0].iso : "", from: uniq[0] || "", to: uniq[1] || "",
      depart: times[0] || "", arrive: times[1] || "", booking: bookingRef, notes: "", source: filename || "" });
  });
  return flights;
}
