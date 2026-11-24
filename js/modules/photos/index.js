/* photos module: banner pictures from the cities in the trip. Photos come from Wikipedia and Wikimedia Commons (free licences,
   no key) with a credit link; they are remembered on the phone. Trips with no city photo yet show a general travel picture. */
import { h } from "../../core/dom.js";
import { ic } from "../../core/icons.js";
import * as store from "../../core/store.js";
import { setBackground, toast } from "../../core/ui.js";
import { bus } from "../../core/bus.js";

const WP = "https://en.wikipedia.org/w/api.php", CM = "https://commons.wikimedia.org/w/api.php", TTL = 30 * 86400000, NEG = 86400000;
const BAD = /flag|map|locator|location|seal|coat[ _]of|logo|emblem|diagram|chart|symbol|icon|portrait|signature|plan[ _]of|\.svg|\.gif|\.webm|\.ogv/i;
const PLACE = /city|town|capital|region|island|prefecture|province|district|village|municipality|county|state|territory|administrative|metropolis|commune|resort|archipelago/i;
const SKIP = new Set(["arrival", "departure", "transit", "travel", "flight", "flights", "day", "home", "airport", "hotel", "free", "rest", "optional", "itinerary", "trip", "the", "and"]);
const NOISE = new Set(["trip", "holiday", "vacation", "christmas", "summer", "winter", "spring", "autumn", "family", "road", "weekend", "honeymoon", "adventure", "tour", "journey", "my", "our", "new", "year", "plan", "updated", "itinerary", "version", "by", "area"]);
const qs = o => "?" + Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
const api = async (base, p) => { const r = await fetch(base + qs(Object.assign({ format: "json", formatversion: 2, origin: "*" }, p))); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); };
const strip = s => String(s || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const key = n => String(n).trim().toLowerCase();
const cache = () => store.settings().photos || (store.settings().photos = {});

function splitNames(raw) { return String(raw || "").split(/\s*(?:&|\/|,|;|\+|\u2192|->|\band\b)\s*/i).map(s => s.trim()).filter(s => s && s.length <= 40 && !/\d/.test(s) && !SKIP.has(s.toLowerCase())); }
export function deriveCities(trip) {
  const seen = new Set(), out = []; const add = raw => splitNames(raw).forEach(n => { if (!seen.has(key(n))) { seen.add(key(n)); out.push(n); } });
  trip.days.forEach(d => add(d.city)); trip.days.forEach(d => d.stops.forEach(s => add(s.city)));
  if (!out.length) (String(trip.name || "").match(/[A-Z\u00C0-\u024F][\w\u00C0-\u024F'\u2019-]+(?:\s+[A-Z\u00C0-\u024F][\w\u00C0-\u024F'\u2019-]+)*/g) || []).forEach(w => { if (!NOISE.has(w.toLowerCase())) add(w); });
  return out.slice(0, 8);
}
export const cityList = trip => (trip.cities && trip.cities.length ? trip.cities.slice(0, 8) : deriveCities(trip));

const okImg = (file, th) => th && th.source && !BAD.test(String(file || "") + " " + th.source) && !(th.width && th.height && th.width / th.height < 1.15);
async function credit(file) { try { const j = await api(CM, { action: "query", titles: "File:" + String(file).replace(/^File:/i, ""), prop: "imageinfo", iiprop: "extmetadata", iiextmetadatafilter: "Artist|LicenseShortName" }); const m = j.query.pages[0].imageinfo[0].extmetadata; return { artist: strip(m.Artist && m.Artist.value).slice(0, 60), license: strip(m.LicenseShortName && m.LicenseShortName.value).slice(0, 30) }; } catch (e) { return { artist: "", license: "" }; } }
async function lookup(name) {
  try {
    const j = await api(WP, { action: "query", generator: "search", gsrsearch: name, gsrlimit: 5, gsrnamespace: 0, prop: "pageimages|coordinates|pageprops|description", piprop: "thumbnail|name", pithumbsize: 1024, ppprop: "disambiguation", colimit: "max" });
    const pages = ((j.query && j.query.pages) || []).slice().sort((a, b) => (a.index || 99) - (b.index || 99)).filter(p => !(p.pageprops && p.pageprops.disambiguation));
    const hit = pages.filter(p => (p.coordinates && p.coordinates.length) || PLACE.test(p.description || "")).find(p => okImg(p.pageimage, p.thumbnail));
    if (hit) { const c = await credit(hit.pageimage); return { city: name, url: hit.thumbnail.source, page: "https://en.wikipedia.org/wiki/File:" + encodeURIComponent(hit.pageimage.replace(/ /g, "_")), artist: c.artist, license: c.license }; }
  } catch (e) { /* try Commons */ }
  try {
    const j = await api(CM, { action: "query", generator: "search", gsrsearch: `${name} skyline filetype:bitmap`, gsrnamespace: 6, gsrlimit: 8, prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: 1024, iiextmetadatafilter: "Artist|LicenseShortName" });
    for (const p of ((j.query && j.query.pages) || []).sort((a, b) => (a.index || 99) - (b.index || 99))) { const i = p.imageinfo && p.imageinfo[0]; if (!i || i.mime !== "image/jpeg" || BAD.test(p.title) || !i.thumburl || i.width < 1600 || i.width / i.height < 1.4) continue; const m = i.extmetadata || {}; return { city: name, url: i.thumburl, page: "https://commons.wikimedia.org/wiki/" + encodeURIComponent(p.title.replace(/ /g, "_")), artist: strip(m.Artist && m.Artist.value).slice(0, 60), license: strip(m.LicenseShortName && m.LicenseShortName.value).slice(0, 30) }; }
  } catch (e) { /* none */ }
  return null;
}
const inflight = new Map();
export function cached(name) { const e = cache()[key(name)]; if (!e) return undefined; return Date.now() - e.t < (e.v ? TTL : NEG) ? e.v : undefined; }
export function cityPhoto(name, force) {
  const k = key(name); if (!force) { const c = cached(name); if (c !== undefined) return Promise.resolve(c); }
  if (inflight.has(k)) return inflight.get(k);
  const p = lookup(name.trim()).then(v => { cache()[k] = { t: Date.now(), v }; store.save(true); return v; }, () => null).finally(() => inflight.delete(k)); inflight.set(k, p); return p;
}
export const cachedPhotos = trip => cityList(trip).map(cached).filter(Boolean);
export const tripPhotos = async (trip, force) => (await Promise.all(cityList(trip).map(n => cityPhoto(n, force)))).filter(Boolean);
const creditText = p => ["Photo", p.artist, p.license].filter(Boolean).join(" \u00B7 ") + " \u00B7 Wikimedia";
const reduce = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

function coverSection(trip, day, inner) {
  const generic = store.coverUrl(store.coverKey(trip));
  const layers = h("div", { class: "layers" }), chips = h("div", { class: "citychips" }), credit1 = h("a", { class: "credit", target: "_blank", rel: "noopener", hidden: true }), sec = h("section", { class: "cover" }, layers, chips, credit1, inner);
  let list = [], idx = 0, timer = null;
  const paint = urls => layers.replaceChildren(...urls.map((u, i) => h("div", { class: "photo" + (i === 0 ? " on" : ""), style: { backgroundImage: `url("${u}")` } })));
  const show = i => { idx = i; [...layers.children].forEach((el, k) => el.classList.toggle("on", k === i)); [...chips.children].forEach((el, k) => el.classList.toggle("on", k === i)); const p = list[i]; if (p) { credit1.hidden = false; credit1.textContent = creditText(p); credit1.href = p.page || "#"; } };
  const start = all => {
    clearInterval(timer);
    const text = [day && day.city, ...((day && day.stops) || []).map(s => s.city)].join(" ").toLowerCase(), firstP = all.find(p => text.includes(p.city.toLowerCase())) || all[0];
    list = [firstP, ...all.filter(p => p !== firstP)]; paint(list.map(p => p.url)); chips.replaceChildren(...list.map((p, i) => h("button", { type: "button", class: "citychip" + (i === 0 ? " on" : ""), "aria-label": "Show " + p.city, onclick: () => { clearInterval(timer); show(i); } }, p.city))); show(0); setBackground(list[0].url);
    if (list.length > 1 && !reduce()) timer = setInterval(() => { if (!sec.isConnected) clearInterval(timer); else show((idx + 1) % list.length); }, 7000);
  };
  if (trip.cover) { paint([generic]); return sec; }
  const have = cachedPhotos(trip); if (have.length) start(have); else paint([generic]);
  tripPhotos(trip).then(all => { if (sec.isConnected && all.length && all.map(p => p.url).join() !== list.map(p => p.url).join()) start(all); });
  return sec;
}
function thumb(trip) { if (!trip.cover) { const p = cachedPhotos(trip)[0]; if (p) return p.url; } return store.coverUrl(store.coverKey(trip)); }

function settingsCard(trip) {
  const picker = h("div", { class: "coverpick", role: "radiogroup", "aria-label": "Cover picture" });
  const pick = (id, label, img) => picker.append(h("button", { type: "button", role: "radio", "aria-checked": (trip.cover || "") === id, "aria-label": label, class: (trip.cover || "") === id ? "on" : "", style: { backgroundImage: `url("${img}")` }, onclick: () => { trip.cover = id; store.save(); bus.emit("route-refresh"); } }, h("span", null, label)));
  pick("", "Photos of my cities", thumb({ cover: "", cities: trip.cities, days: trip.days, name: trip.name, id: trip.id })); store.COVERS.forEach(c => pick(c.id, c.label, store.coverUrl(c.id)));
  const box = h("div");
  const draw = () => {
    const list = cityList(trip);
    const chips = h("div", { class: "chipset" }, list.map(n => { const c = cached(n); return h("span", { class: "tag" + (c ? " ok" : c === null ? " none" : "") }, c ? ic("check", 12, 2.6) : null, n, h("button", { type: "button", "aria-label": "Remove " + n, onclick: () => { trip.cities = cityList(trip).filter(x => x !== n); store.save(); draw(); look(); } }, ic("x", 12, 2.4))); }));
    if (!list.length) chips.append(h("span", { class: "muted" }, "No cities yet. Add one below."));
    const add = h("input", { type: "text", placeholder: "Add a city, e.g. Lisbon", "aria-label": "Add a city" });
    const doAdd = () => { const v = add.value.trim(); if (!v) return; const cur = cityList(trip); if (!cur.some(x => key(x) === key(v))) { trip.cities = [...cur, v].slice(0, 8); store.save(); } add.value = ""; draw(); look(); };
    add.addEventListener("keydown", e => { if (e.key === "Enter") doAdd(); });
    const credits = cachedPhotos(trip);
    box.replaceChildren(chips, h("div", { class: "row nowrap", style: { marginTop: "10px" } }, h("div", { class: "grow" }, add), h("button", { class: "btn small gold", type: "button", onclick: doAdd }, ic("plus", 15), "Add")),
      h("div", { class: "row", style: { gap: "8px", marginTop: "10px" } }, h("button", { class: "btn small glass", type: "button", onclick: () => { trip.cities = []; store.save(); draw(); look(true); } }, "Detect from my itinerary"), h("button", { class: "btn small glass", type: "button", onclick: () => { look(true); toast("Looking for new photos\u2026"); } }, ic("refresh", 14), "Refresh photos")),
      credits.length ? h("p", { class: "muted small", style: { marginTop: "10px" } }, "Photos: ", credits.map((p, i) => [i ? ", " : "", h("a", { href: p.page, target: "_blank", rel: "noopener" }, p.city)]), ". Wikimedia Commons and Wikipedia, free licences.") : null);
  };
  const look = force => tripPhotos(trip, !!force).then(() => { if (box.isConnected) draw(); });
  draw(); look(false);
  return h("div", { class: "glass card" }, h("span", { class: "eyebrow" }, "Look"), h("h3", { style: { marginTop: "4px" } }, "Banner pictures"), h("p", { class: "muted" }, "By default the banner shows photos of the cities in this trip. Or pick one fixed picture."), picker, h("div", { class: "eyebrow", style: { margin: "16px 0 6px" } }, "Cities for the photos"), box);
}

export default {
  id: "photos", version: "2.0.0", title: "City photo banners",
  description: "Banner photos of the cities in each trip, with credits. Needs an internet connection the first time.",
  init(ctx) { ctx.service("banner", { coverSection, thumb, cityList }); ctx.settingsSection({ id: "photos", scope: "trip", order: 20, render: settingsCard }); }
};
