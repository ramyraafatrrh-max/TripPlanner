// Optional: your own tiny sync server for live progress, on Cloudflare Workers (free plan).
// It stores one ENCRYPTED document per trip room. It never sees readable data: the app encrypts with a key that lives only inside the share link.
// Setup (about 5 minutes, once, by you; your users need no account):
//  1. dash.cloudflare.com > Storage & Databases > KV > Create a namespace called "trip-rooms".
//  2. Workers & Pages > Create > Worker. Paste this file and deploy.
//  3. Worker > Settings > Bindings > Add > KV namespace: variable name ROOMS, namespace trip-rooms.
//  4. Put the worker address (https://something.workers.dev) in js/config.js as live.endpoint.
const MAX = 65536, TTL = 60 * 60 * 24 * 120, ID = /^[A-Za-z0-9_-]{16,48}$/;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PUT,OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" };
const reply = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: Object.assign({ "content-type": "application/json", "cache-control": "no-store" }, CORS) });
async function body(req) { const t = await req.text(); if (t.length > MAX) return { e: reply({ error: "too large" }, 413) }; try { JSON.parse(t); } catch (e) { return { e: reply({ error: "invalid json" }, 400) }; } return { t }; }
const newId = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const p = new URL(req.url).pathname.split("/").filter(Boolean);
    if (p[0] !== "rooms") return reply({ error: "not found" }, 404);
    if (p.length === 1 && req.method === "POST") { const b = await body(req); if (b.e) return b.e; const id = newId(); await env.ROOMS.put(id, b.t, { expirationTtl: TTL }); return reply({ id }, 201); }
    if (p.length === 2 && ID.test(p[1])) {
      if (req.method === "GET") { const v = await env.ROOMS.get(p[1]); return v === null ? reply({ error: "not found" }, 404) : new Response(v, { headers: Object.assign({ "content-type": "application/json", "cache-control": "no-store" }, CORS) }); }
      if (req.method === "PUT") { const b = await body(req); if (b.e) return b.e; await env.ROOMS.put(p[1], b.t, { expirationTtl: TTL }); return reply({ ok: true }); }
    }
    return reply({ error: "not found" }, 404);
  }
};
