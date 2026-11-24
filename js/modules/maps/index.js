/* maps module: everything about Google Maps links. Other modules call it through the "maps" service.
   - parseLink()  reads a pasted Google Maps link (place name and coordinates when the link contains them)
   - placeUrl()   the link that opens a place: the link you pasted, or a Google Maps search
   - dirUrl()     directions to a place;  routeUrls() a multi-stop route for a day                                         */
const enc = encodeURIComponent;
const num = v => (v === null || v === undefined || v === "" ? NaN : +v);
const hasPt = s => !!s && Number.isFinite(num(s.lat)) && Number.isFinite(num(s.lng));
const pt = s => `${(+s.lat).toFixed(6)},${(+s.lng).toFixed(6)}`;
/* coordinates are used for directions only when they are exact (from a pasted link, GPS in a booking, or typed by hand) */
const exact = s => hasPt(s) && ["link", "gps", "manual"].includes(s.locSrc);

export function parseLink(raw) {
  const text = String(raw || "").trim(); if (!text) return null;
  const c = /^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/.exec(text);
  if (c) return { ok: true, url: `https://www.google.com/maps/search/?api=1&query=${c[1]},${c[2]}`, lat: +c[1], lng: +c[2], name: "", short: false };
  let u; try { u = new URL(/^https?:\/\//i.test(text) ? text : "https://" + text); } catch (e) { return { ok: false, error: "That does not look like a link." }; }
  if (!u.hostname.includes(".")) return { ok: false, error: "That does not look like a link." };
  const host = u.hostname.toLowerCase(), href = u.href;
  const google = /(^|\.)google\.[a-z.]+$/.test(host) || /(^|\.)goo\.gl$/.test(host) || host === "g.co";
  const short = host === "maps.app.goo.gl" || host === "goo.gl" || host === "g.co";
  if (!google) return { ok: true, url: href, lat: NaN, lng: NaN, name: "", short: false, warn: "This is not a Google Maps link, but I will keep it as the link for this place." };
  let name = "", lat = NaN, lng = NaN;
  const dec = s => { try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch (e) { return s.replace(/\+/g, " "); } };
  const pm = /\/maps\/place\/([^/@?]+)/.exec(u.pathname) || /\/maps\/search\/([^/@?]+)/.exec(u.pathname);
  if (pm) name = dec(pm[1]);
  const q = u.searchParams.get("query") || u.searchParams.get("q") || u.searchParams.get("destination") || "";
  const qc = /^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/.exec(q);
  if (qc) { lat = +qc[1]; lng = +qc[2]; } else if (q && !name) name = q.replace(/\+/g, " ");
  const d = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(href) || /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(href);
  if (d && !Number.isFinite(lat)) { lat = +d[1]; lng = +d[2]; }
  const ll = /^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/.exec(u.searchParams.get("ll") || u.searchParams.get("center") || "");
  if (ll && !Number.isFinite(lat)) { lat = +ll[1]; lng = +ll[2]; }
  return { ok: true, url: href, lat, lng, name, short, warn: short && !Number.isFinite(lat) ? "This is a short link, so I cannot read its location. It will still open in Google Maps. Add the place name, or paste the long link, to place it on the route." : "" };
}
const queryOf = s => (typeof s === "string" ? s : (s.query || s.name || "").trim());
export const placeUrl = s => (typeof s !== "string" && s.mapUrl) ? s.mapUrl : `https://www.google.com/maps/search/?api=1&query=${enc(exact(s) && typeof s !== "string" ? pt(s) : queryOf(s))}`;
export const dirUrl = s => {
  if (typeof s !== "string" && s.mapUrl && !exact(s)) { const p = parseLink(s.mapUrl); if (p && p.short) return s.mapUrl; }
  return `https://www.google.com/maps/dir/?api=1&destination=${enc(typeof s !== "string" && exact(s) ? pt(s) : queryOf(s))}`;
};
export const nextStopUrl = s => dirUrl(s);
const pointOf = s => (exact(s) ? pt(s) : queryOf(s));
/* Google Maps routes take a handful of points per link, so long days are split into parts */
export function routeUrls(stops, { origin = "" } = {}) {
  const pts = stops.filter(s => s && (queryOf(s) || exact(s))).map(pointOf);
  if (origin) pts.unshift(origin);
  if (pts.length < 2) return pts.length ? [{ label: "Open route", url: `https://www.google.com/maps/search/?api=1&query=${enc(pts[0])}` }] : [];
  const out = [], size = 9;
  for (let i = 0; i < pts.length - 1; i += size - 1) {
    const part = pts.slice(i, i + size); if (part.length < 2) break;
    out.push({ url: "https://www.google.com/maps/dir/" + part.map(enc).join("/") + "/" });
  }
  return out.map((o, i) => ({ url: o.url, label: out.length > 1 ? `Route ${i + 1} of ${out.length}` : "Open route" }));
}
export const placeEmbed = s => `https://maps.google.com/maps?q=${enc(typeof s !== "string" && exact(s) ? pt(s) : queryOf(s))}&output=embed`;
export function routeEmbed(stops, origin = "") {
  const pts = stops.filter(s => s && (queryOf(s) || exact(s))).map(pointOf); if (origin) pts.unshift(origin);
  if (pts.length < 2) return `https://maps.google.com/maps?q=${enc(pts[0] || "")}&output=embed`;
  return `https://maps.google.com/maps?saddr=${enc(pts[0])}&daddr=${enc(pts.slice(1).join(" to:"))}&output=embed`;
}

export default {
  id: "maps", version: "2.0.0", title: "Google Maps links",
  description: "Builds and reads Google Maps links: place links, directions and day routes.",
  init(ctx) { ctx.service("maps", { parseLink, placeUrl, dirUrl, nextStopUrl, routeUrls, placeEmbed, routeEmbed, hasPt, exact, pt }); }
};
