/* app.js - router, welcome page, new-trip flow */
import { h, fmtShort, fmtLong, clip } from "./util.js";
import * as store from "./store.js";
import { extractPages, pagesToText, parseItinerary, parseHotel, parseFlights, detectYears, groupLines } from "./parser.js";
import { getPdfjs } from "./pdfloader.js";
import { $, nav, navigate, shell, fly, toast, confirmSheet } from "./ui.js";
import { planView, placeView, hotelsView, flightsView, settingsView } from "./views-trip.js";

const app = $("#app");
let draft = null;

/* =====================================================================
   WELCOME
   ===================================================================== */
function dropZone(key, icon, title, hint, multiple, files, onChange) {
  const input = h("input", { type: "file", accept: "application/pdf,.pdf", multiple: !!multiple, "aria-label": title });
  const nameEl = h("small", null, hint);
  const label = h("label", { class: "drop" }, input, h("span", { class: "ic" }, icon), h("span", null, h("b", null, title), nameEl));
  const set = list => {
    files[key] = multiple ? list : list.slice(0, 1);
    label.classList.toggle("has", files[key].length > 0);
    nameEl.textContent = files[key].length ? files[key].map(f => f.name).join(", ") : hint;
    onChange();
  };
  input.addEventListener("change", () => set(Array.from(input.files || [])));
  ["dragenter", "dragover"].forEach(ev => label.addEventListener(ev, e => { e.preventDefault(); label.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => label.addEventListener(ev, e => { e.preventDefault(); label.classList.remove("over"); }));
  label.addEventListener("drop", e => set(Array.from(e.dataTransfer.files || []).filter(f => /pdf$/i.test(f.name) || f.type === "application/pdf")));
  return label;
}

function welcomeView() {
  const files = { itin: [], hotels: [], flights: [] };
  const go = h("button", { class: "btn sun block", type: "button", disabled: true }, "\u2708\uFE0F Process my documents");
  const status = h("p", { class: "muted", "aria-live": "polite" });
  const refresh = () => { go.disabled = files.itin.length === 0; };

  go.addEventListener("click", async () => {
    go.disabled = true;
    status.innerHTML = "";
    status.appendChild(h("span", { class: "spinner" }));
    status.appendChild(document.createTextNode("Reading your documents\u2026"));
    try {
      const pdfjs = await getPdfjs();
      const read = async f => { const pages = await extractPages(pdfjs, new Uint8Array(await f.arrayBuffer())); return { name: f.name, pages, text: pagesToText(pages) }; };
      const itin = await read(files.itin[0]);
      const parsed = parseItinerary(itin.pages);
      if (!parsed.stops.length) throw new Error("I could not find any day-by-day entries in that PDF. Make sure it is a text PDF (not a scan).");
      const hotels = [], flights = [];
      for (const f of files.hotels) { const d = await read(f); hotels.push(parseHotel(d.text, d.name, parsed.year)); }
      for (const f of files.flights) { const d = await read(f); flights.push(...parseFlights(d.text, d.name, parsed.year)); }
      draft = { itin, parsed, hotels, flights, name: suggestName(itin) };
      navigate("#/new");
    } catch (e) {
      console.error(e);
      status.innerHTML = "";
      status.appendChild(h("div", { class: "warn" }, e.message || String(e)));
      refresh();
    }
  });

  const drops = h("div", { class: "drops" },
    dropZone("itin", "\uD83D\uDCC4", "Travel itinerary (PDF)", "Required. Tap to choose or drop it here.", false, files, refresh),
    dropZone("hotels", "\uD83C\uDFE8", "Hotel bookings (PDF)", "Optional. You can choose several.", true, files, refresh),
    dropZone("flights", "\u2708\uFE0F", "Flight itinerary or tickets (PDF)", "Optional. You can choose several.", true, files, refresh));

  const trips = store.trips();
  const list = h("div");
  if (!trips.length) list.appendChild(h("div", { class: "card empty" }, "No trips yet. Upload an itinerary above to create your first one."));
  trips.slice().sort((a, b) => b.createdAt - a.createdAt).forEach(t => {
    const p = store.progress(t);
    const first = t.days[0]?.date, last = t.days[t.days.length - 1]?.date;
    list.appendChild(h("div", { style: { position: "relative" } },
      h("button", { class: "trip-card", type: "button", onclick: () => navigate(`#/trip/${t.id}/plan`), "aria-label": "Open " + t.name },
        h("div", { class: "band" }),
        h("div", { class: "body" }, h("h3", null, t.name),
          h("div", { class: "muted" }, `${fmtShort(first)} \u2013 ${fmtShort(last)} \u00B7 ${t.days.length} days \u00B7 ${t.hotels.length} hotel(s) \u00B7 ${t.flights.length} flight(s)`),
          h("div", { class: "bar" }, h("i", { style: { width: p.pct + "%" } })),
          h("div", { class: "muted" }, `${p.done} of ${p.total} places visited (${p.pct}%)`))),
      h("button", { class: "iconbtn", type: "button", "aria-label": "Delete " + t.name, style: { position: "absolute", right: "10px", top: "10px", background: "rgba(0,0,0,.28)", width: "34px", height: "34px", fontSize: ".9rem" },
        onclick: () => confirmSheet("Delete this trip?", "\"" + t.name + "\" and your progress will be removed from this device.", "Delete", () => { store.removeTrip(t.id); navigate("#/"); }) }, "\u2715")));
  });

  return h("div", { class: "page" },
    h("div", { class: "hero" }, h("div", { class: "logo" }, "\uD83E\uDDF3"), h("h1", null, "Trip Pilot"), h("p", null, "Turn your travel PDFs into a living day-by-day plan with maps, progress and morning alerts.")),
    h("div", { class: "card" }, h("h2", null, "Start a new trip"), drops, h("div", { style: { marginTop: "12px" } }, go), status),
    h("h2", { class: "section-title" }, "\u2705 Confirmed trips"), list,
    h("p", { class: "muted", style: { color: "#fff", textAlign: "center", marginTop: "24px" } }, "Your files are read on this phone. Nothing is uploaded anywhere."));
}

function suggestName(itin) {
  const first = itin.pages[0] && groupLines(itin.pages[0].items).find(l => l.h > 12);
  let n = first ? first.text : itin.name.replace(/\.pdf$/i, "");
  n = n.replace(/\s*Itinerary.*$/i, "").replace(/\s+Markets and Lights/i, "").trim();
  return clip(n || itin.name.replace(/\.pdf$/i, ""), 60);
}

/* =====================================================================
   NEW TRIP (after processing)
   ===================================================================== */
function newTripView() {
  if (!draft) { setTimeout(() => navigate("#/"), 0); return h("div"); }
  const name = h("input", { type: "text", value: draft.name, "aria-label": "Trip name" });
  const year = h("input", { type: "number", value: draft.parsed.year, min: 2000, max: 2100, "aria-label": "Start year" });
  const stats = h("div");

  const drawStats = () => {
    const p = draft.parsed;
    const dates = Array.from(new Set(p.stops.map(s => s.date))).sort();
    stats.innerHTML = "";
    stats.appendChild(h("div", { class: "meta-line" },
      h("span", { class: "pill green" }, dates.length + " days"), h("span", { class: "pill green" }, p.stops.length + " places"),
      h("span", { class: "pill" + (draft.hotels.length ? " green" : " sun") }, draft.hotels.length + " hotel(s)"),
      h("span", { class: "pill" + (draft.flights.length ? " green" : " sun") }, draft.flights.length + " flight(s)")));
    stats.appendChild(h("p", null, `Trip dates: ${fmtLong(dates[0])} to ${fmtLong(dates[dates.length - 1])}`));
    if (p.mode === "generic") stats.appendChild(h("div", { class: "warn" }, "This PDF is not in the table layout I know best, so I split it by date headings. Please check the days after creating the trip."));
    if (!draft.hotels.length) stats.appendChild(h("div", { class: "warn" }, "No hotel bookings were added. You can add them later in the Hotels tab."));
    if (!draft.flights.length) stats.appendChild(h("div", { class: "warn" }, "No flights were added. You can add them later in the Flights tab."));
    const ex = h("details", null, h("summary", null, "Preview of what I found"));
    dates.slice(0, 4).forEach(d => ex.appendChild(h("p", { style: { margin: "6px 0" } }, h("b", null, fmtLong(d) + ": "), p.stops.filter(s => s.date === d).map(s => clip(s.name, 40)).join(" \u2192 "))));
    stats.appendChild(ex);
  };
  drawStats();
  year.addEventListener("change", () => { draft.parsed = parseItinerary(draft.itin.pages, { year: +year.value }); drawStats(); });

  const create = h("button", { class: "btn sun block", type: "button" }, "\u2705 Create trip");
  create.addEventListener("click", () => {
    const trip = store.buildTrip({ name: name.value.trim() || "My trip", year: +year.value, stops: draft.parsed.stops, hotels: draft.hotels, flights: draft.flights, sources: [draft.itin.name] });
    store.addTrip(trip);
    draft = null;
    toast("Trip created. Have a great journey!");
    navigate(`#/trip/${trip.id}/plan`);
  });

  return shell({ title: "New trip", back: "#/", body: h("div", null,
    h("div", { class: "card" }, h("h2", null, "\uD83C\uDF89 Your documents are ready"), stats),
    h("div", { class: "card" }, h("h2", null, "Name this trip"), h("label", { class: "field" }, "Trip name"), name,
      h("label", { class: "field" }, "Year the trip starts"), year, h("p", { class: "muted" }, "Change the year if the dates look wrong."), h("div", { style: { marginTop: "14px" } }, create))) });
}

/* =====================================================================
   ROUTER
   ===================================================================== */
function parseRoute() {
  const parts = (location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
  if (!parts.length) return { name: "welcome", depth: 0, order: 0 };
  if (parts[0] === "new") return { name: "new", depth: 1, order: 0 };
  if (parts[0] === "trip" && parts[1]) {
    const id = parts[1], sec = parts[2] || "plan";
    if (sec === "plan") return { name: "plan", id, date: parts[3], depth: 1, order: 0 };
    if (sec === "hotels") return { name: "hotels", id, depth: 1, order: 1 };
    if (sec === "flights") return { name: "flights", id, depth: 1, order: 2 };
    if (sec === "place") return { name: "place", id, stopId: parts[3], depth: 2, order: 0 };
    if (sec === "settings") return { name: "settings", id, depth: 2, order: 0 };
  }
  return { name: "welcome", depth: 0, order: 0 };
}

let prev = null, token = 0;
function direction(a, b) {
  if (!a) return "up";
  if (a.depth !== b.depth) return b.depth > a.depth ? "right" : "left";
  if (a.id && a.id === b.id && a.order !== b.order) return b.order > a.order ? "right" : "left";
  return "right";
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function render() {
  const route = parseRoute();
  const my = ++token;
  const dir = direction(prev, route);
  const old = app.firstElementChild;
  const skipFly = prev && prev.name === "plan" && route.name === "plan" && prev.id === route.id;
  if (old && !skipFly) { fly(dir); old.classList.add("leave"); await sleep(170); }
  if (my !== token) return;
  let el;
  try {
    el = ({ welcome: welcomeView, new: newTripView, plan: planView, hotels: hotelsView, flights: flightsView, place: placeView, settings: settingsView }[route.name])(route);
  } catch (e) {
    console.error(e);
    el = h("div", { class: "page" }, h("div", { class: "card" }, h("h2", null, "Something went wrong"), h("p", null, String(e && e.message || e)), h("a", { class: "btn", href: "#/" }, "Back to start")));
  }
  el.classList.add("view", dir === "left" ? "enter-left" : dir === "up" ? "enter-up" : "enter-right");
  app.innerHTML = "";
  app.appendChild(el);
  document.body.classList.toggle("dim", route.name !== "welcome");
  window.scrollTo(0, 0);
  prev = route;
}

window.addEventListener("hashchange", () => {
  const cur = location.hash || "#/";
  if (nav.isBack) nav.isBack = false;
  else if (nav.stack[nav.stack.length - 1] !== cur) nav.stack.push(cur);
  render();
});

store.load();
nav.stack.push(location.hash || "#/");
render();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
