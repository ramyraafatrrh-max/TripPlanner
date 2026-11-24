/* itinerary.js - reads a day-by-day itinerary PDF into days and stops.
   It understands tables (a header row such as "Date | How to get there | Stops | Eat | Baby" and one row per day, or one
   row per stop) by looking at where each piece of text sits on the page. If no table is found it falls back to splitting
   the text at date headings. Everything it reads can be corrected in the app afterwards. */
import { monthIndex, weekdayIndex, isoOf, yearFor, cityToTz, uid } from "../../core/util.js";
import { linesOf } from "./pdftext.js";

const MONTHS = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const WD = "Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:r(?:s(?:day)?)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?";
const RE_DMY = new RegExp(`^(?:(${WD})\\.?,?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})(?![A-Za-z])\\.?(?:,?\\s+(\\d{4}))?`, "i");
const RE_MDY = new RegExp(`^(?:(${WD})\\.?,?\\s+)?(${MONTHS})(?![A-Za-z])\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?![\\d:])(?:,?\\s+(\\d{4}))?`, "i");
const MAJOR = ["Tokyo", "Osaka", "Kyoto", "Nara", "Kobe", "Yokohama", "Hong Kong", "Himeji", "Hiroshima"];

export function parseDateLine(t, hints) {
  t = String(t).trim();
  let m = RE_DMY.exec(t), d, mon, y, wd;
  if (m) { wd = m[1]; d = +m[2]; mon = m[3]; y = m[4]; }
  else if ((m = RE_MDY.exec(t))) { wd = m[1]; mon = m[2]; d = +m[3]; y = m[4]; }
  else return null;
  const mi = monthIndex(mon); if (mi < 0 || d < 1 || d > 31) return null;
  const w = wd ? weekdayIndex(wd) : -1;
  const year = y ? +y : yearFor(d, mi, w, hints);
  return { iso: isoOf(year, mi, d), rest: t.slice(m[0].length).replace(/^[\s\-\u2013:()]+/, "").replace(/[()]/g, "").trim() };
}
const roleOf = (label, i) => {
  const s = label.toLowerCase();
  if (i === 0) return /stop/.test(s) ? "datestop" : "date";
  if (/map|link/.test(s)) return "map";
  if (/how to get|transit|getting|route|next stop/.test(s)) return "transit";
  if (/eat|food|meal|cost/.test(s) && !/activity/.test(s)) return "eats";
  if (/baby|nursery|notes/.test(s)) return "baby";
  if (/location|area/.test(s)) return "area";
  if (/stops|activity|plan|highlights|what to|see and do/.test(s)) return "stops";
  return "other";
};
function headingCity(text) {
  if (!text || /itinerary|continued|page|date|check|booking|version/i.test(text)) return "";
  const m = /^([A-Z][A-Za-z.' ]{2,28}?)(?:\s+base\b|\s+and\b|\s*[-\u2013\u2014(,:]|$)/.exec(text.trim());
  return m ? m[1].trim() : "";
}
const majorIn = text => { let best = null, at = 1e9; for (const c of MAJOR) { const i = text.toLowerCase().indexOf(c.toLowerCase()); if (i >= 0 && i < at) { at = i; best = c; } } return best; };

/* ---------- turning a cell of text into stops ---------- */
const TRANSIT = /^(JR|Metro|Hibiya|Ginza|Marunouchi|Chiyoda|Oedo|Asakusa Line|Keihan|Hankyu|Midosuji|Kintetsu|Nankai|Keikyu|Taxi|Bus|Walk|Train|Shinkansen|Return|Back to|Rest|Check|Then|Leave|Fly|Land|Take|Cab)\b/i;
const LABEL = /^(Optional(?: dinner)?|Early dinner|Lunch|Dinner|Breakfast|Snack|Evening in [A-Z][a-z]+|Evening|Morning|Afternoon)\s*[:\-]\s*/i;
function paragraphs(lines) {
  const out = []; let cur = null;
  for (const ln of lines) {
    const text = ln.text.trim(); if (!text) continue;
    const startsNew = /^(\d{1,2}:\d{2}\b|[-\u2022*\u00b7]\s)/.test(text) || (cur && /[.!?:)]$/.test(cur.text) && /^[A-Z0-9(]/.test(text) && cur.text.length > 25);
    if (!cur || startsNew) { cur = { text, y: ln.y, y2: ln.y }; out.push(cur); } else { cur.text += " " + text; cur.y2 = ln.y; }
  }
  const merged = [];
  for (const p of out) {          // a very short or lower-case fragment belongs to the previous paragraph
    if (merged.length && (p.text.length < 14 || /^[a-z]/.test(p.text)) && !/^\d{1,2}:\d{2}/.test(p.text)) { const q = merged[merged.length - 1]; q.text += " " + p.text; q.y2 = p.y2; } else merged.push(p);
  }
  return merged;
}
function toStop(par, city, links) {
  let s = par.text, time = "";
  const tm = /^(\d{1,2}:\d{2})(?:\s*[-\u2013]\s*\d{1,2}:\d{2})?\s*/.exec(s);
  if (tm) { time = tm[1]; s = s.slice(tm[0].length); }
  s = s.replace(/^[-\u2022*\u00b7]\s+/, "").trim();
  if (!s) return null;
  let body = s;
  const first = body.split(/\.\s+/)[0];
  if (TRANSIT.test(first) && /\.\s+\S/.test(body)) body = body.slice(first.length).replace(/^\.\s+/, "").trim();   // "Ginza Line to Ueno. Ameyoko Street: ..." -> the place
  const label = (LABEL.exec(body) || [""])[0];
  let rest = body.slice(label.length);
  const cut = rest.search(/\s\(|[:;]\s|\.\s|\s[-\u2013]\s/);
  let name = (cut > 2 ? rest.slice(0, cut) : rest).replace(/[.,;:]+$/, "").trim();
  if (name.length > 80) name = name.slice(0, 80).replace(/\s+\S*$/, "");
  const labelTxt = label.replace(/\s*[:\-]\s*$/, "").trim();
  if (/^(Optional|Early|Lunch|Dinner|Breakfast|Snack)/i.test(labelTxt)) name = labelTxt + ": " + name;
  name = name.replace(/\s+/g, " ").replace(/:\s*$/, "").trim();
  if (/^(Walk|Head|Go|Take|Continue|Stroll|Cross|Wander|Cycle)\b/i.test(name)) { const pn = /(?:\bof|\bto|\bat|\bthrough|\binto)\s+(?:the\s+)?((?:[A-Z][\w'\-]+)(?:\s+[A-Z][\w'\-]+)*)\s*$/.exec(name); if (pn) name = pn[1]; }
  if (name.length < 3 || /^(Then|Also|Ticket|Check the|Note|Self check|Hotel$|Tip|Cost|Dress|Carry|Pick ?up|Reserve|Book|Ask|Message|Keep)\b/i.test(name)) return null;
  const addr = /\([^():]*?(\d+[-\u2013]\d+(?:[-\u2013]\d+)?\s+[A-Za-z][A-Za-z\-]*(?:\s+[A-Za-z][A-Za-z\-]*)?)/.exec(body);
  const stop = { id: uid("s"), name, area: "", query: addr ? `${name.replace(/^[A-Za-z ]+:\s*/, "")} ${addr[1]}` : name.replace(/^(Optional(?: dinner)?|Early dinner|Lunch|Dinner|Breakfast|Snack):\s*/i, ""), city, label: "", time,
    transit: "", activity: s, baby: "", eats: "", mapUrl: "", visited: false, visitedAt: null, vts: 0, notes: "", searchTerm: "" };
  const link = links.find(l => l.cy >= par.y - 9 && l.cy <= par.y2 + 3);
  if (link) stop.mapUrl = link.url;
  return stop;
}

/* ---------- main ---------- */
export function parseItinerary(pages, opts = {}) {
  const warnings = [];
  const allText = pages.map(p => p.items.map(i => i.str).join(" ")).join(" ");
  const yearsSeen = [...allText.matchAll(/\b(20\d{2})\b/g)].map(m => +m[1]);
  const counts = {}; yearsSeen.forEach(y => { counts[y] = (counts[y] || 0) + 1; });
  const common = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const base = +(opts.year || common || new Date().getFullYear());
  const hints = [base, base + 1, base - 1];

  const title = (() => { const p = pages[0]; if (!p || !p.items.length) return ""; const big = p.items.reduce((a, b) => (b.fs > a.fs ? b : a)); return linesOf(p.items.filter(i => Math.abs(i.fs - big.fs) < 0.5)).map(l => l.text).join(" ").slice(0, 80); })();
  const days = new Map();
  let cityState = "", tableRows = 0;

  pages.forEach(page => {
    const lines = linesOf(page.items);
    const header = lines.find(L => L.items.length >= 2 && /^Date\b/i.test(L.items[0].str.trim()));
    if (!header) return;
    const heading = lines.filter(L => L.y < header.y - 3 && L.text.length > 2).pop();
    const hc = heading ? headingCity(heading.text) : ""; if (hc) cityState = hc;
    const colX = header.items.map(i => i.x);
    const roles = header.items.map((i, k) => roleOf(i.str, k));
    const colOf = it => { let c = 0; for (let i = 0; i < colX.length; i++) if (it.x >= colX[i] - 3.5) c = i; return c; };
    const body = page.items.filter(it => it.y > header.y + 3 && it.y < page.h - 30 && !/^Page \d+$/i.test(it.str.trim()));
    const col0 = linesOf(body.filter(it => colOf(it) === 0));
    const anchors = col0.map(L => ({ L, d: parseDateLine(L.text, hints) })).filter(a => a.d);
    if (!anchors.length) return;
    const perStop = roles[0] === "datestop";
    const links = page.links.map(l => ({ url: l.url, cy: (l.y1 + l.y2) / 2 })).filter(l => /google\.[a-z.]+\/maps|goo\.gl|maps\.app/i.test(l.url));
    anchors.forEach((a, idx) => {
      const y0 = a.L.y - 2.6, y1 = idx + 1 < anchors.length ? anchors[idx + 1].L.y - 2.6 : Infinity;
      const rowItems = body.filter(it => it.y >= y0 && it.y < y1);
      const cell = {}; roles.forEach((r, i) => { if (!cell[r]) cell[r] = []; cell[r].push(...linesOf(rowItems.filter(it => colOf(it) === i))); });
      const dateCell = cell[roles[0]] || [];
      const extra = []; dateCell.slice(1).forEach(l => { if (!extra.length || /^\d+\s/.test(l.text)) extra.push(l.text.replace(/^\d+\s+/, "")); else extra[extra.length - 1] += " " + l.text; });
      const text = k => (cell[k] || []).map(l => l.text).join(" ").trim();
      const areasText = extra.join(" ");
      const city = majorIn(areasText + " " + text("area")) || cityState || "";
      tableRows++;
      let day = days.get(a.d.iso);
      if (!day) { day = { id: uid("d"), date: a.d.iso, city, tz: cityToTz(city), title: "", stops: [] }; days.set(a.d.iso, day); }
      const note = (k, v) => { if (v) day[k] = day[k] ? day[k] + " | " + v : v; };
      if (perStop) {
        const name = extra.join(" ").trim() || text("area") || "Stop";
        const stop = { id: uid("s"), name, area: text("area"), query: `${name} ${text("area")}`.trim(), city, label: a.d.rest, time: "", transit: text("transit"), activity: text("stops"), baby: text("baby"), eats: text("eats"), mapUrl: (links.find(l => l.cy >= a.L.y - 9 && l.cy <= y1) || {}).url || "", visited: false, visitedAt: null, vts: 0, notes: "", searchTerm: "" };
        day.stops.push(stop);
      } else {
        if (extra.length) day.title = day.title ? day.title : extra.map(e => e.trim()).filter(Boolean).join(" + ");
        note("transit", text("transit")); note("eats", text("eats")); note("baby", text("baby"));
        const stopCol = cell.stops || [];
        const rowLinks = links.filter(l => l.cy >= y0 && l.cy < y1);
        paragraphs(stopCol).forEach(p => { const s = toStop(p, city, rowLinks); if (s) day.stops.push(s); });
        if (!stopCol.length && text("area")) day.stops.push({ id: uid("s"), name: text("area"), area: "", query: text("area"), city, label: "", time: "", transit: "", activity: text("area"), baby: "", eats: "", mapUrl: "", visited: false, visitedAt: null, vts: 0, notes: "", searchTerm: "" });
      }
    });
  });

  let list = [...days.values()];
  if (!list.length) {                       // no table found: split by date headings
    warnings.push("I could not find a table in this PDF, so I split it at the date headings. Please check the places.");
    let cur = null;
    pages.forEach(page => linesOf(page.items).forEach(L => {
      if (L.y > page.h - 30 || /^Page \d+$/i.test(L.text)) return;
      const d = L.x < page.w * 0.3 ? parseDateLine(L.text, hints) : null;
      if (d) { cur = days.get(d.iso) || { id: uid("d"), date: d.iso, city: "", tz: cityToTz(""), title: d.rest.slice(0, 80), stops: [] }; days.set(d.iso, cur); cur._lines = cur._lines || []; if (d.rest) cur._lines.push({ text: d.rest, y: L.y }); }
      else if (cur) cur._lines.push({ text: L.text, y: L.y });
    }));
    list = [...days.values()];
    list.forEach(d => { paragraphs(d._lines || []).forEach(p => { const s = toStop(p, d.city, []); if (s) d.stops.push(s); }); delete d._lines; });
  }
  list.sort((a, b) => a.date.localeCompare(b.date));
  list.forEach(d => { if (!d.city) { const c = majorIn(d.title || ""); if (c) { d.city = c; d.tz = cityToTz(c); } } });
  const stats = { days: list.length, stops: list.reduce((n, d) => n + d.stops.length, 0) };
  if (list.length && !stats.stops) warnings.push("I found the days but no places. Add places by hand with the Add place button.");
  return { title, days: list, stats, warnings, tableRows };
}
