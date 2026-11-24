/* intake module: getting documents into the app.
   - the upload card on the welcome page (itinerary, hotel bookings, flights)
   - the "name your trip" step that creates the trip
   - the "Add or update documents" sheet that is available inside every trip (re-upload hotels or flights later)
   - starting a blank trip without any PDF                                                                                    */
import { h } from "../../core/dom.js";
import { ic } from "../../core/icons.js";
import * as store from "../../core/store.js";
import { svc } from "../../core/registry.js";
import { bus } from "../../core/bus.js";
import { go } from "../../core/router.js";
import { shell, openSheet, toast } from "../../core/ui.js";
import { fmtShort, fmtDate, addDays, isIso, clip, norm } from "../../core/util.js";

let draft = null;

/* ---------- reading files ---------- */
const parse = () => svc("parse") || (() => { throw new Error("The PDF reader module is switched off."); })();
async function readHotel(file, year) { const r = await parse().hotel(file, { year }); if (r.hotel.lat != null) r.hotel.locSrc = "gps"; return r; }
function describeHotel(r) {
  const x = r.hotel;
  return `${x.name || "Hotel (name not read)"}${x.checkIn ? " \u00B7 " + fmtShort(x.checkIn) + (x.checkOut ? "\u2013" + fmtShort(x.checkOut) : "") : ""}${r.missing.length ? " \u00B7 check: " + r.missing.join(", ") : " \u00B7 all details read"}`;
}
export function mergeHotel(trip, hotel) {
  const same = trip.hotels.find(o => (hotel.confirmation && o.confirmation === hotel.confirmation) || (norm(o.name) === norm(hotel.name) && o.checkIn === hotel.checkIn));
  if (same) { Object.keys(hotel).forEach(k => { if (hotel[k] !== "" && hotel[k] != null && hotel[k] !== 0) same[k] = hotel[k]; }); return { hotel: same, status: "updated" }; }
  hotel.id = hotel.id || "h_" + Math.random().toString(36).slice(2, 9); trip.hotels.push(hotel); return { hotel, status: "added" };
}
export function mergeFlights(trip, list) {
  let added = 0, updated = 0;
  list.forEach(f => { const o = trip.flights.find(x => x.number === f.number && x.date === f.date); if (o) { Object.keys(f).forEach(k => { if (f[k]) o[k] = f[k]; }); updated++; } else { f.id = "f_" + Math.random().toString(36).slice(2, 9); trip.flights.push(f); added++; } });
  return { added, updated };
}

/* ---------- the welcome-page card ---------- */
function dropzone(icon, title, hint, multiple, files, render) {
  const input = h("input", { type: "file", accept: "application/pdf,.pdf", multiple, "aria-label": title, onchange: e => { files.splice(0, files.length, ...Array.from(e.target.files || [])); render(); } });
  const label = h("span", { class: "dz-files muted" }, hint);
  const el = h("label", { class: "dropzone" }, h("span", { class: "dz-ic" }, ic(icon, 22)), h("span", { class: "grow" }, h("b", null, title), label), input);
  el._render = () => { label.textContent = files.length ? files.map(f => f.name).join(", ") : hint; el.classList.toggle("has", !!files.length); };
  return el;
}
function uploadCard() {
  const files = { it: [], ho: [], fl: [] };
  const status = h("div", { class: "muted", "aria-live": "polite" });
  const zones = [dropzone("calendar", "Travel itinerary", "PDF with your day-by-day plan", false, files.it, () => update()), dropzone("hotel", "Hotel bookings", "PDF confirmations, one or many (optional)", true, files.ho, () => update()), dropzone("plane", "Flights", "PDF e-tickets, one or many (optional)", true, files.fl, () => update())];
  const go1 = h("button", { class: "btn gold wide", type: "button", disabled: true, onclick: run }, ic("sparkle", 17), "Process my documents");
  const update = () => { zones.forEach(z => z._render()); go1.disabled = !(files.it.length || files.ho.length || files.fl.length); };
  async function run() {
    go1.disabled = true; const report = [], d = { days: [], hotels: [], flights: [], sources: [], reports: [], warnings: [], title: "" };
    try {
      if (files.it[0]) { status.textContent = "Reading the itinerary\u2026"; const r = await parse().itinerary(files.it[0]); d.days = r.days; d.title = r.title; d.warnings.push(...r.warnings); d.sources.push({ name: files.it[0].name, kind: "itinerary" }); report.push({ ok: r.stats.days > 0, text: `Itinerary: ${r.stats.days} days, ${r.stats.stops} places` }); }
      const year = d.days[0] ? +d.days[0].date.slice(0, 4) : new Date().getFullYear();
      for (let i = 0; i < files.ho.length; i++) { status.textContent = `Reading hotel ${i + 1} of ${files.ho.length}\u2026`; try { const r = await readHotel(files.ho[i], year); d.hotels.push(r.hotel); d.sources.push({ name: files.ho[i].name, kind: "hotel" }); report.push({ ok: r.ok && !r.missing.length, warn: r.ok, text: "Hotel: " + describeHotel(r) }); } catch (e) { report.push({ ok: false, text: `${files.ho[i].name}: could not read (${e.message})` }); } }
      for (let i = 0; i < files.fl.length; i++) { status.textContent = `Reading flights ${i + 1} of ${files.fl.length}\u2026`; try { const r = await parse().flights(files.fl[i], { year }); mergeFlights({ flights: d.flights }, r); d.sources.push({ name: files.fl[i].name, kind: "flights" }); report.push({ ok: r.length > 0, text: `Flights: ${r.length} found in ${files.fl[i].name}` }); } catch (e) { report.push({ ok: false, text: `${files.fl[i].name}: could not read (${e.message})` }); } }
    } catch (e) { status.textContent = ""; report.push({ ok: false, text: "Could not read the itinerary: " + e.message }); }
    d.reports = report;
    if (!d.days.length && !d.hotels.length && !d.flights.length) { status.replaceChildren(h("div", { class: "warnbox" }, report.map(r => h("div", null, r.text)), h("div", null, "Nothing could be read. Scanned pages and photos are not supported. Try another PDF, or start a blank trip."))); go1.disabled = false; return; }
    draft = d; status.textContent = ""; go("#/new");
  }
  return h("section", { class: "glass card uploadcard" }, h("span", { class: "eyebrow" }, "Start a new trip"), h("h2", { class: "serif tabtitle" }, "Upload your documents"),
    h("p", { class: "muted" }, "Your files are read on this phone and never uploaded. Only the itinerary is needed; add hotels and flights now or later."), ...zones, go1, status,
    h("div", { class: "row center", style: { marginTop: "6px" } }, h("button", { class: "btn small line", type: "button", onclick: blankTripSheet }, ic("plus", 15), "No PDF? Start a blank trip")));
}

/* ---------- name the trip ---------- */
function newTripView() {
  if (!draft) { go("#/", { replace: true }); return h("div"); }
  const d = draft, hotelsBox = h("div");
  const name = h("input", { type: "text", value: (d.title && d.title.length > 3 ? d.title : "My trip"), "aria-label": "Trip name", onkeydown: e => { if (e.key === "Enter") create(); } });
  const drawHotels = () => hotelsBox.replaceChildren(...d.hotels.map(x => h("div", { class: "docrow" }, h("span", { class: "badge" }, ic("hotel", 18)), h("div", { class: "grow" }, h("b", null, clip(x.name || "Hotel", 40)), h("small", null, `${x.checkIn ? fmtDate(x.checkIn) : "?"} \u2192 ${x.checkOut ? fmtDate(x.checkOut) : "?"}${x.address ? " \u00B7 " + clip(x.address, 38) : ""}`)),
    h("button", { class: "btn small glass", type: "button", onclick: () => svc("hotels") && svc("hotels").hotelSheet({ hotels: d.hotels }, x, drawHotels, { isNew: false }) }, ic("edit", 14)))));
  drawHotels();
  function create() {
    const t = store.newTrip({ name: name.value.trim() || "My trip", days: d.days, hotels: d.hotels, flights: d.flights, sources: d.sources });
    store.addTrip(t); draft = null; bus.emit("trip-created", { id: t.id }); toast("Trip created"); go(`#/trip/${t.id}/plan`, { replace: true });
  }
  const body = h("div", null,
    h("div", { class: "glass card" }, h("span", { class: "eyebrow" }, "What I found"), h("h2", { class: "serif tabtitle" }, "Check and name your trip"),
      ...d.reports.map(r => h("div", { class: "kv" }, ic(r.ok ? "check" : "info", 16, r.ok ? 2.4 : 2), h("span", { class: r.ok ? "" : "warntext" }, r.text))),
      ...d.warnings.map(w => h("div", { class: "warnbox" }, w))),
    d.hotels.length ? h("div", { class: "glass card" }, h("h3", null, "Hotels"), hotelsBox, h("p", { class: "muted small" }, "Tap the pencil on any hotel to correct what I read.")) : null,
    h("div", { class: "glass card" }, h("h3", null, "Name this trip"), h("label", { class: "field" }, "Trip name"), name, h("div", { class: "row", style: { marginTop: "14px" } }, h("button", { class: "btn gold", type: "button", onclick: create }, ic("check", 16, 2.4), "Create trip"))));
  return shell({ eyebrow: "Almost there", title: "New trip", back: "#/", body });
}

/* ---------- blank trip ---------- */
function blankTripSheet() {
  const today = new Date().toISOString().slice(0, 10);
  const name = h("input", { type: "text", placeholder: "e.g. Lisbon weekend", "aria-label": "Trip name" }), city = h("input", { type: "text", placeholder: "Main city, e.g. Lisbon", "aria-label": "City" });
  const from = h("input", { type: "date", value: today, "aria-label": "Start date" }), to = h("input", { type: "date", value: addDays(today, 3), "aria-label": "End date" });
  openSheet("Start a blank trip", h("div", null, h("label", { class: "field" }, "Trip name"), name, h("label", { class: "field" }, "Main city (for the time zone and photos)"), city, h("label", { class: "field" }, "First day"), from, h("label", { class: "field" }, "Last day"), to,
    h("p", { class: "muted" }, "You can add places with their Google Maps links, hotels and flights afterwards.")), [{ label: "Cancel", cls: "glass" }, { label: "Create", cls: "gold", onclick: () => {
      if (!isIso(from.value) || !isIso(to.value) || to.value < from.value) { toast("Please choose valid dates."); return false; }
      const days = []; for (let d = from.value, n = 0; d <= to.value && n < 60; d = addDays(d, 1), n++) days.push(store.makeDay(d, city.value.trim()));
      const t = store.newTrip({ name: name.value.trim() || "My trip", days }); if (city.value.trim()) t.cities = [city.value.trim()];
      store.addTrip(t); bus.emit("trip-created", { id: t.id }); go(`#/trip/${t.id}/plan`, { replace: true });
    } }], { eyebrow: "New trip" });
}

/* ---------- documents of an existing trip ---------- */
async function addFiles(trip, kind, files, report) {
  const year = trip.year || new Date().getFullYear();
  if (kind === "hotels") {
    for (const f of files) {
      try {
        const r = await readHotel(f, year), res = mergeHotel(trip, r.hotel);
        report.push({ ok: r.ok && !r.missing.length, text: `${res.status === "added" ? "Added" : "Updated"} ${describeHotel(r)}` });
        store.save(); bus.emit("trip-changed", { id: trip.id });
        if (!r.ok && svc("hotels")) svc("hotels").hotelSheet(trip, res.hotel, () => bus.emit("trip-changed", { id: trip.id }), { isNew: false, missing: r.missing, title: "Check this hotel" });
      } catch (e) { report.push({ ok: false, text: `${f.name}: could not read (${e.message})` }); }
    }
  } else if (kind === "flights") {
    for (const f of files) {
      try { const list = await parse().flights(f, { year }), r = mergeFlights(trip, list); report.push({ ok: list.length > 0, text: list.length ? `${f.name}: ${r.added} added, ${r.updated} updated` : `${f.name}: no flights found. Add them by hand.` }); store.save(); bus.emit("trip-changed", { id: trip.id }); }
      catch (e) { report.push({ ok: false, text: `${f.name}: could not read (${e.message})` }); }
    }
  }
}
function uploadButton(trip, kind, label, { cls = "btn small gold" } = {}) {
  const input = h("input", { type: "file", accept: "application/pdf,.pdf", multiple: true, style: { display: "none" }, "aria-label": label,
    onchange: async e => { const fs = Array.from(e.target.files || []); e.target.value = ""; if (!fs.length) return; toast("Reading\u2026", 1500); const report = []; await addFiles(trip, kind, fs, report); toast(report.map(r => r.text).join("\n"), 7000); } });
  return h("label", { class: cls, style: { cursor: "pointer" } }, ic("upload", 15), label, input);
}
function openDocs(trip) {
  const out = h("div", { class: "docout", "aria-live": "polite" });
  const say = report => { out.replaceChildren(...report.map(r => h("div", { class: "kv" }, ic(r.ok ? "check" : "info", 16), h("span", { class: r.ok ? "" : "warntext" }, r.text)))); };
  const row = (icon, title, text, kind, multiple) => {
    const input = h("input", { type: "file", accept: "application/pdf,.pdf", multiple, "aria-label": title, onchange: async e => {
      const fs = Array.from(e.target.files || []); e.target.value = ""; if (!fs.length) return; say([{ ok: true, text: "Reading\u2026" }]);
      if (kind === "itinerary") return replaceItinerary(trip, fs[0], say);
      const rep = []; await addFiles(trip, kind, fs, rep); say(rep);
    } });
    return h("label", { class: "docrow clickable" }, h("span", { class: "badge" }, ic(icon, 20)), h("div", { class: "grow" }, h("b", null, title), h("small", null, text)), h("span", { class: "btn small gold" }, ic("upload", 14), "Choose"), input);
  };
  openSheet("Add or update documents", h("div", null, h("p", { class: "muted" }, "Everything is read on this phone. Re-adding a hotel or flight updates it instead of duplicating it."),
    row("calendar", "Itinerary", `${trip.days.length} days now. A new PDF replaces the plan and keeps your ticks, notes and added places.`, "itinerary", false), row("hotel", "Hotel bookings", `${trip.hotels.length} now. Add one or many PDFs.`, "hotels", true), row("plane", "Flights and tickets", `${trip.flights.length} now. Add one or many PDFs.`, "flights", true), out), [{ label: "Done", cls: "gold" }], { eyebrow: "Documents" });
}
async function replaceItinerary(trip, file, say) {
  try {
    const r = await parse().itinerary(file, { year: trip.year });
    if (!r.days.length) { say([{ ok: false, text: "I could not find days in that PDF." }, ...r.warnings.map(w => ({ ok: false, text: w }))]); return; }
    const box = h("div", null, h("div", { class: "warnbox" }, `Found ${r.stats.days} days and ${r.stats.stops} places. Replace the current plan? Your ticks, notes, pins and places you added are kept where the place name matches.`),
      h("div", { class: "row", style: { marginTop: "8px", gap: "8px" } }, h("button", { class: "btn small gold", type: "button", onclick: () => { trip.days = store.keepUserData(trip, r.days); store.applyTz(trip); trip.sources.push({ name: file.name, kind: "itinerary" }); store.save(); bus.emit("trip-changed", { id: trip.id }); say([{ ok: true, text: `Plan replaced: ${r.stats.days} days, ${r.stats.stops} places.` }]); } }, "Replace the plan"), h("button", { class: "btn small glass", type: "button", onclick: () => say([{ ok: true, text: "Kept the current plan." }]) }, "Keep current")));
    const out = document.querySelector(".docout"); if (out) out.replaceChildren(box);
  } catch (e) { say([{ ok: false, text: "Could not read that PDF: " + e.message }]); }
}

export default {
  id: "intake", version: "2.0.0", title: "Documents and new trips",
  description: "Upload card, name-your-trip step, blank trips, and re-uploading hotels, flights or the itinerary later.",
  init(ctx) {
    ctx.route("new", newTripView);
    ctx.homeSection({ id: "upload", order: 20, render: uploadCard });
    ctx.tripAction({ id: "docs", order: 20, icon: "filePlus", label: "Add or update documents", run: openDocs });
    ctx.service("intake", { openDocs, uploadButton, mergeHotel, mergeFlights, blankTripSheet });
  }
};
