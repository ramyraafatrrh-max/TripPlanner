/* hotel.js - reads a hotel booking confirmation. Written against real Booking.com PDFs, with a generic fallback.
   What makes these PDFs awkward (and what this file handles):
   - stay dates have NO year ("17 DECEMBER Thursday")        -> the year is found by checking which year has that weekday
   - the hotel name has NO label, it sits just before "Address:" and may be Japanese only
   - GPS is printed as degrees and decimal minutes ("N 035° 43.537, E 139° 48.021") -> converted to exact map coordinates
   - check-in is a time window ("16:00 - 23:30"), and the confirmation number / PIN code are separate boxes            */
import { monthIndex, weekdayIndex, isoOf, yearFor, addDays, isIso } from "../../core/util.js";
import { streamText, visualText } from "./pdftext.js";

const MON = "(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)(?![A-Za-z])";
const WD = "(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?![A-Za-z])";
const JP = /[\u3040-\u30ff\u3400-\u9fff]/;

export function cleanText(t) {
  return String(t || "").replace(/\*\*/g, " ").replace(/!\[\]\[[^\]]*\]/g, " ").replace(/[\u00a0\u202f\u200b]/g, " ")
    .replace(/(^|\s)_|_(\s|$)/g, " ").replace(/\s+/g, " ").trim();
}
const num = s => (s == null ? null : parseFloat(String(s).replace(/,/g, "")));

/* "17 DECEMBER Thursday from 15:00"  ->  { day, month, year?, wd, time } */
function stayPart(t, label) {
  const re = new RegExp(label + "\\s*[:\\-]?\\s*(?:(\\d{1,2})\\s*" + MON + "|" + MON + "\\s*(\\d{1,2}))(?:\\s*,?\\s*(\\d{4}))?\\s*(?:" + WD + ")?\\s*((?:from|after|until|before)?\\s*\\d{1,2}:\\d{2}(?:\\s*[-\\u2013]\\s*\\d{1,2}:\\d{2})?)?", "i");
  const m = re.exec(t); if (!m) return null;
  const day = +(m[1] || m[4]), mon = monthIndex(m[2] || m[3]);
  if (!(day >= 1 && day <= 31) || mon < 0) return null;
  return { day, month: mon, year: m[5] ? +m[5] : 0, wd: m[6] ? weekdayIndex(m[6]) : -1, time: (m[7] || "").replace(/\s*[-\u2013]\s*/, " \u2013 ").replace(/\s+/g, " ").trim() };
}
/* fallback when labels and dates were read in a different order: the first two "17 DECEMBER" pairs are in and out */
function stayFallback(t) {
  const re = new RegExp("(\\d{1,2})\\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\\b", "g");
  const found = []; let m;
  while ((m = re.exec(t)) && found.length < 2) found.push({ day: +m[1], month: monthIndex(m[2]), year: 0, wd: -1, time: "" });
  const wds = [...t.matchAll(new RegExp(WD, "g"))].map(x => weekdayIndex(x[1]));
  found.forEach((f, i) => { if (wds[i] != null) f.wd = wds[i]; });
  return found;
}
function resolve(part, hints, notBefore) {
  if (!part) return "";
  let year = part.year || yearFor(part.day, part.month, part.wd, hints);
  let iso = isoOf(year, part.month, part.day);
  if (notBefore && iso < notBefore && !part.year) { year = yearFor(part.day, part.month, part.wd, hints.map(y => y + 1)); iso = isoOf(year, part.month, part.day); }
  return iso;
}
function dmy(s) {   // "5 December 2026" -> ISO
  const m = new RegExp("(\\d{1,2})\\s+" + MON + "\\s+(\\d{4})", "i").exec(s || ""); if (!m) return "";
  return isoOf(+m[3], monthIndex(m[2]), +m[1]);
}
function gps(t) {
  const m = /GPS\s*coordinates\s*:?\s*([NS])\s*(\d{1,3})\s*[\u00b0\u00ba\u02da\u00ba°o]?\s*([\d.]+)\s*['\u2032]?\s*,?\s*([EW])\s*(\d{1,3})\s*[\u00b0\u00ba\u02da°o]?\s*([\d.]+)/i.exec(t);
  if (!m) return null;
  const lat = (m[1].toUpperCase() === "S" ? -1 : 1) * (+m[2] + parseFloat(m[3]) / 60), lng = (m[4].toUpperCase() === "W" ? -1 : 1) * (+m[5] + parseFloat(m[6]) / 60);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat: +lat.toFixed(6), lng: +lng.toFixed(6) } : null;
}

export function parseHotelText(raw, opts = {}) {
  const t = cleanText(raw);
  const out = { source: "", name: "", nameLocal: "", address: "", phone: "", lat: null, lng: null, checkIn: "", checkOut: "", checkInTime: "", checkOutTime: "",
    nights: 0, units: 0, confirmation: "", pin: "", room: "", guests: "", price: "", priceHome: "", freeCancelUntil: "", email: "", requests: "", notes: "" };

  const conf = /CONFIRMATION\s*NUMBER\s*:?\s*(\d[\d.\s]{6,14}\d)/i.exec(t);
  if (conf) out.confirmation = conf[1].replace(/\s+/g, "");
  const pin = /PIN\s*CODE\s*:?\s*(\d{3,8})/i.exec(t); if (pin) out.pin = pin[1];
  const booking = /booking\.com/i.test(t) && !!conf;
  out.source = booking ? "booking.com" : "";

  /* ----- name, address, phone, GPS ----- */
  const iAddr = t.search(/\bAddress\s*:/i);
  if (iAddr >= 0) {
    let head = t.slice(0, iAddr).replace(/^.*(?:PIN\s*CODE\s*:?\s*\d+|Booking confirmation|CONFIRMATION\s*NUMBER\s*:?\s*[\d.]+|Booking\.com\s*:?|\bConfirmation\b)\s*/i, "").trim();
    if (head.length > 140) head = head.slice(-140).replace(/^\S*\s/, "");
    const jm = /^(.*?)\s*[(\uff08]\s*([^()\uff08\uff09]*[\u3040-\u9fff][^()\uff08\uff09]*?)\s*[)\uff09]\s*$/.exec(head);
    if (jm && jm[1]) { out.name = jm[1].trim(); out.nameLocal = jm[2].replace(/\s+/g, " ").trim(); } else out.name = head;
    const a = /Address\s*:\s*(.+?)\s*(?:Phone\s*:|GPS\s*coordinates|YOUR GROUP|PRICE\b|CHECK-?IN|Booking confirmation)/i.exec(t.slice(iAddr));
    if (a) out.address = a[1].replace(/\s+,/g, ",").trim();
  } else {
    const nm = /(?:Hotel|Property|Accommodation)\s*(?:name)?\s*[:\-]\s*(.{3,80}?)(?:\s{2,}|\s+Address|\s+Check|$)/i.exec(t);
    if (nm) out.name = nm[1].trim();
    const ad = /Address\s*[:\-]?\s*(.{6,140}?)(?:\s+Phone|\s+Tel|\s+Check|\s+Booking|$)/i.exec(t); if (ad) out.address = ad[1].trim();
  }
  const ph = /(?:Phone|Tel(?:ephone)?)\s*:?\s*(\+?\d[\d\s().-]{6,22}\d)/i.exec(t) || /directly on\s*:?\s*(\+?\d[\d\s().-]{6,22}\d)/i.exec(t);
  if (ph) out.phone = ph[1].replace(/\s+/g, " ").trim();
  const g = gps(t); if (g) { out.lat = g.lat; out.lng = g.lng; }

  /* ----- dates ----- */
  const cancelYear = (/cancel[^.]{0,80}?(\d{4})/i.exec(t) || [])[1];
  const hints = [...new Set([opts.year, cancelYear && +cancelYear, new Date().getFullYear()].filter(Boolean).flatMap(y => [y, y + 1, y - 1]))];
  let inP = stayPart(t, "CHECK-?\\s?IN"), outP = stayPart(t, "CHECK-?\\s?OUT");
  if (!inP || !outP) { const f = stayFallback(t); inP = inP || f[0] || null; outP = outP || f[1] || null; }
  out.checkIn = resolve(inP, hints, "");
  out.checkOut = resolve(outP, hints, out.checkIn);
  if (inP) out.checkInTime = inP.time; if (outP) out.checkOutTime = outP.time;
  /* "UNITS 1 / NIGHTS 7"  or, when labels and numbers were read separately, "ROOMS NIGHTS 1 / 7" */
  const pair = /(?:UNITS|ROOMS|APARTMENTS?)\s+NIGHTS\s+(\d{1,2})\s*\/\s*(\d{1,3})\b/i.exec(t);
  if (pair) { out.units = +pair[1]; out.nights = +pair[2]; }
  else {
    const nights = /NIGHTS\s*:?\s*(\d{1,3})\b/i.exec(t); if (nights) out.nights = +nights[1];
    const units = /(?:UNITS|ROOMS|APARTMENTS?)\s*:?\s*(\d{1,2})\s*\//i.exec(t); if (units) out.units = +units[1];
  }
  if (out.checkIn && !out.checkOut && out.nights) out.checkOut = addDays(out.checkIn, out.nights);
  if (out.checkIn && out.checkOut) { const calc = Math.round((Date.parse(out.checkOut) - Date.parse(out.checkIn)) / 86400000); if (calc > 0) out.nights = calc; }   // the dates are the most reliable source

  /* ----- room, guests, price, cancellation ----- */
  const room = /(?:not mentioned here\.?|mentioned here\.)\s*(.{3,90}?)\s*Guest name\s*:/i.exec(t); if (room) out.room = room[1].trim();
  const gn = /Guest name\s*:\s*(.+?)\s*Number of guests\s*:/i.exec(t); if (gn) out.guests = gn[1].trim();
  const ng = /Number of guests\s*:\s*(.+?)\s*(?:Meal Plan|Private|Free|Air|$)/i.exec(t); if (ng && out.guests) out.guests += " (" + ng[1].trim() + ")"; else if (ng) out.guests = ng[1].trim();
  const pay = /You['\u2019]ll pay\s*([\d,]+)\s*in\s*([A-Z]{3})/i.exec(t);
  if (pay) out.price = (pay[2].toUpperCase() === "JPY" ? "\u00a5" : pay[2] + " ") + pay[1];
  else { const p2 = /Price\s*\(for[^)]*\)\s*approx\.?\s*[A-Z]{3}\s*[\d,]+\s*\u00a5\s*([\d,]+)/i.exec(t); if (p2) out.price = "\u00a5" + p2[1]; }
  const home = /approx\.?\s*([A-Z]{3})\s*([\d,]+)/i.exec(t); if (home && home[1] !== "JPY") out.priceHome = home[1] + " " + home[2];
  const free = /(?:until)\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})(?:\s+\d{1,2}:\d{2})?\s*:\s*\u00a5\s*0/i.exec(t) || /full refund if you cancel before\s+(?:\d{1,2}:\d{2}\s+on\s+)?(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i.exec(t);
  if (free) out.freeCancelUntil = dmy(free[1]);
  const em = /sent to\s+([\w.+-]+@[\w-]+\.[\w.]+)/i.exec(t); if (em) out.email = em[1].replace(/\.+$/, "");
  const rq = /Special Requests?\s*[\u201c"]\s*(.+?)\s*[\u201d"]/i.exec(t); if (rq) out.requests = rq[1];
  const notes = [];
  if (/inform .{3,60} in advance of your expected arrival time/i.test(t)) notes.push("Tell the property your arrival time in advance.");
  if (/accommodation tax per person per night is not included/i.test(t)) notes.push("Accommodation tax is paid at the property.");
  if (/Changing the dates of your stay is not possible/i.test(t)) notes.push("Dates cannot be changed.");
  if (/no front desk|self check/i.test(t)) notes.push("Self check-in.");
  out.notes = notes.join(" ");

  /* generic (non Booking.com) fallbacks */
  if (!out.confirmation) { const c = /(?:confirmation|booking|reservation|itinerary)\s*(?:number|no\.?|code|id|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9.\-]{4,19})/i.exec(t); if (c) out.confirmation = c[1]; }
  if (!out.checkIn) { const c = /(?:check-?in|arrival)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})/i.exec(t); if (c) out.checkIn = anyDate(c[1]); }
  if (!out.checkOut) { const c = /(?:check-?out|departure)\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4})/i.exec(t); if (c) out.checkOut = anyDate(c[1]); }
  return out;
}
function anyDate(s) {
  if (isIso(s)) return s;
  let m = new RegExp("(\\d{1,2})\\s+" + MON + "\\s+(\\d{4})", "i").exec(s); if (m) return isoOf(+m[3], monthIndex(m[2]), +m[1]);
  m = new RegExp(MON + "\\s+(\\d{1,2}),?\\s+(\\d{4})", "i").exec(s); if (m) return isoOf(+m[3], monthIndex(m[1]), +m[2]);
  return "";
}
const SCORE = ["name", "address", "phone", "lat", "checkIn", "checkOut", "confirmation", "room"];
const score = r => SCORE.filter(k => r[k] || r[k] === 0).length;

/* The PDF's stored order and its visual order can differ, so read both and keep the best value for every field. */
export function parseHotelPages(pages, opts = {}) {
  const a = parseHotelText(streamText(pages), opts), b = parseHotelText(visualText(pages), opts);
  const [best, other] = score(a) >= score(b) ? [a, b] : [b, a];
  const res = Object.assign({}, best);
  for (const k of Object.keys(res)) if ((res[k] === "" || res[k] === 0 || res[k] == null) && other[k]) res[k] = other[k];
  return finish(res);
}
function finish(r) {
  const missing = [];
  if (!r.name) missing.push("name"); if (!r.checkIn) missing.push("check-in date"); if (!r.checkOut) missing.push("check-out date");
  if (!r.address) missing.push("address"); if (!r.phone) missing.push("phone"); if (r.lat == null) missing.push("GPS location");
  return { hotel: r, missing, ok: !!(r.name && r.checkIn && r.checkOut) };
}
export { finish as summarise };
