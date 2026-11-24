/* wiki.js - short descriptions from Wikipedia and Wikivoyage (free, no key). TripAdvisor and other sites do not allow apps to read
   their pages, so for those we only give links. */
import { settings, save } from "../../core/store.js";
import { shortName } from "../../core/util.js";
const enc = encodeURIComponent, WEEK = 7 * 86400000;
async function one(host, label, term) {
  const s = await (await fetch(`https://${host}/w/api.php?action=query&list=search&srsearch=${enc(term)}&srlimit=1&format=json&origin=*`)).json();
  const hit = s.query && s.query.search && s.query.search[0]; if (!hit) return null;
  const r = await fetch(`https://${host}/api/rest_v1/page/summary/${enc(hit.title.replace(/ /g, "_"))}`); if (!r.ok) return null;
  const j = await r.json(); if (!j.extract) return null;
  return { source: label, title: j.title, extract: j.extract.slice(0, 520), image: j.thumbnail && j.thumbnail.source, url: j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page };
}
export async function webInfo(term) {
  const c = settings().wiki || (settings().wiki = {}); const k = term.toLowerCase();
  if (c[k] && Date.now() - c[k].t < WEEK) return c[k].v;
  const out = [];
  for (const [host, label] of [["en.wikipedia.org", "Wikipedia"], ["en.wikivoyage.org", "Wikivoyage"]]) { try { const r = await one(host, label, term); if (r) out.push(r); } catch (e) { out.push({ error: true, source: label }); } }
  if (out.some(o => !o.error)) { c[k] = { t: Date.now(), v: out }; save(true); }
  return out;
}
export const searchTermFor = stop => stop.searchTerm || `${shortName(stop.name).replace(/^[A-Za-z ]+:\s*/, "")} ${stop.city || ""}`.trim();
export function stopLinks(stop) {
  const q = enc(`${shortName(stop.name).replace(/^[A-Za-z ]+:\s*/, "")} ${stop.city || ""}`.trim());
  return [{ label: "TripAdvisor", url: `https://www.tripadvisor.com/Search?q=${q}` }, { label: "Google reviews", url: `https://www.google.com/search?q=${q}+reviews` },
    { label: "Wikipedia", url: `https://en.wikipedia.org/w/index.php?search=${q}` }, { label: "Japan Guide", url: `https://www.japan-guide.com/search/?q=${q}` }, { label: "Photos", url: `https://www.google.com/search?tbm=isch&q=${q}` }];
}
