/* geo.js - finds coordinates for a place name using OpenStreetMap's free search services (no key).
   Answers are remembered on the phone so each place is looked up only once. */
import { settings, save } from "../../core/store.js";
import { sleep, hasPt } from "../../core/util.js";
import { reg } from "../../core/registry.js";

const enc = encodeURIComponent, DAY = 86400000;
let last = 0;
const cache = () => settings().geo || (settings().geo = {});
async function throttle() { const wait = last + 1100 - Date.now(); if (wait > 0) await sleep(wait); last = Date.now(); }
async function getJson(url) { const r = await fetch(url, { headers: { Accept: "application/json" } }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }

export async function geocode(query, near) {
  const key = String(query).trim().toLowerCase(); if (!key) return null;
  const c = cache()[key];
  if (c && (c.ok || Date.now() - c.t < DAY)) return c.ok ? c : null;
  const cfg = reg.config.geocoder || {};
  let found = null;
  try {
    await throttle();
    let url = `${cfg.nominatim}?format=jsonv2&limit=1&accept-language=en&q=${enc(query)}`;
    if (near && hasPt(near)) url += `&viewbox=${near.lng - 0.7},${near.lat + 0.7},${near.lng + 0.7},${near.lat - 0.7}&bounded=0`;
    const j = await getJson(url);
    if (j && j[0]) found = { lat: +j[0].lat, lng: +j[0].lon };
  } catch (e) { /* try the second service */ }
  if (!found) {
    try {
      await throttle();
      let url = `${cfg.photon}?limit=1&lang=en&q=${enc(query)}`;
      if (near && hasPt(near)) url += `&lat=${near.lat}&lon=${near.lng}`;
      const j = await getJson(url);
      const f = j && j.features && j.features[0];
      if (f) found = { lat: +f.geometry.coordinates[1], lng: +f.geometry.coordinates[0] };
    } catch (e) { /* no answer */ }
  }
  cache()[key] = found ? { ok: true, t: Date.now(), lat: found.lat, lng: found.lng } : { ok: false, t: Date.now() };
  save(true);
  return found;
}
/* make sure a stop has coordinates: from its pasted link first, otherwise by searching its name */
export async function locateStop(stop, { city = "", near = null } = {}) {
  if (hasPt(stop)) return true;
  const maps = reg.services.maps;
  if (stop.mapUrl && maps) { const p = maps.parseLink(stop.mapUrl); if (p && Number.isFinite(p.lat)) { stop.lat = p.lat; stop.lng = p.lng; stop.locSrc = "link"; return true; } }
  const base = (stop.query || stop.name || "").trim(); if (!base) return false;
  const q = city && !base.toLowerCase().includes(city.toLowerCase()) ? `${base}, ${city}` : base;
  let g = await geocode(q, near);
  if (!g && stop.name && stop.name !== base) g = await geocode(city ? `${stop.name}, ${city}` : stop.name, near);
  if (g) { stop.lat = g.lat; stop.lng = g.lng; stop.locSrc = "geo"; return true; }
  return false;
}
