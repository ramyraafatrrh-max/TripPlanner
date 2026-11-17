/* backend.js - where the encrypted live progress is stored.
   Several interchangeable stores, each able to create / read / write one JSON document. The app tries them in order and
   uses the first one that really works from this phone; the choice travels inside the share link (field "b").
     "ep"  your own Cloudflare Worker (worker/worker.js), address set in config.js. Most reliable.
     "mn"  MantleDB mantledb.sh: free, anonymous, no key (unclaimed namespace, 64 KB per entry, purged after 30 days without a write)
     "js"  jsonstorage.net: free, but its docs ask for an API key to create items, so it often refuses anonymous creates */
import { SYNC } from "./config.js";

export class BackendError extends Error { constructor(code, msg, status) { super(msg); this.code = code; this.status = status || 0; } }

const JSON_HEADERS = { "Content-Type": "application/json" };

async function call(url, opts) {
  try { return await fetch(url, Object.assign({ cache: "no-store" }, opts)); }
  catch (e) { throw new BackendError("offline", "Could not reach the service (offline, or the service blocks browsers)."); }
}
/* turn a bad reply into a message that includes what the service actually said, so a problem can be diagnosed */
async function failure(res) {
  let body = "";
  try { body = (await res.text()).replace(/\s+/g, " ").trim().slice(0, 140); } catch (e) { /* ignore */ }
  const tail = body ? ` Reply: ${body}` : "";
  if (res.status === 404) return new BackendError("notfound", "Not found." + tail, 404);
  if (res.status === 413) return new BackendError("toolarge", "Too large for this service." + tail, 413);
  if (res.status === 429) return new BackendError("limit", "The service is busy or rate-limited." + tail, 429);
  if (res.status === 401 || res.status === 403) return new BackendError("denied", `The service refused the request (${res.status}); it may now need an account or key.` + tail, res.status);
  if (res.status === 400) return new BackendError("rejected", "The service rejected the request (400)." + tail, 400);
  return new BackendError("http", `The service replied ${res.status}.` + tail, res.status);
}
const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");

/* ---- your own Worker ---- */
const own = () => String(SYNC.endpoint || "").replace(/\/+$/, "");
const endpoint = {
  id: "ep", label: "your own sync server",
  available: () => !!own(),
  async create(doc) {
    const res = await call(`${own()}/rooms`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(doc) });
    if (!res.ok) throw await failure(res);
    const data = await res.json().catch(() => ({}));
    if (!data.id) throw new BackendError("shape", "The sync server answered in an unexpected way.");
    return data.id;
  },
  async read(room) {
    const res = await call(`${own()}/rooms/${room}`, { headers: { Accept: "application/json" } });
    if (res.status === 404) return null;
    if (!res.ok) throw await failure(res);
    return res.json();
  },
  async write(room, doc) {
    const res = await call(`${own()}/rooms/${room}`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(doc) });
    if (!res.ok) throw await failure(res);
  }
};

/* ---- MantleDB ---- */
const MN = "https://mantledb.sh/v2";
const mantle = {
  id: "mn", label: "MantleDB (mantledb.sh, free, no account)",
  available: () => true,
  async create(doc) {
    const room = `tp${hex(10)}/s`;           // a random, unguessable namespace; one entry inside it
    const res = await call(`${MN}/${room}`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(doc) });
    if (!res.ok) throw await failure(res);
    return room;
  },
  async read(room) {
    const res = await call(`${MN}/${room}`, { headers: { Accept: "application/json" } });
    if (res.status === 404) return null;
    if (!res.ok) throw await failure(res);
    const text = await res.text();
    try { return text ? JSON.parse(text) : null; } catch (e) { throw new BackendError("shape", "The service returned something that is not JSON."); }
  },
  async write(room, doc) {
    const res = await call(`${MN}/${room}`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(doc) });
    if (!res.ok) throw await failure(res);
  }
};

/* ---- jsonstorage.net ---- */
const JS = "https://api.jsonstorage.net/v1/json";
const jsonstorage = {
  id: "js", label: "jsonstorage.net",
  available: () => true,
  async create(doc) {
    const res = await call(JS, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(doc) });
    if (!res.ok) throw await failure(res);
    let data = {};
    try { data = await res.json(); } catch (e) { /* handled below */ }
    const m = String(data.uri || "").match(/\/v1\/json\/([^?#]+)/);
    if (!m) throw new BackendError("shape", "The service answered in an unexpected way.");
    return m[1];
  },
  async read(room) {
    const res = await call(`${JS}/${room}`, { headers: { Accept: "application/json" } });
    if (res.status === 404) return null;
    if (!res.ok) throw await failure(res);
    return res.json();
  },
  async write(room, doc) {
    const res = await call(`${JS}/${room}`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(doc) });
    if (!res.ok) throw await failure(res);
  }
};

const ALL = [endpoint, mantle, jsonstorage];
export const providers = () => ALL.filter(p => p.available());
export function getBackend(id) {
  const be = ALL.find(p => p.id === id);
  if (!be) throw new BackendError("config", "This trip uses a sync service this copy of the app does not know.");
  if (!be.available()) throw new BackendError("config", "This trip uses a sync server that is not set up in this copy of the app.");
  return be;
}

/* create + read back + update + read back, reporting each step */
export async function testProvider(be) {
  const steps = [];
  const step = async (label, fn) => { try { const r = await fn(); steps.push({ label, ok: true }); return r; } catch (e) { steps.push({ label, ok: false, msg: e.message }); throw e; } };
  try {
    const room = await step("Create a private item", () => be.create({ app: "trip-pilot", test: "ping", t: Date.now() }));
    const a = await step("Read it back", () => be.read(room));
    if (!a || a.test !== "ping") throw new BackendError("mismatch", "What was read back did not match what was saved.");
    await step("Update it", () => be.write(room, { app: "trip-pilot", test: "pong", t: Date.now() }));
    const b = await step("Read the update", () => be.read(room));
    if (!b || b.test !== "pong") throw new BackendError("mismatch", "The update was not stored.");
    return { id: be.id, label: be.label, ok: true, steps };
  } catch (e) { return { id: be.id, label: be.label, ok: false, steps, error: e.message }; }
}
export async function testAll() { const out = []; for (const be of providers()) out.push(await testProvider(be)); return out; }
