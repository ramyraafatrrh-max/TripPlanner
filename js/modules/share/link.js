/* link.js - packs a trip into a link (compressed, in the part after the #, so nothing is stored anywhere) and reads it back. */
import * as store from "../../core/store.js";
import { uid, isIso, clip, randomTopic } from "../../core/util.js";

export const SOFT_LIMIT = 6000;
const clipS = (v, n) => String(v == null ? "" : v).slice(0, n);
const b64u = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = s => { const t = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)); const o = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i); return o; };
async function pipe(bytes, stream) { const w = stream.writable.getWriter(); w.write(bytes).catch(() => {}); w.close().catch(() => {}); return new Uint8Array(await new Response(stream.readable).arrayBuffer()); }

export function slim(trip, level, refs) {
  const keep = (o, keys) => { const r = {}; keys.forEach(k => { if (o[k] !== "" && o[k] != null && o[k] !== false) r[k] = o[k]; }); return r; };
  const L = level === "min" ? 0 : level === "short" ? 140 : 5000;
  const days = trip.days.map(d => Object.assign(keep(d, ["date", "city", "title"]), L ? { transit: clipS(d.transit, L), eats: clipS(d.eats, L), baby: level === "full" ? clipS(d.baby, L) : "" } : {}, {
    stops: d.stops.map(s => Object.assign(keep(s, ["id", "name", "query", "city", "time", "mapUrl", "lat", "lng", "locSrc", "locked", "added", "area"]), L ? { activity: clipS(s.activity, L), transit: level === "full" ? clipS(s.transit, L) : "", baby: level === "full" ? clipS(s.baby, L) : "", eats: level === "full" ? clipS(s.eats, L) : "" } : {})) }));
  const hotels = trip.hotels.map(x => { const o = Object.assign({}, x); if (!refs) { delete o.confirmation; delete o.pin; } return o; });
  const flights = trip.flights.map(x => { const o = Object.assign({}, x); if (!refs) delete o.booking; return o; });
  const live = trip.live && trip.live.r && trip.live.k ? { b: trip.live.b, r: trip.live.r, k: trip.live.k } : undefined;
  return { v: 1, app: "trip-pilot", level, trip: { id: trip.id, name: trip.name, year: trip.year, cover: trip.cover || "", cities: trip.cities || [], sync: live, days, hotels, flights } };
}
export async function encode(data) {
  const json = JSON.stringify(data, (k, v) => (v === "" || v == null || (typeof v === "number" && !Number.isFinite(v)) ? undefined : v));
  if (typeof CompressionStream === "undefined") return "j." + b64u(new TextEncoder().encode(json));
  return "z." + b64u(await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw")));
}
export class LinkError extends Error {}
export async function decode(payload) {
  try {
    const kind = payload.slice(0, 2), raw = unb64u(payload.slice(2));
    const bytes = kind === "z." ? await pipe(raw, new DecompressionStream("deflate-raw")) : raw;
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || data.app !== "trip-pilot" || !data.trip || !Array.isArray(data.trip.days)) throw new Error("not a trip");
    return data;
  } catch (e) { throw new LinkError("This link is incomplete or damaged. Some chat apps cut long links: ask for it again, by email or notes."); }
}
export async function buildOptions(trip, { refs = false } = {}, base) {
  const out = [];
  for (const [id, label] of [["full", "Full details"], ["short", "Shorter descriptions"], ["min", "Names and map places only"]]) {
    const p = await encode(slim(trip, id, refs)), url = `${base}#/t/${p}`; out.push({ id, label, length: url.length, url });
  }
  return out;
}

/* ---------- reading a trip from a link safely ---------- */
function clean(t) {
  const days = (t.days || []).slice(0, 120).filter(d => isIso(d.date)).map(d => ({ id: uid("d"), date: d.date, city: clipS(d.city, 60), title: clipS(d.title, 200), transit: clipS(d.transit, 5000), eats: clipS(d.eats, 5000), baby: clipS(d.baby, 5000), tz: "",
    stops: (d.stops || []).slice(0, 80).map(s => store.makeStop({ id: clipS(s.id, 40) || undefined, name: clipS(s.name, 200), query: clipS(s.query, 300), city: clipS(s.city, 60), area: clipS(s.area, 120), time: clipS(s.time, 8), mapUrl: /^https?:\/\//i.test(s.mapUrl || "") ? clipS(s.mapUrl, 600) : "", lat: Number.isFinite(+s.lat) && s.lat != null ? +s.lat : undefined, lng: Number.isFinite(+s.lng) && s.lng != null ? +s.lng : undefined, locSrc: clipS(s.locSrc, 8), locked: !!s.locked, added: !!s.added, activity: clipS(s.activity, 5000), transit: clipS(s.transit, 5000), baby: clipS(s.baby, 5000), eats: clipS(s.eats, 5000) })) }));
  const sync = t.sync && typeof t.sync === "object" && /^[\w\-/.]{6,120}$/.test(t.sync.r || "") && /^[\w-]{20,64}$/.test(t.sync.k || "") ? { b: ["mn", "js", "ep"].includes(t.sync.b) ? t.sync.b : "js", r: t.sync.r, k: t.sync.k, since: Date.now(), lastSync: 0 } : undefined;
  return { id: clipS(t.id, 40) || uid("trip"), name: clipS(t.name, 120) || "Shared trip", year: +t.year || new Date().getFullYear(), createdAt: Date.now(), cover: clipS(t.cover, 20), cities: (t.cities || []).slice(0, 8).map(c => clipS(c, 40)), days,
    hotels: (t.hotels || []).slice(0, 20).map(x => Object.assign({}, x, { id: uid("h") })), flights: (t.flights || []).slice(0, 40).map(x => Object.assign({}, x, { id: uid("f") })), sources: [], live: sync, settings: {} };
}
export function preview(data) {
  const t = data.trip, mine = store.getTrip(t.id);
  return { exists: !!mine, mineName: mine ? mine.name : "", days: t.days.length, stops: t.days.reduce((n, d) => n + (d.stops || []).length, 0), hotels: (t.hotels || []).length, flights: (t.flights || []).length, live: !!(t.sync && t.sync.r), level: data.level };
}
export function importTrip(data) {
  const incoming = clean(data.trip), mine = store.getTrip(incoming.id);
  if (!incoming.days.length) throw new LinkError("This link has no days in it.");
  if (!mine) { store.applyTz(incoming); store.addTrip(incoming); return { trip: incoming, updated: false }; }
  const keep = { settings: mine.settings, createdAt: mine.createdAt, cover: mine.cover, live: mine.live };
  incoming.days = store.keepUserData(mine, incoming.days);
  Object.assign(mine, incoming, { settings: keep.settings, createdAt: keep.createdAt, cover: incoming.cover || keep.cover, live: incoming.live || keep.live, sources: mine.sources });
  store.applyTz(mine); store.fixTrip(mine); store.save(); return { trip: mine, updated: true };
}
