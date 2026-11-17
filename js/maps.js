/* maps.js - Google Maps links, embeds and (with your own key) a full map with numbered pins */
import { settings, save } from "./store.js";

const enc = encodeURIComponent;

export const placeUrl = q => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`;
export const dirUrl = (q, mode = "transit") => `https://www.google.com/maps/dir/?api=1&destination=${enc(q)}&travelmode=${mode}`;

/* Day route links. Google Maps accepts up to 9 waypoints per link, so long days are split. */
export function routeUrls(stops, opts = {}) {
  const mode = opts.mode || "transit";
  const qs = stops.map(s => s.query || s.name).filter(Boolean);
  if (opts.origin) qs.unshift(opts.origin);
  const out = [];
  if (!qs.length) return out;
  if (qs.length === 1) return [{ label: "Open place", url: placeUrl(qs[0]) }];
  const chunk = 10; // origin + 8 waypoints + destination
  for (let i = 0; i < qs.length - 1; i += chunk - 1) {
    const part = qs.slice(i, i + chunk);
    if (part.length < 2) break;
    const origin = part[0], dest = part[part.length - 1], via = part.slice(1, -1);
    let url = `https://www.google.com/maps/dir/?api=1&origin=${enc(origin)}&destination=${enc(dest)}&travelmode=${mode}`;
    if (via.length) url += `&waypoints=${enc(via.join("|"))}`;
    out.push({ label: "", url });
  }
  out.forEach((o, i) => (o.label = out.length > 1 ? `Route part ${i + 1} of ${out.length}` : "Open full route"));
  return out;
}

/* Route from the device's current location to the next unvisited stop (opens the Maps app) */
export function nextStopUrl(stop, mode = "transit") { return dirUrl(stop.query || stop.name, mode); }

/* ---------- iframes ---------- */
export function placeEmbedSrc(q) {
  const key = settings().mapsKey;
  if (key) return `https://www.google.com/maps/embed/v1/place?key=${enc(key)}&q=${enc(q)}&zoom=15`;
  return `https://maps.google.com/maps?q=${enc(q)}&z=15&output=embed`;
}
export function routeEmbedSrc(stops, mode = "transit") {
  const qs = stops.map(s => s.query || s.name).filter(Boolean);
  if (qs.length < 2) return qs.length ? placeEmbedSrc(qs[0]) : "";
  const key = settings().mapsKey;
  if (key) {
    // The Embed API cannot route transit with waypoints, so it draws a walking route through every stop.
    const via = qs.slice(1, -1).slice(0, 20);
    let u = `https://www.google.com/maps/embed/v1/directions?key=${enc(key)}&origin=${enc(qs[0])}&destination=${enc(qs[qs.length - 1])}&mode=walking`;
    if (via.length) u += `&waypoints=${enc(via.join("|"))}`;
    return u;
  }
  const dest = qs.slice(1).map(enc).join("+to:");
  return `https://maps.google.com/maps?saddr=${enc(qs[0])}&daddr=${dest}&dirflg=r&output=embed`;
}

/* ---------- Maps JavaScript API (optional, needs your own key) ---------- */
let gPromise = null;
export function loadGoogle(key) {
  if (window.google && window.google.maps) return Promise.resolve(window.google);
  if (gPromise) return gPromise;
  gPromise = new Promise((resolve, reject) => {
    window.__gmapsReady = () => resolve(window.google);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${enc(key)}&callback=__gmapsReady&loading=async`;
    s.async = true;
    s.onerror = () => { gPromise = null; reject(new Error("Could not load Google Maps")); };
    document.head.appendChild(s);
    setTimeout(() => { if (!(window.google && window.google.maps)) { gPromise = null; reject(new Error("Google Maps timed out")); } }, 15000);
  });
  return gPromise;
}

function geocodeOne(geocoder, query) {
  const cache = settings().geo;
  if (cache[query]) return Promise.resolve(cache[query]);
  return new Promise(resolve => {
    geocoder.geocode({ address: query }, (res, status) => {
      if (status === "OK" && res[0]) {
        const loc = res[0].geometry.location;
        const v = { lat: loc.lat(), lng: loc.lng() };
        cache[query] = v; save();
        resolve(v);
      } else resolve(null);
    });
  });
}

/* Draws numbered pins and a line through the day's stops. Returns a cleanup function. */
export async function drawDayMap(container, stops, onPick) {
  const key = settings().mapsKey;
  const google = await loadGoogle(key);
  await google.maps.importLibrary("maps");
  await google.maps.importLibrary("geocoding");
  const map = new google.maps.Map(container, { zoom: 12, center: { lat: 35.68, lng: 139.76 }, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
  const geocoder = new google.maps.Geocoder();
  const bounds = new google.maps.LatLngBounds();
  const path = [];
  let n = 0;
  for (const s of stops) {
    n++;
    const pos = await geocodeOne(geocoder, s.query || s.name);
    if (!pos) continue;
    path.push(pos);
    bounds.extend(pos);
    const m = new google.maps.Marker({ position: pos, map, label: { text: String(n), color: "#fff", fontWeight: "700" }, title: s.name, opacity: s.visited ? 0.55 : 1 });
    m.addListener("click", () => onPick && onPick(s));
  }
  if (path.length > 1) new google.maps.Polyline({ path, map, strokeColor: "#1155CC", strokeOpacity: 0.75, strokeWeight: 4 });
  if (!bounds.isEmpty()) map.fitBounds(bounds, 40);
  return () => { container.innerHTML = ""; };
}
