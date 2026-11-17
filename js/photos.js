/* photos.js - banner pictures for the cities in a trip.
   Photos come from Wikipedia and Wikimedia Commons (free licences, no key). Each photo keeps a credit link.
   Results are remembered on the phone, and the images themselves are cached by the service worker, so banners work offline once seen. */
import { settings, save, coverUrl, coverKey } from "./store.js";

const WP = "https://en.wikipedia.org/w/api.php";
const CM = "https://commons.wikimedia.org/w/api.php";
const TTL = 30 * 86400000, NEG_TTL = 86400000;
const BAD_FILE = /flag|map|locator|location|seal|coat[ _]of|logo|emblem|diagram|chart|symbol|icon|portrait|signature|plan[ _]of|\.svg|\.gif|\.webm|\.ogv/i;
const PLACE_DESC = /city|town|capital|region|island|prefecture|province|district|village|municipality|county|state|territory|administrative|metropolis|commune|resort|archipelago/i;
const SKIP_WORDS = new Set(["arrival", "departure", "transit", "travel", "flight", "flights", "day", "home", "airport", "hotel", "free", "rest", "optional", "itinerary", "trip", "the", "and"]);
const NAME_NOISE = new Set(["trip", "holiday", "vacation", "christmas", "summer", "winter", "spring", "autumn", "family", "road", "weekend", "honeymoon", "adventure", "tour", "journey", "markets", "lights", "my", "our", "new", "year", "years", "plan", "updated", "itinerary", "japan"]);

const qs = o => "?" + Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
async function api(base, params) {
  const res = await fetch(base + qs(Object.assign({ format: "json", formatversion: 2, origin: "*" }, params)));
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
const strip = h => String(h || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();
const fileUrl = name => "https://en.wikipedia.org/wiki/File:" + encodeURIComponent(String(name).replace(/^File:/i, "").replace(/ /g, "_"));
const articleUrl = title => "https://en.wikipedia.org/wiki/" + encodeURIComponent(String(title).replace(/ /g, "_"));
const keyOf = name => String(name).trim().toLowerCase();

/* ---------- which cities does this trip visit? ---------- */
function splitNames(raw) {
  return String(raw || "").split(/\s*(?:&|\/|,|;|\+|\u2192|->|\band\b)\s*/i).map(s => s.replace(/\s+/g, " ").trim()).filter(s => s && s.length <= 40 && !/\d/.test(s) && !SKIP_WORDS.has(s.toLowerCase()));
}
export function deriveCities(trip) {
  const seen = new Set(), out = [];
  const add = raw => splitNames(raw).forEach(n => { const k = keyOf(n); if (!seen.has(k)) { seen.add(k); out.push(n); } });
  trip.days.forEach(d => add(d.city));
  trip.days.forEach(d => d.stops.forEach(s => add(s.city)));
  if (!out.length) {
    const words = String(trip.name || "").match(/[A-Z\u00C0-\u024F][\w\u00C0-\u024F'\u2019-]+(?:\s+[A-Z\u00C0-\u024F][\w\u00C0-\u024F'\u2019-]+)*/g) || [];
    words.forEach(w => { if (!NAME_NOISE.has(w.toLowerCase())) add(w); });
  }
  return out.slice(0, 8);
}
export function cityList(trip) {
  return Array.isArray(trip.cities) && trip.cities.length ? trip.cities.slice(0, 8) : deriveCities(trip);
}

/* ---------- finding one good photo ---------- */
function acceptable(file, th) {
  if (!th || !th.source) return false;
  if (BAD_FILE.test(String(file || "") + " " + th.source)) return false;
  if (th.width && th.height && th.width / th.height < 1.15) return false;
  return true;
}
async function creditFor(file) {
  try {
    const j = await api(CM, { action: "query", titles: "File:" + String(file).replace(/^File:/i, ""), prop: "imageinfo", iiprop: "extmetadata", iiextmetadatafilter: "Artist|LicenseShortName" });
    const m = j.query && j.query.pages && j.query.pages[0] && j.query.pages[0].imageinfo && j.query.pages[0].imageinfo[0] && j.query.pages[0].imageinfo[0].extmetadata;
    if (m) return { artist: strip(m.Artist && m.Artist.value).slice(0, 60), license: strip(m.LicenseShortName && m.LicenseShortName.value).slice(0, 30) };
  } catch (e) { /* credit is optional */ }
  return { artist: "", license: "" };
}
async function fromArticle(name) {
  const j = await api(WP, {
    action: "query", generator: "search", gsrsearch: name, gsrlimit: 5, gsrnamespace: 0,
    prop: "pageimages|coordinates|pageprops|description", piprop: "thumbnail|name", pithumbsize: 1024, ppprop: "disambiguation", colimit: "max"
  });
  const pages = ((j.query && j.query.pages) || []).slice().sort((a, b) => (a.index || 99) - (b.index || 99)).filter(p => !(p.pageprops && p.pageprops.disambiguation));
  const places = pages.filter(p => (p.coordinates && p.coordinates.length) || PLACE_DESC.test(p.description || ""));
  let best = null;
  for (const p of places) {
    if (acceptable(p.pageimage, p.thumbnail)) { best = p; break; }
  }
  return { title: (places[0] || {}).title || "", hit: best };
}
async function fromCommons(name) {
  for (const q of [`${name} skyline`, `${name} cityscape panorama`]) {
    const j = await api(CM, {
      action: "query", generator: "search", gsrsearch: `${q} filetype:bitmap`, gsrnamespace: 6, gsrlimit: 10,
      prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: 1024, iiextmetadatafilter: "Artist|LicenseShortName"
    });
    const pages = ((j.query && j.query.pages) || []).slice().sort((a, b) => (a.index || 99) - (b.index || 99));
    for (const p of pages) {
      const i = p.imageinfo && p.imageinfo[0];
      if (!i || i.mime !== "image/jpeg" || BAD_FILE.test(p.title) || !i.thumburl) continue;
      if (i.width < 1600 || i.width / i.height < 1.4) continue;
      const m = i.extmetadata || {};
      return { url: i.thumburl, w: i.thumbwidth, h: i.thumbheight, file: p.title, artist: strip(m.Artist && m.Artist.value).slice(0, 60), license: strip(m.LicenseShortName && m.LicenseShortName.value).slice(0, 30) };
    }
  }
  return null;
}
async function lookup(name) {
  let title = "";
  try {
    const a = await fromArticle(name);
    title = a.title;
    if (a.hit) {
      const cr = await creditFor(a.hit.pageimage);
      return { city: name, title: a.hit.title, url: a.hit.thumbnail.source, file: a.hit.pageimage, page: fileUrl(a.hit.pageimage), article: articleUrl(a.hit.title), artist: cr.artist, license: cr.license };
    }
  } catch (e) { /* try Commons */ }
  try {
    const c = await fromCommons(name);
    if (c) return { city: name, title: title || name, url: c.url, file: c.file, page: fileUrl(c.file), article: title ? articleUrl(title) : "", artist: c.artist, license: c.license };
  } catch (e) { /* none */ }
  return null;
}

/* ---------- cache + de-duplicated requests ---------- */
const inflight = new Map();
function cacheMap() { const s = settings(); if (!s.photos) s.photos = {}; return s.photos; }
export function cachedCity(name) {
  const e = cacheMap()[keyOf(name)];
  if (!e) return undefined;
  const ttl = e.v ? TTL : NEG_TTL;
  return Date.now() - e.t < ttl ? e.v : undefined;
}
export function getCityPhoto(name, force = false) {
  const k = keyOf(name);
  if (!force) { const c = cachedCity(name); if (c !== undefined) return Promise.resolve(c); }
  if (inflight.has(k)) return inflight.get(k);
  const p = lookup(name.trim()).then(v => { cacheMap()[k] = { t: Date.now(), v }; save(true); return v; }, () => null).finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}
/* photos already known, in city order (instant, no network) */
export function cachedPhotos(trip) {
  return cityList(trip).map(n => cachedCity(n)).filter(Boolean);
}
/* look up every city (network only for cities not remembered) */
export async function tripPhotos(trip, force = false) {
  const list = await Promise.all(cityList(trip).map(n => getCityPhoto(n, force)));
  const out = list.filter(Boolean);
  window.dispatchEvent(new CustomEvent("photos-ready", { detail: { id: trip.id } }));
  return out;
}
export async function cityStatus(trip) {
  const res = [];
  for (const n of cityList(trip)) { const c = cachedCity(n); res.push({ name: n, state: c === undefined ? "pending" : c ? "ok" : "none" }); }
  return res;
}
/* put the photo of the city this day is in first */
export function photoForDay(photos, day) {
  if (!photos.length) return null;
  const text = [day && day.city, ...((day && day.stops) || []).map(s => s.city)].join(" ").toLowerCase();
  return photos.find(p => text.includes(p.city.toLowerCase())) || photos[0];
}
export function creditText(p) {
  if (!p) return "";
  return ["Photo", p.artist || "", p.license || ""].filter(Boolean).join(" \u00B7 ") + " \u00B7 Wikimedia";
}

/* the picture behind the screens: a city photo, or the picture the user chose */
export function backdropFor(trip, day) {
  const generic = coverUrl(coverKey(trip));
  if (trip.cover) return generic;
  const p = photoForDay(cachedPhotos(trip), day);
  return p ? p.url : generic;
}
