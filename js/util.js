/* util.js - small helpers shared by every module */

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "checked" || k === "disabled" || k === "selected" || k === "hidden" || k === "value") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  kids.flat(Infinity).forEach(k => {
    if (k === null || k === undefined || k === false) return;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  });
  return el;
}

export function uid(prefix = "id") {
  return prefix + "_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

export function randomTopic() {
  const a = new Uint8Array(12);
  (crypto || window.crypto).getRandomValues(a);
  return "trip-" + Array.from(a).map(b => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

export const pad = n => (n < 10 ? "0" : "") + n;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function fmtDate(iso, withDow = true) {
  if (!iso) return "";
  const d = parseISO(iso);
  return (withDow ? DOW[d.getUTCDay()] + " " : "") + d.getUTCDate() + " " + MONTH_NAMES[d.getUTCMonth()];
}
export function fmtShort(iso) {
  if (!iso) return "";
  const d = parseISO(iso);
  return d.getUTCDate() + " " + MONTH_NAMES[d.getUTCMonth()];
}
export function fmtLong(iso) {
  if (!iso) return "";
  const d = parseISO(iso);
  return DOW[d.getUTCDay()] + " " + d.getUTCDate() + " " + MONTH_NAMES[d.getUTCMonth()] + " " + d.getUTCFullYear();
}
export function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}
export function addDaysISO(iso, n) {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}

/* ---------- time zones ---------- */
export function cityToTz(city) {
  const c = (city || "").toLowerCase();
  if (/hong kong|kowloon|macau/.test(c)) return "Asia/Hong_Kong";
  if (/tokyo|osaka|kyoto|nara|kobe|japan|kansai|yokohama/.test(c)) return "Asia/Tokyo";
  if (/singapore/.test(c)) return "Asia/Singapore";
  if (/bangkok|thailand/.test(c)) return "Asia/Bangkok";
  if (/seoul|korea/.test(c)) return "Asia/Seoul";
  if (/dubai/.test(c)) return "Asia/Dubai";
  if (/cairo|egypt/.test(c)) return "Africa/Cairo";
  if (/london/.test(c)) return "Europe/London";
  if (/paris|rome|madrid|berlin|amsterdam/.test(c)) return "Europe/Paris";
  if (/new york/.test(c)) return "America/New_York";
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; }
}

function tzOffsetMinutes(tz, utcMs) {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const o = {};
  dtf.formatToParts(new Date(utcMs)).forEach(p => (o[p.type] = p.value));
  return (Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second) - utcMs) / 60000;
}
export function zonedToUtc(dateISO, timeHM, tz) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = timeHM.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = tzOffsetMinutes(tz, guess);
  const utc = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(tz, utc);
  return guess - off2 * 60000;
}
export function todayIn(tz) {
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return dtf.format(new Date());
}
export function nowHM(tz) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}

/* ---------- misc ---------- */
export function download(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime + ";charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export function clip(text, n) {
  text = (text || "").trim();
  return text.length > n ? text.slice(0, n - 1).trimEnd() + "\u2026" : text;
}

export function shortStopName(name) {
  return (name || "").split(":")[0].replace(/\s*\(.*?\)\s*/g, " ").trim();
}
