/* link.js - put a whole trip inside a link. No server, no account, no token.
   The plan is compressed and stored in the part of the address after the "#", which browsers never send to any server. */
import * as store from "./store.js";
import { uid, randomTopic } from "./util.js";
import { appBase } from "./notify.js";

export class LinkError extends Error {}

/* ---------- base64url ---------- */
function toB64u(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64u(t) {
  const b = atob(t.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

/* ---------- compression (built into modern phones; falls back to plain text) ---------- */
const canZip = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";
async function pipe(bytes, stream) {
  const w = stream.writable.getWriter();
  w.write(bytes).catch(() => {});   // a cut-off link makes these reject; the read below reports the real error
  w.close().catch(() => {});
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/* ---------- what goes into the link ---------- */
const LEVELS = [
  { id: "full", label: "Full details", max: 0 },
  { id: "short", label: "Shorter descriptions", max: 150 },
  { id: "min", label: "Names and map places only", max: -1 }
];
const cut = (t, n) => { t = (t || "").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "\u2026" : t; };

export function slimTrip(trip, level = "full", opts = {}) {
  const lv = LEVELS.find(l => l.id === level) || LEVELS[0];
  const text = v => (lv.max === 0 ? v || "" : lv.max < 0 ? "" : cut(v, lv.max));
  const out = {
    id: trip.id, name: trip.name, year: trip.year, cover: trip.cover || "",
    days: trip.days.map(d => ({
      id: d.id, date: d.date, city: d.city || "", tz: d.tz || "",
      stops: d.stops.map(s => ({ id: s.id, name: s.name, area: s.area || "", query: s.query || s.name, city: s.city || "", label: s.label || "",
        transit: text(s.transit), activity: text(s.activity), baby: text(s.baby), eats: text(s.eats) }))
    })),
    hotels: (trip.hotels || []).map(x => ({ id: x.id, name: x.name, address: x.address || "", checkIn: x.checkIn || "", checkOut: x.checkOut || "", phone: opts.refs ? x.phone || "" : "", confirmation: opts.refs ? x.confirmation || "" : "", notes: x.notes || "" })),
    flights: (trip.flights || []).map(x => ({ id: x.id, number: x.number, date: x.date || "", from: x.from || "", to: x.to || "", depart: x.depart || "", arrive: x.arrive || "", booking: opts.refs ? x.booking || "" : "", notes: x.notes || "" }))
  };
  return { app: "trip-pilot", v: 1, level: lv.id, trip: out };
}

export async function encodeTrip(trip, level = "full", opts = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(slimTrip(trip, level, opts)));
  if (canZip()) {
    try { return "z." + toB64u(await pipe(bytes, new CompressionStream("deflate-raw"))); } catch (e) { /* fall through to plain */ }
  }
  return "p." + toB64u(bytes);
}
export async function decodePayload(payload) {
  try {
    const kind = payload.slice(0, 2), body = payload.slice(2);
    let bytes = fromB64u(body);
    if (kind === "z.") {
      if (!canZip()) throw new LinkError("This browser cannot open compressed links. Update your browser, or ask for a trip file instead.");
      bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    } else if (kind !== "p.") throw new Error("bad");
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || data.app !== "trip-pilot" || !data.trip || !Array.isArray(data.trip.days)) throw new Error("bad");
    return data;
  } catch (e) {
    if (e instanceof LinkError) throw e;
    throw new LinkError("This link is incomplete or was cut off by the app it was sent through. Ask for it again, or ask for a trip file.");
  }
}
export const urlFor = payload => `${appBase()}#/t/${payload}`;

/* the three sizes with their real link lengths, so the person sharing can choose */
export async function buildOptions(trip, opts = {}) {
  const res = [];
  for (const lv of LEVELS) {
    const payload = await encodeTrip(trip, lv.id, opts);
    const url = urlFor(payload);
    res.push({ id: lv.id, label: lv.label, url, length: url.length });
  }
  return res;
}
export const SOFT_LIMIT = 6000;

/* ---------- opening a link ---------- */
const clean = (v, n = 4000) => (typeof v === "string" ? v.slice(0, n) : "");
function normalize(t) {
  if (!t || typeof t !== "object" || !Array.isArray(t.days)) throw new LinkError("That link does not contain a trip.");
  const days = t.days.slice(0, 120).map(d => ({
    id: clean(d.id, 40) || uid("d"), date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : "", city: clean(d.city, 80), tz: clean(d.tz, 60),
    stops: (Array.isArray(d.stops) ? d.stops : []).slice(0, 200).map(s => ({
      id: clean(s.id, 40) || uid("s"), name: clean(s.name, 200), area: clean(s.area, 200), query: clean(s.query, 300) || clean(s.name, 200), city: clean(s.city, 80), label: clean(s.label, 30),
      transit: clean(s.transit), activity: clean(s.activity), baby: clean(s.baby), eats: clean(s.eats), visited: false, visitedAt: null, notes: "", searchTerm: ""
    }))
  })).filter(d => d.date);
  if (!days.length) throw new LinkError("That link does not contain any days.");
  const pick = (arr, f) => (Array.isArray(arr) ? arr.slice(0, 40).map(f) : []);
  return {
    id: clean(t.id, 40) || uid("trip"), name: clean(t.name, 120) || "Shared trip", year: +t.year || new Date().getFullYear(), createdAt: Date.now(), cover: clean(t.cover, 20), days,
    hotels: pick(t.hotels, x => ({ id: clean(x.id, 40) || uid("h"), name: clean(x.name, 160), address: clean(x.address, 300), checkIn: clean(x.checkIn, 10), checkOut: clean(x.checkOut, 10), phone: clean(x.phone, 40), confirmation: clean(x.confirmation, 60), notes: clean(x.notes, 300), source: "" })),
    flights: pick(t.flights, x => ({ id: clean(x.id, 40) || uid("f"), number: clean(x.number, 20), date: clean(x.date, 10), from: clean(x.from, 8), to: clean(x.to, 8), depart: clean(x.depart, 8), arrive: clean(x.arrive, 8), booking: clean(x.booking, 20), notes: clean(x.notes, 300), source: "" })),
    sources: [],
    settings: { notifyTime: "07:30", topic: randomTopic(), includeNames: false, tz: "auto", scheduled: {} }
  };
}

/* what would happen if this phone added the trip */
export function preview(data) {
  const t = data.trip;
  const mine = store.getTrip(t.id);
  const stops = t.days.reduce((n, d) => n + (d.stops ? d.stops.length : 0), 0);
  return { exists: !!mine, mineName: mine ? mine.name : "", days: t.days.length, stops, hotels: (t.hotels || []).length, flights: (t.flights || []).length, level: data.level };
}

/* add the trip, or update the copy this phone already has (ticks and notes stay) */
export function importTrip(data) {
  const incoming = normalize(data.trip);
  const mine = store.getTrip(incoming.id);
  if (!mine) {
    store.applyTz(incoming);
    store.trips().push(incoming);
    store.save();
    return { trip: incoming, updated: false };
  }
  const keep = new Map();
  mine.days.forEach(d => d.stops.forEach(s => keep.set(s.id, s)));
  incoming.days.forEach(d => d.stops.forEach(s => { const o = keep.get(s.id); if (o) { s.visited = o.visited; s.visitedAt = o.visitedAt; s.notes = o.notes || ""; s.searchTerm = o.searchTerm || ""; } }));
  const mineSettings = mine.settings, createdAt = mine.createdAt, cover = mine.cover;
  Object.keys(mine).forEach(k => delete mine[k]);
  Object.assign(mine, incoming);
  mine.settings = mineSettings || incoming.settings;
  mine.createdAt = createdAt;
  if (cover && !incoming.cover) mine.cover = cover;
  store.applyTz(mine);
  store.save();
  return { trip: mine, updated: true };
}
