/* live module: share Visited ticks between phones, live. Each trip gets its own private "room" with a random id; ticks are encrypted
   on the phone with a key that lives only inside the trip link. Storage is tried in this order: your own Cloudflare Worker
   (config.js "live.endpoint", the dependable one), then two free public services. If none works the app tells you and your ticks stay safe. */
import { h } from "../../core/dom.js";
import { ic } from "../../core/icons.js";
import * as store from "../../core/store.js";
import { reg } from "../../core/registry.js";
import { bus } from "../../core/bus.js";
import { toast } from "../../core/ui.js";

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = bytes => { let s = ""; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64u = bytes => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
const secret = n => b64u(crypto.getRandomValues(new Uint8Array(n)));
const ckey = (k, use) => crypto.subtle.importKey("raw", unb64u(k), "AES-GCM", false, [use]);
async function seal(obj, key) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await ckey(key, "encrypt"), enc.encode(JSON.stringify(obj)))); return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(ct) }); }
async function open(text, key) { const f = JSON.parse(text); return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(f.iv) }, await ckey(key, "decrypt"), unb64(f.ct)))); }

/* ---------- storage back ends ---------- */
const ep = () => (reg.config.live || {}).endpoint || "";
async function call(url, opts) { let r; try { r = await fetch(url, opts); } catch (e) { throw new Error("could not connect (" + (e.message || "network") + ")"); } if (!r.ok) { let t = ""; try { t = (await r.text()).slice(0, 80); } catch (e) { /* ignore */ } throw new Error(`replied ${r.status}${t ? ": " + t : ""}`); } return r; }
const BACKENDS = {
  ep: { label: "your Cloudflare Worker", usable: () => !!ep(),
    async create(text) { const r = await call(`${ep()}/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: text }); return (await r.json()).id; },
    read: async ref => (await call(`${ep()}/rooms/${ref}`)).text(), write: (ref, text) => call(`${ep()}/rooms/${ref}`, { method: "PUT", headers: { "content-type": "application/json" }, body: text }) },
  mn: { label: "MantleDB", usable: () => true,
    async create(text) { const ref = "tp-" + secret(12) + "/state"; await call(`https://mantledb.sh/v2/${ref}`, { method: "POST", headers: { "content-type": "text/plain" }, body: text }); return ref; },
    read: async ref => (await call(`https://mantledb.sh/v2/${ref}`)).text(), write: (ref, text) => call(`https://mantledb.sh/v2/${ref}`, { method: "POST", headers: { "content-type": "text/plain" }, body: text }) },
  js: { label: "jsonstorage.net", usable: () => true,
    async create(text) { const r = await call("https://api.jsonstorage.net/v1/json", { method: "POST", headers: { "content-type": "application/json" }, body: text }); const j = await r.json(); return String(j.uri || "").split("/").pop(); },
    read: async ref => (await call(`https://api.jsonstorage.net/v1/json/${ref}`)).text(), write: (ref, text) => call(`https://api.jsonstorage.net/v1/json/${ref}`, { method: "PUT", headers: { "content-type": "application/json" }, body: text }) }
};
const ORDER = ["ep", "mn", "js"];

export async function testBackends() {
  const steps = []; let ok = null;
  for (const id of ORDER) {
    const b = BACKENDS[id]; if (!b.usable()) continue;
    try { const key = secret(32), ref = await b.create(await seal({ ping: 1 }, key)); const back = await open(await b.read(ref), key); if (!back.ping) throw new Error("the answer was wrong"); steps.push({ ok: true, label: `${b.label}: create, write and read all worked` }); ok = ok || id; }
    catch (e) { steps.push({ ok: false, label: `${b.label}: ${e.message}` }); }
  }
  return { ok: !!ok, id: ok, steps };
}

/* ---------- state and merging ---------- */
const trips = () => store.trips().filter(t => t.live && t.live.r);
const status = {}; const setStatus = (id, state, msg = "") => { status[id] = { state, msg }; bus.emit("live-status", { id }); };
export const statusOf = id => status[id] || { state: "idle", msg: "" };
export const isLive = t => !!(t && t.live && t.live.r && t.live.k);
export function ago(ts) { if (!ts) return "never"; const s = Math.round((Date.now() - ts) / 1000); return s < 45 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " d ago"; }
const localState = trip => { const s = {}; trip.days.forEach(d => d.stops.forEach(x => { if (x.vts) s[x.id] = [x.visited ? 1 : 0, x.vts]; })); return { t: Date.now(), s }; };
function merge(trip, remote) {
  let changed = 0; const out = Object.assign({}, remote.s || {});
  trip.days.forEach(d => d.stops.forEach(x => {
    const r = out[x.id];
    if (r && r[1] > (x.vts || 0)) { const was = x.visited; x.visited = !!r[0]; x.visitedAt = x.visited ? r[1] : null; x.vts = r[1]; if (was !== x.visited) { changed++; bus.emit("progress-changed", { id: trip.id, stopId: x.id, remote: true }); } }
    else if (x.vts && (!r || x.vts > r[1])) out[x.id] = [x.visited ? 1 : 0, x.vts];
  }));
  return { changed, state: { t: Date.now(), s: out }, differs: JSON.stringify(out) !== JSON.stringify(remote.s || {}) };
}
const busy = new Set();
export async function sync(trip) {
  if (!isLive(trip) || busy.has(trip.id)) return { changed: 0 }; busy.add(trip.id); setStatus(trip.id, "syncing");
  const L = trip.live, b = BACKENDS[L.b];
  try {
    let remote = { s: {} }; try { remote = await open(await b.read(L.r), L.k); } catch (e) { if (!/replied 404/.test(e.message)) throw e; }
    const m = merge(trip, remote);
    if (m.differs || !Object.keys(remote.s || {}).length) await b.write(L.r, await seal(m.state, L.k));
    L.lastSync = Date.now(); store.save(true); setStatus(trip.id, "ok"); if (m.changed) bus.emit("trip-changed", { id: trip.id }); return { changed: m.changed };
  } catch (e) { setStatus(trip.id, "error", "Sync problem: " + e.message + ". Your ticks are safe on this phone."); return { changed: 0, error: e.message }; }
  finally { busy.delete(trip.id); }
}
const timers = {};
export function touch(trip) { if (!isLive(trip)) return; setStatus(trip.id, "pending"); clearTimeout(timers[trip.id]); timers[trip.id] = setTimeout(() => sync(trip), 1200); }
export async function enable(trip) {
  const errors = [], key = secret(32);
  for (const id of ORDER) {
    const b = BACKENDS[id]; if (!b.usable()) continue;
    try {
      const ref = await b.create(await seal(localState(trip), key)); const back = await open(await b.read(ref), key); if (!back.s) throw new Error("the answer was wrong");
      trip.live = { b: id, r: ref, k: key, since: Date.now(), lastSync: Date.now() }; store.save(); return trip.live;
    } catch (e) { errors.push(`${b.label}: ${e.message}`); }
  }
  throw new Error("Live progress could not start. " + errors.join(" \u00B7 ") + ". Check your connection, or set up your own Cloudflare Worker (see the README).");
}
export function disable(trip) { delete trip.live; store.save(); }

/* ---------- controls shown in the share sheet and in settings ---------- */
export function controls(trip, onChange) {
  const box = h("div"), testBox = h("div");
  const test = () => { testBox.replaceChildren(h("p", { class: "muted" }, h("span", { class: "spinner" }), "Checking the sync services\u2026")); return testBackends().then(r => testBox.replaceChildren(...r.steps.map(s => h("div", { class: "kv" }, ic(s.ok ? "check" : "x", 16, 2.2), h("span", null, s.label))), h("div", { class: r.ok ? "banner" : "warnbox" }, r.ok ? "Live progress will work." : "None of the services answered. Live progress will not sync until one works. Your ticks stay safe on this phone."))); };
  const draw = () => {
    if (isLive(trip)) {
      const st = statusOf(trip.id), pill = h("span", { class: "pill " + (st.state === "error" ? "warn" : "green") }, ic(st.state === "error" ? "x" : "check", 13, 2.4), st.state === "syncing" ? "Syncing\u2026" : st.state === "error" ? st.msg : trip.live.lastSync ? "Live \u00B7 synced " + ago(trip.live.lastSync) : "Live progress is on");
      box.replaceChildren(h("div", { class: "meta-line" }, pill), h("p", { class: "muted" }, "Everyone who opens this trip's link sees your ticks within seconds, and you see theirs. Anyone with the link can tick places."),
        h("div", { class: "row", style: { gap: "8px" } }, h("button", { class: "btn small green", type: "button", onclick: async () => { const r = await sync(trip); toast(r.error ? "Could not sync right now" : r.changed ? `${r.changed} place(s) updated` : "Up to date"); } }, ic("refresh", 15), "Sync now"), h("button", { class: "btn small glass", type: "button", onclick: test }, "Test connection"), h("button", { class: "btn small glass", type: "button", onclick: () => { disable(trip); draw(); onChange && onChange(); toast("Live progress turned off on this phone"); } }, "Turn off")), testBox);
    } else {
      const err = h("div", { class: "warnbox", hidden: true }), cb = h("input", { type: "checkbox", "aria-label": "Share my progress live" });
      cb.addEventListener("change", async () => { if (!cb.checked) return; cb.disabled = true; err.hidden = true; try { await enable(trip); toast("Live progress is on"); draw(); onChange && onChange(); } catch (e) { cb.checked = false; cb.disabled = false; err.textContent = e.message; err.hidden = false; } });
      box.replaceChildren(h("label", { class: "pickrow" }, cb, h("span", null, "Share progress live: everyone with the link sees each other's ticks")), h("p", { class: "muted" }, "No account needed. The app creates a private room for this trip and keeps your ticks in it, encrypted with a key that is only inside the link. Ticking works offline and syncs when you are back online."), err, h("button", { class: "btn small glass", type: "button", onclick: test }, "Test connection"), testBox);
    }
  };
  const on = e => { if (!box.isConnected) { bus.on && 0; return; } if (e && e.id === trip.id && isLive(trip)) { const keep = testBox.childNodes.length ? [...testBox.childNodes] : null; draw(); if (keep) testBox.replaceChildren(...keep); } };
  const off = bus.on("live-status", on); draw(); return box;
}

export default {
  id: "live", version: "2.0.0", title: "Live progress",
  description: "Shares Visited ticks between phones through an encrypted private room per trip.",
  init(ctx) {
    ctx.service("live", { isLive, sync, touch, controls, enable, disable, statusOf, test: testBackends });
    bus.on("progress-changed", e => { if (!e.remote) { const t = store.getTrip(e.id); if (t) touch(t); } });
    ctx.settingsSection({ id: "live", scope: "trip", order: 30, render: trip => h("div", { class: "glass card" }, h("span", { class: "eyebrow" }, "Live"), h("h3", { style: { marginTop: "4px" } }, "Shared progress"), controls(trip)) });
    const tick = () => { if (document.visibilityState === "visible") trips().forEach(sync); };
    document.addEventListener("visibilitychange", tick); setInterval(tick, 30000); setTimeout(tick, 1500);
  }
};
