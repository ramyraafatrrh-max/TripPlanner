/* app.js - router, welcome page, new-trip flow */
import { h, fmtShort, fmtLong, clip } from "./util.js";
import * as store from "./store.js";
import { extractPages, pagesToText, parseItinerary, parseHotel, parseFlights, groupLines } from "./parser.js";
import { getPdfjs } from "./pdfloader.js";
import { $, go, shell, fly, toast, confirmSheet, setBackground } from "./ui.js";
import { ic, ring } from "./icons.js";
import { planView, placeView, hotelsView, flightsView, settingsView } from "./views-trip.js";

const app = $("#app");
let draft = null;

/* =====================================================================
   WELCOME
   ===================================================================== */
function dropZone(key, icon, title, hint, multiple, files, onChange) {
  const input = h("input", { type: "file", accept: "application/pdf,.pdf", multiple: !!multiple, "aria-label": title });
  const nameEl = h("small", null, hint);
  const label = h("label", { class: "drop" }, input, h("span", { class: "badge" }, ic(icon, 22)), h("span", { class: "grow" }, h("b", null, title), nameEl));
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
  const go_ = h("button", { class: "btn gold block", type: "button", disabled: true }, ic("plane", 18), "Process my documents");
  const status = h("div", { class: "muted", style: { marginTop: "10px" }, "aria-live": "polite" });
  const refresh = () => { go_.disabled = files.itin.length === 0; };

  go_.addEventListener("click", async () => {
    go_.disabled = true;
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
      go("#/new");
    } catch (e) {
      console.error(e);
      status.innerHTML = "";
      status.appendChild(h("div", { class: "warnbox" }, e.message || String(e)));
      refresh();
    }
  });

  const drops = h("div", { class: "drops" },
    dropZone("itin", "route", "Travel itinerary", "Required \u00B7 tap to choose a PDF", false, files, refresh),
    dropZone("hotels", "hotel", "Hotel bookings", "Optional \u00B7 you can add more later", true, files, refresh),
    dropZone("flights", "plane", "Flights and tickets", "Optional \u00B7 you can add more later", true, files, refresh));

  const trips = store.trips();
  const list = h("div");
  if (!trips.length) list.appendChild(h("div", { class: "glass card empty" }, ic("bag", 32), h("p", null, "No trips yet. Upload an itinerary above to create your first one.")));
  trips.slice().sort((a, b) => b.createdAt - a.createdAt).forEach(t => {
    const p = store.progress(t);
    const first = t.days[0]?.date, last = t.days[t.days.length - 1]?.date;
    list.appendChild(h("div", { class: "tripwrap" },
      h("button", { class: "trip-card", type: "button", onclick: () => go(`#/trip/${t.id}/plan`), "aria-label": "Open " + t.name },
        h("div", { class: "photo", style: { backgroundImage: `url("${store.coverUrl(store.coverKey(t))}")` } },
          h("div", { class: "over" }, h("span", { class: "eyebrow" }, `${fmtShort(first)} \u2013 ${fmtShort(last)} \u00B7 ${t.days.length} days`), h("h3", null, t.name))),
        h("div", { class: "foot" },
          h("div", { class: "stat-line" }, h("span", null, ic("hotel", 14), `${t.hotels.length} hotel${t.hotels.length === 1 ? "" : "s"}`), h("span", null, ic("plane", 14), `${t.flights.length} flight${t.flights.length === 1 ? "" : "s"}`), h("span", null, ic("pin", 14), `${p.total} places`)),
          h("div", { class: "bar" }, h("i", { style: { width: p.pct + "%" } })),
          h("div", { class: "muted" }, `${p.done} of ${p.total} visited \u00B7 ${p.pct}%`))),
      h("button", { class: "trip-del", type: "button", "aria-label": "Delete " + t.name,
        onclick: () => confirmSheet("Delete this trip?", "\"" + t.name + "\" and your progress will be removed from this device.", "Delete", () => { store.removeTrip(t.id); go("#/", { replace: true }); }) }, ic("x", 16))));
  });

  return h("div", { class: "screen" }, h("div", { class: "page" },
    h("header", { class: "hero" }, h("span", { class: "brand" }, "Trip Pilot"), h("h1", null, "Every journey, ", h("em", null, "beautifully"), " orchestrated."), h("p", null, "Drop in your travel PDFs and get a living day-by-day plan with maps, progress and morning alerts.")),
    h("section", { class: "glass card" }, h("span", { class: "eyebrow" }, "Begin"), h("h2", { style: { marginTop: "4px" } }, "Start a new trip"), drops, h("div", { style: { marginTop: "14px" } }, go_), status),
    h("h2", { class: "section-title" }, "Confirmed trips"), list,
    h("p", { class: "footnote" }, ic("check", 14), "Your files are read on this phone. Nothing is uploaded anywhere.")));
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
  if (!draft) { setTimeout(() => go("#/", { replace: true }), 0); return h("div"); }
  const name = h("input", { type: "text", value: draft.name, "aria-label": "Trip name" });
  const year = h("input", { type: "number", value: draft.parsed.year, min: 2000, max: 2100, "aria-label": "Start year" });
  const stats = h("div");
  const drawStats = () => {
    const p = draft.parsed;
    const dates = Array.from(new Set(p.stops.map(s => s.date))).sort();
    stats.innerHTML = "";
    stats.appendChild(h("div", { class: "meta-line" },
      h("span", { class: "pill green" }, dates.length + " days"), h("span", { class: "pill green" }, p.stops.length + " places"),
      h("span", { class: "pill " + (draft.hotels.length ? "green" : "warn") }, draft.hotels.length + " hotel(s)"), h("span", { class: "pill " + (draft.flights.length ? "green" : "warn") }, draft.flights.length + " flight(s)")));
    stats.appendChild(h("p", { class: "muted" }, `Trip dates: ${fmtLong(dates[0])} to ${fmtLong(dates[dates.length - 1])}`));
    if (p.mode === "generic") stats.appendChild(h("div", { class: "warnbox" }, "This PDF is not in the table layout I know best, so I split it by date headings. Please check the days after creating the trip."));
    if (!draft.hotels.length) stats.appendChild(h("div", { class: "warnbox" }, "No hotel bookings yet. You can add them any time with the document button inside the trip."));
    if (!draft.flights.length) stats.appendChild(h("div", { class: "warnbox" }, "No flights yet. You can add them any time with the document button inside the trip."));
    const ex = h("details", null, h("summary", null, "Preview of what I found"));
    dates.slice(0, 4).forEach(d => ex.appendChild(h("p", { class: "muted", style: { margin: "8px 0" } }, h("b", { style: { color: "var(--ink)" } }, fmtLong(d) + ": "), p.stops.filter(s => s.date === d).map(s => clip(s.name, 40)).join(" \u2192 "))));
    stats.appendChild(ex);
  };
  drawStats();
  year.addEventListener("change", () => { draft.parsed = parseItinerary(draft.itin.pages, { year: +year.value }); drawStats(); });

  const create = h("button", { class: "btn gold block", type: "button" }, ic("check", 18, 2.4), "Create trip");
  create.addEventListener("click", () => {
    const trip = store.buildTrip({ name: name.value.trim() || "My trip", year: +year.value, stops: draft.parsed.stops, hotels: draft.hotels, flights: draft.flights, sources: [draft.itin.name] });
    store.addTrip(trip);
    draft = null;
    toast("Trip created. Bon voyage!");
    go(`#/trip/${trip.id}/plan`, { replace: true });
  });
  return shell({ eyebrow: "Step 2 of 2", title: "Your trip is ready", back: "#/", body: h("div", null,
    h("div", { class: "glass card" }, h("h2", null, "Here is what I found"), stats),
    h("div", { class: "glass card" }, h("span", { class: "eyebrow" }, "Finish"), h("h2", { style: { marginTop: "4px" } }, "Name this trip"), h("label", { class: "field" }, "Trip name"), name,
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

async function render(instant = false) {
  const route = parseRoute();
  const my = ++token;
  const dir = direction(prev, route);
  const old = app.firstElementChild;
  const same = prev && prev.name === route.name && prev.id === route.id && (route.name === "plan" || instant);
  if (old && !instant && !same) { fly(dir); old.classList.add("leave"); await sleep(170); }
  if (my !== token) return;
  let el;
  try {
    el = ({ welcome: welcomeView, new: newTripView, plan: planView, hotels: hotelsView, flights: flightsView, place: placeView, settings: settingsView }[route.name])(route);
  } catch (e) {
    console.error(e);
    el = h("div", { class: "page" }, h("div", { class: "glass card" }, h("h2", null, "Something went wrong"), h("p", { class: "muted" }, String((e && e.message) || e)), h("a", { class: "btn gold", href: "#/" }, "Back to start")));
  }
  if (!(instant || same)) el.classList.add("view", dir === "left" ? "enter-left" : dir === "up" ? "enter-up" : "enter-right");
  else el.classList.add("view");
  const y = same || instant ? window.scrollY : 0;
  app.innerHTML = "";
  app.appendChild(el);
  const trip = route.id ? store.getTrip(route.id) : null;
  setBackground(trip ? store.coverUrl(store.coverKey(trip)) : "img/fuji.jpg");
  document.body.classList.toggle("home", route.name === "welcome");
  window.scrollTo(0, y);
  prev = route;
}

window.addEventListener("hashchange", () => render());
window.addEventListener("trip-refresh", () => render(true));

store.load();
render();

if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
