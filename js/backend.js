/* backend.js - where the encrypted live progress is stored.
   Two interchangeable stores that both do create / read / write of one JSON document:
     "js"  the free public store jsonstorage.net (no account)
     "ep"  your own Cloudflare Worker (worker/worker.js), address set in config.js */
import { SYNC } from "./config.js";

export class BackendError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

const JSON_HEADERS = { "Content-Type": "application/json" };

async function call(url, opts) {
  try { return await fetch(url, Object.assign({ cache: "no-store" }, opts)); }
  catch (e) { throw new BackendError("offline", "Could not reach the sync service. Check your internet connection."); }
}
function fail(res) {
  if (res.status === 404) return new BackendError("notfound", "The shared progress was not found. It may have expired.");
  if (res.status === 413) return new BackendError("toolarge", "The progress is too large for the sync service.");
  if (res.status === 429) return new BackendError("limit", "The sync service is busy. The app will try again in a moment.");
  if (res.status === 401 || res.status === 403) return new BackendError("denied", "The sync service refused the request (it may require an account now).");
  return new BackendError("http", `The sync service replied ${res.status}.`);
}

/* ---- free public store ---- */
const JS_BASE = "https://api.jsonstorage.net/v1/json";
const jsonstorage = {
  id: "js",
  label: "jsonstorage.net (free, no account)",
  async create(doc) {
    const res = await call(JS_BASE, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(doc) });
    if (!res.ok) throw fail(res);
    let data = {};
    try { data = await res.json(); } catch (e) { /* handled below */ }
    const m = String(data.uri || "").match(/\/v1\/json\/([^?#]+)/);
    if (!m) throw new BackendError("shape", "The sync service answered in an unexpected way.");
    return m[1];
  },
  async read(room) {
    const res = await call(`${JS_BASE}/${room}`, { headers: { Accept: "application/json" } });
    if (res.status === 404) return null;
    if (!res.ok) throw fail(res);
    return res.json();
  },
  async write(room, doc) {
    const res = await call(`${JS_BASE}/${room}`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(doc) });
    if (!res.ok) throw fail(res);
  }
};

/* ---- your own Worker ---- */
const own = () => String(SYNC.endpoint || "").replace(/\/+$/, "");
const endpoint = {
  id: "ep",
  label: "your own sync server",
  async create(doc) {
    const res = await call(`${own()}/rooms`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(doc) });
    if (!res.ok) throw fail(res);
    const data = await res.json().catch(() => ({}));
    if (!data.id) throw new BackendError("shape", "The sync server answered in an unexpected way.");
    return data.id;
  },
  async read(room) {
    const res = await call(`${own()}/rooms/${room}`, { headers: { Accept: "application/json" } });
    if (res.status === 404) return null;
    if (!res.ok) throw fail(res);
    return res.json();
  },
  async write(room, doc) {
    const res = await call(`${own()}/rooms/${room}`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(doc) });
    if (!res.ok) throw fail(res);
  }
};

export function defaultBackend() { return own() ? endpoint : jsonstorage; }
export function getBackend(id) {
  if (id === "ep") { if (!own()) throw new BackendError("config", "This trip uses a sync server that is not set up in this copy of the app."); return endpoint; }
  return jsonstorage;
}

/* step-by-step check, shown to the user so a problem can be pinpointed on their own phone */
export async function testBackend(be = defaultBackend()) {
  const steps = [];
  const step = async (label, fn) => { try { const r = await fn(); steps.push({ label, ok: true }); return r; } catch (e) { steps.push({ label, ok: false, msg: e.message }); throw e; } };
  try {
    const room = await step("Create a private item", () => be.create({ app: "trip-pilot", test: "ping", t: Date.now() }));
    const a = await step("Read it back", () => be.read(room));
    if (!a || a.test !== "ping") throw new BackendError("mismatch", "What was read back did not match what was saved.");
    await step("Update it", () => be.write(room, { app: "trip-pilot", test: "pong", t: Date.now() }));
    const b = await step("Read the update", () => be.read(room));
    if (!b || b.test !== "pong") throw new BackendError("mismatch", "The update was not stored.");
    return { ok: true, label: be.label, steps };
  } catch (e) { return { ok: false, label: be.label, steps, error: e.message }; }
}
