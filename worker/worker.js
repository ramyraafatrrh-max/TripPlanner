// Optional: your own tiny sync server for live progress, on Cloudflare Workers (free plan).
// It stores one encrypted JSON document per trip "room". It never sees any readable trip data,
// because the app encrypts everything with a key that only lives inside the share link.
//
// Setup (about 5 minutes, once, by you the app owner; your users need no account):
//  1. dash.cloudflare.com > Workers & Pages > KV > Create a namespace, call it "trip-rooms".
//  2. Workers & Pages > Create > Worker. Paste this file in and deploy.
//  3. Worker > Settings > Bindings > Add > KV namespace: variable name ROOMS, namespace trip-rooms.
//  4. Copy the worker address (https://something.workers.dev) into js/config.js as "endpoint".
//
// API:  POST /rooms -> {id}   GET /rooms/:id   PUT /rooms/:id   (all JSON)

const MAX_BYTES = 65536;                    // one trip's progress is tiny; this blocks misuse
const TTL_SECONDS = 60 * 60 * 24 * 120;     // a room expires after 120 days without a change
const ID_RE = /^[A-Za-z0-9_-]{16,48}$/;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400"
};
const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: Object.assign({ "content-type": "application/json", "cache-control": "no-store" }, CORS) });

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BYTES) return { error: reply({ error: "too large" }, 413) };
  try { JSON.parse(text); } catch (e) { return { error: reply({ error: "invalid json" }, 400) }; }
  return { text };
}
function newId() {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const parts = new URL(request.url).pathname.split("/").filter(Boolean);
    if (parts[0] !== "rooms") return reply({ error: "not found" }, 404);

    if (parts.length === 1 && request.method === "POST") {
      const body = await readJson(request);
      if (body.error) return body.error;
      const id = newId();
      await env.ROOMS.put(id, body.text, { expirationTtl: TTL_SECONDS });
      return reply({ id }, 201);
    }
    if (parts.length === 2 && ID_RE.test(parts[1])) {
      const id = parts[1];
      if (request.method === "GET") {
        const value = await env.ROOMS.get(id);
        if (value === null) return reply({ error: "not found" }, 404);
        return new Response(value, { status: 200, headers: Object.assign({ "content-type": "application/json", "cache-control": "no-store" }, CORS) });
      }
      if (request.method === "PUT") {
        const body = await readJson(request);
        if (body.error) return body.error;
        await env.ROOMS.put(id, body.text, { expirationTtl: TTL_SECONDS });
        return reply({ ok: true });
      }
    }
    return reply({ error: "not found" }, 404);
  }
};
