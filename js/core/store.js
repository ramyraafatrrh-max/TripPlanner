/* store.js - trips live in this phone's browser (localStorage). Field names are kept stable so trips saved by
   earlier versions of the app still load. New fields are always optional. */
import { uid, randomTopic, cityToTz, norm } from "./util.js";

const KEY = "trippilot.v1";
const DEFAULTS = { geo: {}, wiki: {}, photos: {}, disabled: [] };
let state = load();
let saveHook = null;

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.trips)) return fix(s); } catch (e) { /* start fresh */ }
  return fix({ trips: [], settings: {} });
}
function fix(s) {
  s.settings = Object.assign({}, DEFAULTS, s.settings || {});
  s.trips.forEach(fixTrip);
  return s;
}
export function fixTrip(t) {
  t.days = Array.isArray(t.days) ? t.days : []; t.hotels = Array.isArray(t.hotels) ? t.hotels : []; t.flights = Array.isArray(t.flights) ? t.flights : [];
  t.sources = Array.isArray(t.sources) ? t.sources : []; t.cities = Array.isArray(t.cities) ? t.cities : []; t.cover = t.cover || "";
  t.settings = Object.assign({ notifyTime: "07:30", topic: randomTopic(), includeNames: false, tz: "auto", scheduled: {} }, t.settings || {});
  t.days.forEach(d => { d.id = d.id || uid("d"); d.stops = Array.isArray(d.stops) ? d.stops : []; d.stops.forEach(fixStop); });
  return t;
}
export function fixStop(s) {
  s.id = s.id || uid("s");
  ["name", "area", "query", "city", "label", "transit", "activity", "baby", "eats", "notes", "searchTerm", "mapUrl", "time"].forEach(k => { if (s[k] == null) s[k] = ""; });
  s.visited = !!s.visited; s.visitedAt = s.visitedAt || null; s.vts = s.vts || 0; s.locked = !!s.locked;
  return s;
}
export function save(quiet) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) {
    state.settings.wiki = {}; state.settings.photos = {};
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e2) { alert("Storage is full. Delete an old trip to free space."); }
  }
  if (!quiet && saveHook) saveHook();
}
export const onSave = fn => { saveHook = fn; };
export const trips = () => state.trips;
export const getTrip = id => state.trips.find(t => t.id === id);
export const settings = () => state.settings;
export function addTrip(t) { state.trips.unshift(fixTrip(t)); save(); return t; }
export function removeTrip(id) { state.trips = state.trips.filter(t => t.id !== id); save(); }
export function newTrip({ name, days = [], hotels = [], flights = [], sources = [], year }) {
  const t = { id: uid("trip"), name: name || "My trip", year: year || (days[0] ? +days[0].date.slice(0, 4) : new Date().getFullYear()), createdAt: Date.now(), cover: "", cities: [], days, hotels, flights, sources, settings: {} };
  applyTz(t); return fixTrip(t);
}
export function makeDay(date, city = "") { return { id: uid("d"), date, city, tz: cityToTz(city), title: "", stops: [] }; }
export function makeStop(o = {}) { return fixStop(Object.assign({ id: uid("s") }, o)); }

/* time zone used for each day's morning alert: the city in the plan, or one fixed zone chosen in settings */
export function applyTz(trip) {
  const fixed = trip.settings && trip.settings.tz && trip.settings.tz !== "auto" ? trip.settings.tz : "";
  trip.days.forEach(d => { d.tz = fixed || cityToTz(d.city); });
}

/* ---------- progress ---------- */
export function dayProgress(day) { const total = day.stops.length, done = day.stops.filter(s => s.visited).length; return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }; }
export function progress(trip) { let total = 0, done = 0; trip.days.forEach(d => { total += d.stops.length; done += d.stops.filter(s => s.visited).length; }); return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }; }
export function findStop(trip, id) { for (const day of trip.days) { const stop = day.stops.find(s => s.id === id); if (stop) return { day, stop }; } return null; }

export function hotelForDate(trip, date) {
  const list = trip.hotels.filter(h => h.checkIn && h.checkOut && date >= h.checkIn && date < h.checkOut);
  if (list.length) return list[0];
  const last = trip.hotels.find(h => h.checkOut === date && !trip.hotels.some(o => o.checkIn <= date && date < o.checkOut));
  return last || null;                      // check-out day with no other stay: show the hotel you are leaving
}
export const flightsForDate = (trip, date) => trip.flights.filter(f => f.date === date);
export function dayCities(day) {
  const seen = []; const add = c => { c = String(c || "").trim(); if (c && !seen.includes(c)) seen.push(c); };
  day.stops.forEach(s => add(s.city)); if (!seen.length) add(day.city); return seen;
}
export function dayTitle(day) {
  if (day.title) return day.title;
  const names = day.stops.slice(0, 3).map(s => String(s.name).replace(/\s*\(.*$/, "").split(/:\s/).pop());
  if (!names.length) return "Free day";
  return names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0];
}

/* keep ticks, notes and the user's own edits when a plan is replaced by a newer PDF */
export function keepUserData(oldTrip, newDays) {
  const byName = new Map(), added = [];
  oldTrip.days.forEach(d => d.stops.forEach(s => { byName.set(norm(s.name), s); if (s.added) added.push({ date: d.date, stop: s }); }));
  newDays.forEach(d => d.stops.forEach(n => {
    const o = byName.get(norm(n.name)); if (!o) return;
    n.visited = o.visited; n.visitedAt = o.visitedAt; n.vts = o.vts || 0; n.notes = o.notes || ""; n.locked = !!o.locked;
    if (o.mapUrl) n.mapUrl = o.mapUrl;
    if (o.locSrc && o.locSrc !== "geo") { n.lat = o.lat; n.lng = o.lng; n.locSrc = o.locSrc; }
  }));
  added.forEach(({ date, stop }) => { let d = newDays.find(x => x.date === date); if (!d) { d = makeDay(date, stop.city); newDays.push(d); newDays.sort((a, b) => a.date.localeCompare(b.date)); } if (!d.stops.some(s => norm(s.name) === norm(stop.name))) d.stops.push(stop); });
  return newDays;
}

/* ---------- covers (general travel pictures used when a trip has no city photos yet) ---------- */
export const COVERS = [{ id: "sky", label: "Above the clouds" }, { id: "harbour", label: "Old harbour" }, { id: "alpine", label: "Alpine lake" }, { id: "city", label: "City lights" }];
export function coverKey(trip) {
  if (trip.cover && COVERS.some(c => c.id === trip.cover)) return trip.cover;
  let n = 0; const str = String(trip.id || trip.name || "");
  for (let i = 0; i < str.length; i++) n = (n * 31 + str.charCodeAt(i)) >>> 0;
  return COVERS[n % COVERS.length].id;
}
export const coverUrl = key => `img/${key}.jpg`;
