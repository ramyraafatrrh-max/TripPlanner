/* day.js - the actions that work on one day of a trip: locate its stops, reorder them for the least travel, undo. */
import * as store from "../../core/store.js";
import { hasPt, fmtKm } from "../../core/util.js";
import { optimize, insertionCost } from "./optimize.js";
import { locateStop } from "./geo.js";

export const hotelPoint = (trip, day) => { const h = store.hotelForDate(trip, day.date); return h && hasPt(h) ? { lat: +h.lat, lng: +h.lng } : null; };
const pointOf = s => (hasPt(s) ? { lat: +s.lat, lng: +s.lng } : null);

/* find coordinates for every stop of a day that has none (uses the pasted link first, then a name search) */
export async function locateDay(trip, day, { onProgress, cancelled } = {}) {
  const near = hotelPoint(trip, day);
  let anchor = near, done = 0, found = 0;
  for (const s of day.stops) {
    if (cancelled && cancelled()) break;
    done++; if (onProgress) onProgress(done, day.stops.length, s);
    if (hasPt(s)) { anchor = anchor || pointOf(s); found++; continue; }
    if (await locateStop(s, { city: s.city || day.city || "", near: anchor })) { found++; anchor = anchor || pointOf(s); }
  }
  store.save(true);
  return { found, total: day.stops.length };
}

/* reorder one day. pinned stops keep their order (and a pinned first or last stop keeps that slot) */
export function reorderDay(trip, day, { fromHotel = true, keepPinned = true, keepTimed = false, newIds = [], keepOrder = false } = {}) {
  const items = day.stops.map(s => ({ id: s.id, p: pointOf(s), fixed: keepOrder ? !newIds.includes(s.id) : ((keepPinned && !!s.locked) || (keepTimed && !!s.time)) }));
  const res = optimize(items, { start: fromHotel ? hotelPoint(trip, day) : null });
  const unlocated = day.stops.filter(s => !hasPt(s)).length;
  if (res.moved === 0 && res.after >= res.before - 0.001 && !newIds.length) return Object.assign(res, { unlocated, changed: false });
  day.undo = { at: Date.now(), stops: JSON.parse(JSON.stringify(day.stops)) };
  const byId = new Map(day.stops.map(s => [s.id, s]));
  const before = day.stops.map(s => s.id);
  day.stops = res.order.map(id => byId.get(id));
  day.stops.forEach((s, i) => { if (before[i] !== s.id && s.time && !s.locked && !newIds.includes(s.id)) s.time = ""; });   // times no longer match a moved stop
  day.lastOpt = { before: res.before, after: res.after, moved: res.moved, at: Date.now(), unlocated };
  store.save();
  return Object.assign(res, { unlocated, changed: true });
}
export function undoReorder(day) {
  if (!day.undo) return false;
  const now = new Map(day.stops.map(s => [s.id, s]));
  day.stops = day.undo.stops.filter(s => now.has(s.id) || s.added !== true).map(s => { const c = now.get(s.id); return c ? Object.assign(s, { visited: c.visited, visitedAt: c.visitedAt, vts: c.vts, notes: c.notes }) : s; });
  day.undo = null; day.lastOpt = null; store.save(); return true;
}
/* rank days by how little extra travel a new point would add */
export function rankDays(trip, p) {
  return trip.days.map(day => {
    const pts = day.stops.map(pointOf).filter(Boolean);
    const add = insertionCost(pts, p, hotelPoint(trip, day));
    return { day, added: add, located: pts.length };
  }).filter(r => r.added !== null).sort((a, b) => a.added - b.added);
}
export const summary = r => `${fmtKm(r.before)} \u2192 ${fmtKm(r.after)}`;
