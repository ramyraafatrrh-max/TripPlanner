/* util.js - small pure helpers: ids, dates, strings, distance, time zones. No UI in here. */
export const uid = (p = "id") => p + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const randomTopic = () => "trip-" + Array.from(crypto.getRandomValues(new Uint8Array(9)), b => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
export const clip = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1).trimEnd() + "\u2026" : s; };
export const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\u3040-\u9fff]+/g, " ").trim();
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function download(name, text, mime = "text/plain") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: mime + ";charset=utf-8" })); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- dates (ISO strings "YYYY-MM-DD", all maths in UTC so time zones never shift a date) ---------- */
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = n => String(n).padStart(2, "0");
const D = iso => { const [y, m, d] = String(iso).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const monthIndex = s => MON.findIndex(m => m.toLowerCase() === String(s).slice(0, 3).toLowerCase());
export const weekdayIndex = s => DOW.findIndex(d => d.toLowerCase() === String(s).slice(0, 3).toLowerCase());
export const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const isIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
export const dow = iso => (isIso(iso) ? DOW[D(iso).getUTCDay()] : "");
export const dayNum = iso => (isIso(iso) ? D(iso).getUTCDate() : "");
export const monName = iso => (isIso(iso) ? MON[D(iso).getUTCMonth()] : "");
export const fmtDate = iso => (isIso(iso) ? `${dow(iso)} ${dayNum(iso)} ${monName(iso)}` : "");
export const fmtShort = iso => (isIso(iso) ? `${dayNum(iso)} ${monName(iso)}` : "");
export const fmtLong = iso => (isIso(iso) ? `${dow(iso)} ${dayNum(iso)} ${MONTH_NAMES[D(iso).getUTCMonth()]} ${D(iso).getUTCFullYear()}` : "");
export const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 86400000);
export const addDays = (iso, n) => { const d = D(iso); d.setUTCDate(d.getUTCDate() + n); return isoOf(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
/* A date without a year ("17 DECEMBER Thursday") is resolved by checking which candidate year has that weekday. */
export function yearFor(day, month, weekday, hints) {
  for (const y of hints) { if (weekday < 0) return y; if (new Date(Date.UTC(y, month, day)).getUTCDay() === weekday) return y; }
  return hints[0];
}
export function todayIn(tz) {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  catch (e) { return new Date().toISOString().slice(0, 10); }
}
export function nowHM(tz) {
  try { return new Intl.DateTimeFormat("en-GB", { timeZone: tz || undefined, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); }
  catch (e) { return new Date().toTimeString().slice(0, 5); }
}

/* ---------- distance ---------- */
export function haversine(a, b) {
  const R = 6371, rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
export const fmtKm = km => (km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km");
export const hasPt = s => !!s && Number.isFinite(+s.lat) && Number.isFinite(+s.lng) && s.lat !== "" && s.lng !== "" && s.lat !== null && s.lng !== null;

export const shortName = n => String(n || "").replace(/\s*\(.*$/, "").split(/[:\u2014\u2013]|\s-\s/)[0].trim() || String(n || "");

/* ---------- time zone of a city (used so the morning alert fires at the local time of each day) ---------- */
const TZ_RULES = [
  [/hong kong|kowloon|macau/, "Asia/Hong_Kong"], [/tokyo|osaka|kyoto|nara|kobe|yokohama|japan|kansai|minoh|kawaguchi|fuji|hakone|nikko|kamakura/, "Asia/Tokyo"], [/seoul|busan|korea/, "Asia/Seoul"],
  [/beijing|shanghai|shenzhen|guangzhou|china|taipei|taiwan/, "Asia/Shanghai"], [/singapore/, "Asia/Singapore"], [/bangkok|phuket|chiang|thailand/, "Asia/Bangkok"],
  [/bali|jakarta|indonesia/, "Asia/Jakarta"], [/hanoi|ho chi minh|saigon|vietnam/, "Asia/Ho_Chi_Minh"], [/kuala lumpur|malaysia/, "Asia/Kuala_Lumpur"],
  [/delhi|mumbai|bangalore|india|goa|jaipur/, "Asia/Kolkata"], [/dubai|abu dhabi|uae|emirates/, "Asia/Dubai"], [/doha|qatar/, "Asia/Qatar"], [/riyadh|jeddah|saudi/, "Asia/Riyadh"],
  [/istanbul|turkey|ankara|antalya/, "Europe/Istanbul"], [/cairo|giza|luxor|egypt|sharm|hurghada/, "Africa/Cairo"], [/marrakech|casablanca|morocco/, "Africa/Casablanca"],
  [/nairobi|kenya|zanzibar|tanzania/, "Africa/Nairobi"], [/cape town|johannesburg|south africa/, "Africa/Johannesburg"],
  [/london|edinburgh|england|scotland/, "Europe/London"], [/dublin|ireland/, "Europe/Dublin"], [/lisbon|porto|portugal/, "Europe/Lisbon"], [/athens|greece|santorini|crete/, "Europe/Athens"],
  [/paris|lyon|nice\b|france|rome|milan|venice|florence|italy|madrid|barcelona|spain|berlin|munich|germany|amsterdam|netherlands|brussels|vienna|prague|budapest|zurich|geneva|swiss|copenhagen|stockholm|oslo|warsaw|croatia|dubrovnik/, "Europe/Paris"],
  [/new york|boston|miami|washington|toronto|montreal|orlando/, "America/New_York"], [/chicago|dallas|houston|austin|new orleans|mexico city/, "America/Chicago"],
  [/los angeles|san francisco|seattle|las vegas|san diego|vancouver|california/, "America/Los_Angeles"], [/hawaii|honolulu/, "Pacific/Honolulu"],
  [/rio|sao paulo|brazil|buenos aires|argentina/, "America/Sao_Paulo"], [/sydney|melbourne|canberra|australia/, "Australia/Sydney"], [/auckland|queenstown|new zealand/, "Pacific/Auckland"]
];
export function cityToTz(city) {
  const c = String(city || "").toLowerCase();
  for (const [re, tz] of TZ_RULES) if (re.test(c)) return tz;
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; }
}
export const COMMON_TZ = ["Africa/Cairo", "Africa/Johannesburg", "America/Chicago", "America/Los_Angeles", "America/New_York", "Asia/Bangkok", "Asia/Dubai", "Asia/Hong_Kong", "Asia/Kolkata", "Asia/Seoul", "Asia/Shanghai", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Europe/Athens", "Europe/Istanbul", "Europe/London", "Europe/Paris", "Pacific/Auckland", "UTC"];
