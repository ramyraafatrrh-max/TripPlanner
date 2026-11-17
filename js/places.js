/* places.js - information about a place from open sources that allow browser access,
   plus one-tap links to TripAdvisor and other travel sites (which block direct fetching). */
import { settings, save } from "./store.js";
import { shortStopName } from "./util.js";

export function searchTermFor(stop) {
  if (stop.searchTerm) return stop.searchTerm;
  const q = (stop.query || "").trim();
  if (q && /^[\x00-\x7F]+$/.test(q) && q.length < 60) return q;
  let t = shortStopName(stop.name);
  t = t.split(/\s+and\s+|,/i)[0].trim();
  return t || stop.name;
}

export function stopLinks(stop) {
  const term = searchTermFor(stop);
  const q = encodeURIComponent(term);
  const mq = encodeURIComponent(stop.query || term);
  return [
    { id: "ta", label: "TripAdvisor", url: `https://www.tripadvisor.com/Search?q=${q}` },
    { id: "gm", label: "Google Maps reviews", url: `https://www.google.com/maps/search/?api=1&query=${mq}` },
    { id: "wv", label: "Wikivoyage", url: `https://en.wikivoyage.org/w/index.php?search=${q}` },
    { id: "wp", label: "Wikipedia", url: `https://en.wikipedia.org/w/index.php?search=${q}` },
    { id: "gs", label: "Opening hours (Google)", url: `https://www.google.com/search?q=${encodeURIComponent(term + " opening hours admission")}` },
    { id: "yt", label: "YouTube", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(term + " travel")}` }
  ];
}

async function wikiQuery(domain, term) {
  const key = domain + "|" + term.toLowerCase();
  const cache = settings().wiki;
  if (cache[key] && Date.now() - cache[key].t < 7 * 86400000) return cache[key].v;
  const url = `https://${domain}/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrlimit=1` +
    `&prop=extracts%7Cpageimages%7Cinfo&exintro=1&explaintext=1&exsentences=4&piprop=thumbnail&pithumbsize=520&inprop=url&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const json = await res.json();
  const pages = json.query && json.query.pages ? Object.values(json.query.pages) : [];
  let v = null;
  if (pages.length) {
    const p = pages[0];
    v = { title: p.title, extract: (p.extract || "").trim(), image: p.thumbnail ? p.thumbnail.source : "", url: p.fullurl || "" };
  }
  cache[key] = { t: Date.now(), v };
  save();
  return v;
}

/* returns [{source, title, extract, image, url}] */
export async function webInfo(term) {
  const out = [];
  const jobs = [
    { source: "Wikipedia", domain: "en.wikipedia.org" },
    { source: "Wikivoyage", domain: "en.wikivoyage.org" }
  ].map(async j => {
    try {
      const v = await wikiQuery(j.domain, term);
      if (v && v.extract) out.push(Object.assign({ source: j.source }, v));
    } catch (e) { out.push({ source: j.source, error: true }); }
  });
  await Promise.all(jobs);
  out.sort((a, b) => (a.source < b.source ? 1 : -1));
  return out;
}
