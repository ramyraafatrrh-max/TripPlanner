/* flight.js - reads flight confirmations. Written against an Emirates "Your itinerary" PDF
   ("CAI Cairo DXB Dubai 00:50 Thursday 17 Dec 26 06:10 Thursday 17 Dec 26 Flight EK926 ..."), with a generic fallback
   that looks for flight numbers near airport codes, times and dates. */
import { monthIndex, isoOf, isIso } from "../../core/util.js";
import { cleanText } from "./hotel.js";
import { streamText, visualText } from "./pdftext.js";

const MON = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*";
const WD = "(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*";
const yr = y => (y.length === 2 ? 2000 + +y : +y);
const AIRLINES = new Set("EK QR MS TK EY SV LH BA AF KL NH JL SQ CX TG KE OZ CA MU AA UA DL AC LX OS IB AZ TP SU WY GF RJ ET KQ SA QF NZ VS AI 6E UL MH GA PR VN BR CI".split(" "));
const NOT_AIRPORT = new Set(["THE", "AND", "FOR", "PNR", "VAT", "PAX", "ETA", "ETD", "ADT", "CHD", "INF", "USD", "EUR", "EGP", "JPY", "AED", "GBP", "FLT", "ECO", "BAG", "SEAT", "MEAL", "ALL"]);

function bookingRef(t, fileName) {
  const m = /(?:Booking\s*(?:reference|ref\.?)|Reservation\s*(?:code|number)|PNR|Confirmation\s*(?:code|number))\s*[:#]?\s*([A-Z0-9]{5,8})\b/i.exec(t);
  if (m && /\d|[A-Z]{6}/.test(m[1]) && !/^(NUMBER|DETAILS)$/i.test(m[1])) return m[1].toUpperCase();
  const f = /itinerary\s*-\s*([A-Z0-9]{6})\b/i.exec(fileName || ""); return f ? f[1].toUpperCase() : "";
}
export function parseFlightText(raw, opts = {}) {
  const t = cleanText(raw), flights = [], ref = bookingRef(t, opts.fileName);
  const seg = new RegExp("\\b([A-Z]{3})\\s+([A-Z][A-Za-z.'\\- ]{1,30}?)\\s+([A-Z]{3})\\s+([A-Z][A-Za-z.'\\- ]{1,30}?)\\s+(\\d{1,2}:\\d{2})\\s+" + WD + "\\s+(\\d{1,2})\\s+" + MON + "\\s+(\\d{2,4})\\s+(\\d{1,2}:\\d{2})\\s+" + WD + "\\s+(\\d{1,2})\\s+" + MON + "\\s+(\\d{2,4})\\s+Flight\\s+([A-Z0-9]{2})\\s?(\\d{1,4})", "g");
  let m;
  while ((m = seg.exec(t))) {
    flights.push({ number: `${m[13]} ${m[14]}`, date: isoOf(yr(m[8]), monthIndex(m[7]), +m[6]), from: m[1], fromCity: m[2].trim(), to: m[3], toCity: m[4].trim(), depart: m[5], arrive: m[9], arriveDate: isoOf(yr(m[12]), monthIndex(m[11]), +m[10]), booking: ref, notes: "" });
  }
  if (flights.length) return flights.map(fix);
  /* generic: each flight number, then the nearest airport codes, times and a date around it */
  const re = /\b([A-Z][A-Z0-9])\s?(\d{2,4})\b/g;
  while ((m = re.exec(t))) {
    if (!AIRLINES.has(m[1])) continue;
    const win = t.slice(Math.max(0, m.index - 170), m.index + 200);
    const codes = [...win.matchAll(/\b([A-Z]{3})\b/g)].map(x => x[1]).filter(c => !NOT_AIRPORT.has(c));
    const times = [...win.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map(x => x[1]);
    const d = new RegExp("(\\d{1,2})\\s+" + MON + "[a-z]*\\.?\\s*,?\\s*(\\d{2,4})?", "i").exec(win) || new RegExp(MON + "[a-z]*\\.?\\s+(\\d{1,2}),?\\s*(\\d{4})?", "i").exec(win);
    let date = "";
    if (d) { const day = /^\d/.test(d[1]) ? +d[1] : +d[2], mon = monthIndex(/^\d/.test(d[1]) ? d[2] : d[1]); const y = (/^\d/.test(d[1]) ? d[3] : d[3]) ? yr(String(/^\d/.test(d[1]) ? d[3] : d[3])) : (opts.year || new Date().getFullYear()); if (mon >= 0) date = isoOf(y, mon, day); }
    const key = `${m[1]} ${m[2]}`;
    if (!flights.some(f => f.number === key && f.date === date)) flights.push({ number: key, date, from: codes[0] || "", to: codes[1] || "", depart: times[0] || "", arrive: times[1] || "", booking: ref, notes: "" });
  }
  return flights.filter(f => f.date || f.from).map(fix);
}
function fix(f) { if (f.date && !isIso(f.date)) f.date = ""; return f; }
export function parseFlightPages(pages, opts = {}) {
  const a = parseFlightText(streamText(pages), opts), b = parseFlightText(visualText(pages), opts);
  return a.length >= b.length ? a : b;
}
