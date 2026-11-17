/* live.js - live two-way progress. Each trip gets its own private "room" (a random ID the app creates by itself, no account).
   Every phone that opens the trip link ticks places into the same encrypted room and sees everyone else's ticks.
   Each place holds one entry [visited, time]; the newest entry wins, so un-ticking also travels. */
import * as store from "./store.js";
import { encryptJSON, decryptJSON, newSecret } from "./secure.js";
import { getBackend, providers, BackendError } from "./backend.js";

/* ---------- time-stamped entries ---------- */
export const stampOf = s => s.vts || (s.visited ? (s.visitedAt || 1) : 0);

export function localEntries(trip) {
  const out = {};
  trip.days.forEach(d => d.stops.forEach(s => { const t = stampOf(s); if (t > 0) out[s.id] = [s.visited ? 1 : 0, t]; }));
  return out;
}
export function mergeEntries(a, b) {
  const out = Object.assign({}, a);
  for (const id of Object.keys(b)) {
    const x = b[id], y = out[id];
    if (!y || x[1] > y[1] || (x[1] === y[1] && x[0] > y[0])) out[id] = x;
  }
  return out;
}
const sameEntries = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => b[k] && b[k][0] === a[k][0] && b[k][1] === a[k][1]); };

/* write remote entries into this phone's stops; returns how many places changed */
export function applyEntries(trip, entries) {
  let changed = 0;
  trip.days.forEach(d => d.stops.forEach(s => {
    const e = entries[s.id];
    if (!e) return;
    const t = stampOf(s);
    if (e[1] > t || (e[1] === t && e[0] === 1 && !s.visited)) {
      const was = s.visited;
      s.visited = e[0] === 1; s.visitedAt = s.visited ? e[1] : null; s.vts = e[1];
      if (was !== s.visited) changed++;
    }
  }));
  return changed;
}

/* ---------- status shown on screen ---------- */
const state = new Map();
export const statusOf = id => state.get(id) || { state: "idle", msg: "" };
function setStatus(id, st, msg = "") { state.set(id, { state: st, msg, at: Date.now() }); window.dispatchEvent(new CustomEvent("live-status", { detail: { id } })); }
export function ago(ts) {
  if (!ts) return "never";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return Math.round(s / 86400) + " d ago";
}

/* ---------- turn live progress on / off ---------- */
export async function enable(trip) {
  if (trip.live) return trip.live;
  const key = newSecret(32);
  const stops = localEntries(trip);
  const doc = await encryptJSON({ v: 1, updated: Date.now(), stops }, key);
  const problems = [];
  for (const be of providers()) {
    try {
      const room = await be.create(doc);
      const back = await be.read(room);                       // prove the other side can read it before relying on it
      if (!back || back.ct !== doc.ct) throw new BackendError("mismatch", "What was read back did not match what was saved.");
      trip.live = { b: be.id, r: room, k: key, since: Date.now(), lastSync: Date.now() };
      store.save(true);
      setStatus(trip.id, "ok", "Live progress is on");
      return trip.live;
    } catch (e) { problems.push(`${be.label}: ${e.message}`); }
  }
  throw new BackendError("none", "No sync service worked from this phone. " + problems.join(" | "));
}
export function disable(trip) { delete trip.live; state.delete(trip.id); store.save(true); window.dispatchEvent(new CustomEvent("live-status", { detail: { id: trip.id } })); }
export const isLive = trip => !!(trip && trip.live && trip.live.r && trip.live.k);

/* ---------- one sync round: read, merge, apply, write back if needed ---------- */
const running = new Map();
export function sync(trip) {
  if (!isLive(trip)) return Promise.resolve({ changed: 0, wrote: false });
  if (running.has(trip.id)) return running.get(trip.id);
  const p = (async () => {
    const L = trip.live;
    setStatus(trip.id, "syncing", "Syncing\u2026");
    try {
      const be = getBackend(L.b);
      const file = await be.read(L.r);
      let remote = {};
      let existed = false;
      if (file && file.ct) { const doc = await decryptJSON(file, L.k); remote = doc.stops || {}; existed = true; }
      const merged = mergeEntries(remote, localEntries(trip));
      const changed = applyEntries(trip, merged);
      let wrote = false;
      if (!existed || !sameEntries(remote, merged)) {
        await be.write(L.r, await encryptJSON({ v: 1, updated: Date.now(), stops: merged }, L.k));
        wrote = true;
      }
      L.lastSync = Date.now(); L.fails = 0; delete L.nextTry;
      store.save(true);
      setStatus(trip.id, "ok", "Synced");
      if (changed) window.dispatchEvent(new CustomEvent("trip-refresh"));
      return { changed, wrote };
    } catch (e) {
      L.fails = (L.fails || 0) + 1;
      L.nextTry = Date.now() + Math.min(300000, 15000 * Math.pow(2, Math.min(L.fails, 5)));
      store.save(true);
      setStatus(trip.id, "error", e instanceof BackendError ? e.message : (e && e.message) || "Sync failed.");
      return { changed: 0, wrote: false, error: e };
    } finally { running.delete(trip.id); }
  })();
  running.set(trip.id, p);
  return p;
}

/* ticking a place calls touch(): the change goes out about a second later */
const timers = new Map();
export function touch(trip) {
  if (!isLive(trip)) return;
  clearTimeout(timers.get(trip.id));
  setStatus(trip.id, "pending", "Sharing your change\u2026");
  timers.set(trip.id, setTimeout(() => { trip.live && (delete trip.live.nextTry); sync(trip); }, 1200));
}

/* ---------- keep every live trip fresh while the app is open ---------- */
let poller = null;
function syncAll(onlyDue) {
  if (document.visibilityState !== "visible") return;
  store.trips().filter(isLive).slice(0, 6).forEach((t, i) => {
    if (onlyDue && t.live.nextTry && t.live.nextTry > Date.now()) return;
    setTimeout(() => sync(t), i * 400);
  });
}
export function start() {
  if (poller) return;
  poller = setInterval(() => syncAll(true), 30000);
  document.addEventListener("visibilitychange", () => syncAll(false));
  window.addEventListener("online", () => syncAll(false));
  setTimeout(() => syncAll(false), 800);
}
