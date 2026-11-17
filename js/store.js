/* store.js - everything is kept in this browser (localStorage). */
import { uid, randomTopic, cityToTz, shortStopName } from "./util.js";

const KEY = "trippilot.v1";
let state = { trips: [], settings: { mapsKey: "", ghToken: "", ghOwner: "", ghRepo: "", geo: {}, wiki: {} } };

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { trips: parsed.trips || [], settings: Object.assign({ mapsKey: "", ghToken: "", ghOwner: "", ghRepo: "", geo: {}, wiki: {} }, parsed.settings || {}) };
    }
  } catch (e) { console.warn("Could not read saved data", e); }
  return state;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) {
    // storage full: drop the web-info cache first, then retry
    state.settings.wiki = {};
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e2) { alert("Storage is full. Delete an old trip to free space."); }
  }
}

export const settings = () => state.settings;
export const trips = () => state.trips;
export const getTrip = id => state.trips.find(t => t.id === id) || null;

export function addTrip(trip) { state.trips.push(trip); save(); return trip; }
export function removeTrip(id) { state.trips = state.trips.filter(t => t.id !== id); save(); }

/* ---------- building a trip from parsed documents ---------- */
export function buildTrip({ name, year, stops, hotels, flights, sources }) {
  const byDate = new Map();
  stops.forEach(s => {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  });
  const dates = Array.from(byDate.keys()).sort();
  const days = dates.map(date => {
    const list = byDate.get(date).map(s => ({
      id: uid("s"), name: s.name, area: s.area || "", query: s.query || s.name, transit: s.transit || "", activity: s.activity || "",
      baby: s.baby || "", eats: s.eats || "", city: s.city || "", label: s.label || "", visited: false, visitedAt: null, notes: "", searchTerm: ""
    }));
    const city = list.find(s => s.city)?.city || "";
    return { id: uid("d"), date, city, tz: cityToTz(city), stops: list };
  });
  return {
    id: uid("trip"), name, year, createdAt: Date.now(), days,
    hotels: (hotels || []).map(x => Object.assign({ id: uid("h") }, x)),
    flights: (flights || []).map(x => Object.assign({ id: uid("f") }, x)),
    sources: sources || [],
    settings: { notifyTime: "07:30", topic: randomTopic(), mode: "action", scheduled: {} }
  };
}

/* ---------- derived values ---------- */
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
export function hotelForDate(trip, date) {
  return trip.hotels.find(h => h.checkIn && h.checkOut && h.checkIn <= date && date < h.checkOut) || null;
}
export function flightsForDate(trip, date) {
  return trip.flights.filter(f => f.date === date);
}
