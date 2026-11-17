/* store.js - everything is kept in this browser (localStorage). */
import { uid, randomTopic, cityToTz, shortStopName, normName } from "./util.js";

const KEY = "trippilot.v1";
const DEFAULT_SETTINGS = { mapsKey: "", ghToken: "", ghOwner: "", ghRepo: "", geo: {}, wiki: {}, profile: null };
let state = { trips: [], settings: Object.assign({}, DEFAULT_SETTINGS) };

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { trips: parsed.trips || [], settings: Object.assign({}, DEFAULT_SETTINGS, parsed.settings || {}) };
    }
  } catch (e) { console.warn("Could not read saved data", e); }
  return state;
}
let saveHook = null;
export function setSaveHook(fn) { saveHook = fn; }
/* save(true) writes without telling the sharing engine (used for sync bookkeeping) */
export function save(quiet) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) {
    state.settings.wiki = {};
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e2) { alert("Storage is full. Delete an old trip to free space."); }
  }
  if (!quiet && saveHook) saveHook();
}
export const settings = () => state.settings;
export const trips = () => state.trips;
export const getTrip = id => state.trips.find(t => t.id === id) || null;
export function addTrip(trip) { state.trips.push(trip); save(); return trip; }
export function removeTrip(id) { state.trips = state.trips.filter(t => t.id !== id); save(); }

function makeStop(s) {
  return { id: uid("s"), name: s.name, area: s.area || "", query: s.query || s.name, transit: s.transit || "", activity: s.activity || "",
    baby: s.baby || "", eats: s.eats || "", city: s.city || "", label: s.label || "", visited: false, visitedAt: null, notes: "", searchTerm: "" };
}
export function buildDays(stops, oldDays) {
  const byDate = new Map();
  stops.forEach(s => { if (!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date).push(s); });
  const oldByDate = new Map((oldDays || []).map(d => [d.date, d]));
  const prev = new Map();
  (oldDays || []).forEach(d => d.stops.forEach(s => prev.set(normName(s.name), s)));
  return Array.from(byDate.keys()).sort().map(date => {
    const list = byDate.get(date).map(s => {
      const n = makeStop(s), o = prev.get(normName(s.name));
      if (o) { n.visited = o.visited; n.visitedAt = o.visitedAt; n.notes = o.notes || ""; n.searchTerm = o.searchTerm || ""; }
      return n;
    });
    const city = list.find(s => s.city)?.city || "";
    const old = oldByDate.get(date);
    return { id: old ? old.id : uid("d"), date, city, tz: cityToTz(city), stops: list };
  });
}
export function buildTrip({ name, year, stops, hotels, flights, sources }) {
  return {
    id: uid("trip"), name, year, createdAt: Date.now(), days: buildDays(stops),
    hotels: (hotels || []).map(x => Object.assign({ id: uid("h") }, x)),
    flights: (flights || []).map(x => Object.assign({ id: uid("f") }, x)),
    sources: sources || [],
    settings: { notifyTime: "07:30", topic: randomTopic(), includeNames: false, tz: "auto", scheduled: {} },
    cover: ""
  };
}

/* replace the plan with a newly uploaded itinerary, keeping ticks and notes where stops match */
export function replaceItinerary(trip, stops, year) {
  const keptVisited = trip.days.reduce((n, d) => n + d.stops.filter(s => s.visited).length, 0);
  trip.days = buildDays(stops, trip.days);
  applyTz(trip);
  if (year) trip.year = year;
  const after = trip.days.reduce((n, d) => n + d.stops.filter(s => s.visited).length, 0);
  save();
  return { keptVisited: after, hadVisited: keptVisited };
}
/* add hotels/flights from PDFs; an entry with the same identity is updated instead of duplicated */
export function upsertHotels(trip, list) {
  let added = 0, updated = 0;
  list.forEach(hn => {
    const i = trip.hotels.findIndex(x => (x.name || "").toLowerCase() === (hn.name || "").toLowerCase() && (x.checkIn || "") === (hn.checkIn || ""));
    if (i >= 0) { trip.hotels[i] = Object.assign({}, trip.hotels[i], hn, { id: trip.hotels[i].id }); updated++; }
    else { trip.hotels.push(Object.assign({ id: uid("h") }, hn)); added++; }
  });
  save(); return { added, updated };
}
export function upsertFlights(trip, list) {
  let added = 0, updated = 0;
  list.forEach(fl => {
    const i = trip.flights.findIndex(x => (x.number || "") === (fl.number || "") && (x.date || "") === (fl.date || ""));
    if (i >= 0) { trip.flights[i] = Object.assign({}, trip.flights[i], fl, { id: trip.flights[i].id }); updated++; }
    else { trip.flights.push(Object.assign({ id: uid("f") }, fl)); added++; }
  });
  save(); return { added, updated };
}

/* cover pictures: general travel scenes the user can choose from */
export const COVERS = [
  { id: "sky", label: "Above the clouds" }, { id: "lagoon", label: "Lagoon" }, { id: "alpine", label: "Alpine lake" },
  { id: "harbour", label: "Old harbour" }, { id: "dunes", label: "Desert dunes" }, { id: "stars", label: "Starry camp" }
];
export function coverKey(trip) {
  if (trip.cover && COVERS.some(c => c.id === trip.cover)) return trip.cover;
  let n = 0;
  const str = String(trip.id || trip.name || "");
  for (let i = 0; i < str.length; i++) n = (n * 31 + str.charCodeAt(i)) >>> 0;
  return COVERS[n % COVERS.length].id;
}
export const coverUrl = key => `img/${key}.jpg`;

/* time zone used for each day's morning alert: follow the city in the itinerary, or one fixed zone */
export function applyTz(trip) {
  const fixed = trip.settings && trip.settings.tz && trip.settings.tz !== "auto" ? trip.settings.tz : "";
  trip.days.forEach(d => { d.tz = fixed || cityToTz(d.city); });
}

export function dayCities(day) {
  const set = [];
  day.stops.forEach(s => { if (s.city && !set.includes(s.city)) set.push(s.city); });
  if (!set.length && day.city) set.push(day.city);
  return set;
}
export function dayTitle(day) {
  if (!day.stops.length) return "Free day";
  const names = day.stops.slice(0, 2).map(s => shortStopName(s.name)).filter(Boolean);
  return names.join(" \u2192 ") + (day.stops.length > 2 ? " +" + (day.stops.length - 2) : "");
}
export function progress(trip) {
  let total = 0, done = 0;
  trip.days.forEach(d => d.stops.forEach(s => { total++; if (s.visited) done++; }));
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}
export function dayProgress(day) {
  const total = day.stops.length, done = day.stops.filter(s => s.visited).length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}
export function findStop(trip, stopId) {
  for (const d of trip.days) {
    const i = d.stops.findIndex(s => s.id === stopId);
    if (i >= 0) return { day: d, index: i, stop: d.stops[i] };
  }
  return null;
}
export function hotelForDate(trip, date) { return trip.hotels.find(h => h.checkIn && h.checkOut && h.checkIn <= date && date < h.checkOut) || null; }
export function flightsForDate(trip, date) { return trip.flights.filter(f => f.date === date); }
