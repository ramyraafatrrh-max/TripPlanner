/* share.js - show your trips on another phone through a link.
   Your trips are encrypted on this phone (AES-256-GCM) and only the encrypted file is stored in your GitHub repository.
   The key lives only inside the link, so nobody who browses the repository can read your plans. */
import * as store from "./store.js";
import { settings } from "./store.js";
import { appBase } from "./notify.js";
import { uid } from "./util.js";

const enc = new TextEncoder(), dec = new TextDecoder();

/* ---------- base64 ---------- */
function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const toB64u = b => toB64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = s => fromB64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
export const newSecret = n => toB64u(crypto.getRandomValues(new Uint8Array(n)));

/* ---------- encryption ---------- */
const cryptoKey = (k, usage) => crypto.subtle.importKey("raw", fromB64u(k), "AES-GCM", false, [usage]);
export async function encryptJSON(obj, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(key, "encrypt"), enc.encode(JSON.stringify(obj))));
  return { app: "trip-pilot", v: 1, iv: toB64(iv), ct: toB64(ct) };
}
export async function decryptJSON(file, key) {
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(file.iv) }, await cryptoKey(key, "decrypt"), fromB64(file.ct));
    return JSON.parse(dec.decode(pt));
  } catch (e) { throw new ShareError("badkey", "This link is incomplete or damaged. Ask for the link again."); }
}

export class ShareError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

/* ---------- GitHub storage ---------- */
const API = "https://api.github.com";
const pathFor = id => `data/shared/${id}.json`;
async function gh(url, token, opts = {}) {
  const headers = Object.assign({ Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, opts.headers || {});
  if (token) headers.Authorization = "Bearer " + token;
  return fetch(url, Object.assign({}, opts, { headers, cache: "no-store" }));
}
function explain(res, what) {
  if (res.status === 401) return new ShareError("token", "GitHub did not accept the token. Create a new one and try again.");
  if (res.status === 403) return new ShareError("limit", "GitHub is limiting requests right now. Wait a few minutes and try again.");
  if (res.status === 404) return new ShareError("notfound", what === "write" ? "GitHub could not find that repository, or the token does not have access to it." : "These shared trips were not found. The link may be wrong, or sharing was stopped.");
  if (res.status === 422) return new ShareError("conflict", "GitHub rejected the update. Try again.");
  return new ShareError("http", `GitHub replied ${res.status}.`);
}
export async function readRemote(owner, repo, id, token) {
  let res;
  try { res = await gh(`${API}/repos/${owner}/${repo}/contents/${pathFor(id)}`, token, { headers: { Accept: "application/vnd.github.raw+json" } }); }
  catch (e) { throw new ShareError("offline", "Could not reach GitHub. Check your connection."); }
  if (res.status === 403 || res.status === 429) {
    try { res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${pathFor(id)}`, { cache: "no-store" }); } catch (e) { /* keep original */ }
  }
  if (!res.ok) throw explain(res, "read");
  return res.json();
}
export async function writeRemote(owner, repo, id, token, payload, attempt = 0) {
  const url = `${API}/repos/${owner}/${repo}/contents/${pathFor(id)}`;
  let sha;
  let cur;
  try { cur = await gh(url, token); } catch (e) { throw new ShareError("offline", "Could not reach GitHub. Check your connection."); }
  if (cur.ok) sha = (await cur.json()).sha; else if (cur.status !== 404) throw explain(cur, "write");
  const body = { message: "Update shared trips", content: toB64(enc.encode(JSON.stringify(payload))) };
  if (sha) body.sha = sha;
  const put = await gh(url, token, { method: "PUT", body: JSON.stringify(body) });
  if (!put.ok) {
    if ((put.status === 409 || put.status === 422) && attempt < 1) return writeRemote(owner, repo, id, token, payload, attempt + 1);
    throw explain(put, "write");
  }
}
export async function deleteRemote(owner, repo, id, token) {
  const url = `${API}/repos/${owner}/${repo}/contents/${pathFor(id)}`;
  const cur = await gh(url, token);
  if (!cur.ok) return false;
  const sha = (await cur.json()).sha;
  const del = await gh(url, token, { method: "DELETE", body: JSON.stringify({ message: "Stop sharing", sha }) });
  return del.ok;
}

/* ---------- profile (this phone's sharing state) ---------- */
export const profile = () => settings().profile || null;
export function repoGuess() {
  const s = settings();
  let owner = s.ghOwner, repo = s.ghRepo;
  if ((!owner || !repo) && location.hostname.endsWith(".github.io")) { owner = owner || location.hostname.split(".")[0]; repo = repo || location.pathname.split("/").filter(Boolean)[0] || ""; }
  return { owner: owner || "", repo: repo || "" };
}
export const linkFor = p => `${appBase()}#/join?o=${encodeURIComponent(p.owner)}&r=${encodeURIComponent(p.repo)}&id=${p.id}&k=${p.key}`;
export function parseLink(text) {
  try {
    const t = String(text || "").trim();
    const q = t.includes("?") ? t.slice(t.indexOf("?") + 1) : t;
    const p = new URLSearchParams(q);
    const o = p.get("o"), r = p.get("r"), id = p.get("id"), k = p.get("k");
    return o && r && id && k ? { o, r, id, k } : null;
  } catch (e) { return null; }
}

/* live status shown on screen */
export const status = { state: "idle", msg: "" };
function setStatus(state, msg = "") { status.state = state; status.msg = msg; window.dispatchEvent(new CustomEvent("share-status")); }
export function ago(ts) {
  if (!ts) return "never";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return Math.round(s / 86400) + " d ago";
}

/* what gets uploaded: every trip on this phone that this phone owns */
function snapshot(p) {
  const list = store.trips().filter(t => !t.viaShare).map(t => {
    const c = JSON.parse(JSON.stringify(t));
    if (c.settings) c.settings.scheduled = {};
    return c;
  });
  return { v: 1, updated: Date.now(), trips: list, by: p.id };
}
export async function pushNow() {
  const p = profile();
  if (!p || p.role !== "owner") return;
  const token = settings().ghToken;
  if (!token) throw new ShareError("token", "Add your GitHub token first.");
  setStatus("syncing", "Syncing\u2026");
  try {
    const snap = snapshot(p);
    await writeRemote(p.owner, p.repo, p.id, token, await encryptJSON(snap, p.key));
    p.lastPush = Date.now(); p.lastSeen = snap.updated;
    store.save(true);
    setStatus("ok", "Synced " + ago(p.lastPush));
  } catch (e) { setStatus("error", e.message); throw e; }
}

let pushTimer = null;
export function initSharing() {
  store.setSaveHook(() => {
    const p = profile();
    if (!p || p.role !== "owner" || !settings().ghToken) return;
    clearTimeout(pushTimer);
    setStatus("pending", "Changes waiting to sync\u2026");
    pushTimer = setTimeout(() => pushNow().catch(() => {}), 4000);
  });
}

export async function createProfile({ token, owner, repo }) {
  const s = settings();
  owner = (owner || "").trim(); repo = (repo || "").trim(); token = (token || "").trim();
  if (!token || !owner || !repo) throw new ShareError("fields", "Fill in the token, your GitHub username and the repository name.");
  s.ghToken = token; s.ghOwner = owner; s.ghRepo = repo;
  const p = { id: newSecret(12), key: newSecret(32), owner, repo, role: "owner", createdAt: Date.now(), lastPush: 0, lastSeen: 0 };
  s.profile = p;
  store.save(true);
  try { await pushNow(); }
  catch (e) { s.profile = null; store.save(true); throw e; }
  return linkFor(p);
}
export async function stopSharing() {
  const p = profile();
  if (!p) return;
  const token = settings().ghToken;
  if (p.role === "owner" && token) { try { await deleteRemote(p.owner, p.repo, p.id, token); } catch (e) { /* best effort */ } }
  store.trips().forEach(t => { if (t.viaShare === p.id) delete t.viaShare; });
  settings().profile = null;
  store.save(true);
  setStatus("idle", "");
}

/* ---------- receiving ---------- */
export async function fetchShared({ o, r, id, k }) {
  const file = await readRemote(o, r, id, settings().ghToken);
  return decryptJSON(file, k);
}
function mergeShared(data, p) {
  const remoteIds = new Set(data.trips.map(t => t.id));
  let added = 0, updated = 0;
  data.trips.forEach(rt => {
    rt.viaShare = p.id;
    const lt = store.getTrip(rt.id);
    if (!lt) { store.trips().push(rt); added++; return; }
    const mine = new Map();
    lt.days.forEach(d => d.stops.forEach(s => mine.set(s.id, s)));
    rt.days.forEach(d => d.stops.forEach(s => { const o = mine.get(s.id); if (o) { s.visited = o.visited; s.visitedAt = o.visitedAt; if (o.notes) s.notes = o.notes; } }));
    const sched = (lt.settings && lt.settings.scheduled) || {};
    Object.keys(lt).forEach(key => delete lt[key]);
    Object.assign(lt, rt);
    lt.settings = Object.assign({ scheduled: {} }, lt.settings, { scheduled: sched });
    updated++;
  });
  const gone = store.trips().filter(t => t.viaShare === p.id && !remoteIds.has(t.id));
  gone.forEach(t => store.removeTrip(t.id));
  store.save(true);
  return { added, updated, removed: gone.length };
}
export function joinProfile(link, data) {
  const s = settings();
  const p = { id: link.id, key: link.k, owner: link.o, repo: link.r, role: "viewer", joinedAt: Date.now(), lastPull: Date.now(), lastSeen: data.updated };
  s.profile = p;
  const r = mergeShared(data, p);
  store.save(true);
  window.dispatchEvent(new CustomEvent("share-status"));
  return r;
}
/* viewer phones call this on start, when the app is reopened, and from the Refresh button */
export async function pullIfViewer(force = false) {
  const p = profile();
  if (!p || p.role !== "viewer") return null;
  if (!force && Date.now() - (p.lastPull || 0) < 45000) return null;
  setStatus("syncing", "Checking for updates\u2026");
  try {
    const data = await fetchShared({ o: p.owner, r: p.repo, id: p.id, k: p.key });
    p.lastPull = Date.now();
    let res = { added: 0, updated: 0, removed: 0, changed: false };
    if (data.updated !== p.lastSeen || force) {
      p.lastSeen = data.updated;
      res = Object.assign(mergeShared(data, p), { changed: true });
      window.dispatchEvent(new CustomEvent("trip-refresh"));
    }
    store.save(true);
    setStatus("ok", "Up to date " + ago(p.lastPull));
    return res;
  } catch (e) {
    if (e.code === "notfound") setStatus("error", "The owner stopped sharing, or the link no longer exists. Your copies stay on this phone.");
    else setStatus("error", e.message);
    return null;
  }
}
export function disconnectViewer() {
  const p = profile();
  if (!p) return;
  store.trips().forEach(t => { if (t.viaShare === p.id) delete t.viaShare; });
  settings().profile = null;
  store.save(true);
  setStatus("idle", "");
}

/* ---------- plain file fallback: no GitHub needed ---------- */
export function exportFile() {
  const list = store.trips().map(t => { const c = JSON.parse(JSON.stringify(t)); delete c.viaShare; return c; });
  return JSON.stringify({ app: "trip-pilot", v: 1, exported: Date.now(), trips: list }, null, 2);
}
export function importFile(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new ShareError("file", "That file is not a Trip Pilot export."); }
  if (!data || data.app !== "trip-pilot" || !Array.isArray(data.trips)) throw new ShareError("file", "That file is not a Trip Pilot export.");
  let n = 0;
  data.trips.forEach(t => {
    if (!t || !Array.isArray(t.days)) return;
    if (store.getTrip(t.id)) { t.id = uid("trip"); t.name = t.name + " (copy)"; }
    delete t.viaShare;
    store.trips().push(t); n++;
  });
  store.save();
  return n;
}
