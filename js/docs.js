/* docs.js - add or replace documents after a trip exists (itinerary, hotels, flights) */
import { h } from "./util.js";
import * as store from "./store.js";
import { extractPages, pagesToText, parseItinerary, parseHotel, parseFlights } from "./parser.js";
import { getPdfjs } from "./pdfloader.js";
import { openSheet, toast, go, refresh } from "./ui.js";
import { ic } from "./icons.js";

export async function readPdfs(files) {
  const pdfjs = await getPdfjs();
  const out = [];
  for (const f of files) {
    const pages = await extractPages(pdfjs, new Uint8Array(await f.arrayBuffer()));
    out.push({ name: f.name, pages, text: pagesToText(pages) });
  }
  return out;
}

const here = trip => location.hash.startsWith(`#/trip/${trip.id}/`);

async function handleHotels(trip, files) {
  const docs = await readPdfs(files);
  const list = docs.map(d => parseHotel(d.text, d.name, trip.year));
  const r = store.upsertHotels(trip, list);
  toast(`${r.added ? r.added + " hotel(s) added" : ""}${r.added && r.updated ? ", " : ""}${r.updated ? r.updated + " updated" : ""}. Please check the details.`);
  go(`#/trip/${trip.id}/hotels`, { replace: true });
}
async function handleFlights(trip, files) {
  const docs = await readPdfs(files);
  const list = [];
  docs.forEach(d => list.push(...parseFlights(d.text, d.name, trip.year)));
  if (!list.length) { toast("No flights recognised in that PDF. Add them by hand with the + button."); return; }
  const r = store.upsertFlights(trip, list);
  toast(`${r.added ? r.added + " flight(s) added" : ""}${r.added && r.updated ? ", " : ""}${r.updated ? r.updated + " updated" : ""}. Please check the details.`);
  go(`#/trip/${trip.id}/flights`, { replace: true });
}
async function handleItinerary(trip, files) {
  const doc = (await readPdfs(files.slice(0, 1)))[0];
  const parsed = parseItinerary(doc.pages);
  if (!parsed.stops.length) throw new Error("I could not find any day-by-day entries in that PDF.");
  const dates = new Set(parsed.stops.map(s => s.date));
  openSheet("Replace your plan?", h("div", null,
    h("p", { class: "muted" }, `I found ${dates.size} days and ${parsed.stops.length} places in ${doc.name}.`),
    h("p", { class: "muted" }, "Your Visited ticks and notes are kept where a place has the same name. Any manual rearranging of days is replaced by the new file's order."),
    parsed.mode === "generic" ? h("div", { class: "warnbox" }, "This PDF is not in the table layout I know best, so I split it by date headings. Check the days afterwards.") : null), [
    { label: "Cancel", cls: "glass" },
    { label: "Replace plan", cls: "gold", onclick: () => {
      const r = store.replaceItinerary(trip, parsed.stops, parsed.year);
      toast(`Plan updated. ${r.keptVisited} of ${r.hadVisited} visited ticks kept.`);
      refresh();
    } }], { eyebrow: "Update itinerary" });
}

/* a styled upload button. kind: itinerary | hotels | flights */
export function uploadButton(trip, kind, label, opts = {}) {
  const multiple = kind !== "itinerary";
  const input = h("input", { type: "file", accept: "application/pdf,.pdf", multiple, style: { display: "none" },
    onchange: async e => {
      const files = Array.from(e.target.files || []);
      e.target.value = "";
      if (!files.length) return;
      opts.onBusy && opts.onBusy(`Reading ${files.length} file(s)\u2026`);
      toast("Reading your PDF\u2026", 2500);
      try {
        if (kind === "hotels") await handleHotels(trip, files);
        else if (kind === "flights") await handleFlights(trip, files);
        else await handleItinerary(trip, files);
        opts.onDone && opts.onDone();
      } catch (err) {
        console.error(err);
        opts.onError && opts.onError(err);
        toast("Could not read that PDF: " + (err.message || err), 6000);
      }
    } });
  return h("label", { class: opts.cls || "btn small gold", style: { cursor: "pointer" } }, ic(opts.icon || "filePlus", 16), label, input);
}

export function docsSheet(trip) {
  const status = h("div", { class: "muted", style: { marginTop: "8px", minHeight: "20px" }, "aria-live": "polite" });
  let close = () => {};
  const busy = msg => { status.innerHTML = ""; status.appendChild(h("span", { class: "spinner" })); status.appendChild(document.createTextNode(msg)); };
  const fail = err => { status.innerHTML = ""; status.appendChild(h("div", { class: "warnbox" }, "Could not read that PDF: " + (err.message || err))); };
  const row = (icon, title, desc, btn) => h("div", { class: "docrow" }, h("span", { class: "badge" }, ic(icon, 22)), h("div", { class: "grow" }, h("b", null, title), h("small", null, desc)), btn);
  const opts = { onBusy: busy, onError: fail, onDone: () => close() };
  const content = h("div", null,
    h("p", { class: "muted" }, "Forgot a document, or got a new booking? Add it here any time. PDFs are read on this phone."),
    row("route", "Itinerary", `${trip.days.length} days in your plan`, uploadButton(trip, "itinerary", "Replace", { cls: "btn small line", icon: "refresh", onBusy: busy, onError: fail })),
    row("hotel", "Hotel bookings", trip.hotels.length ? `${trip.hotels.length} on file` : "None yet", uploadButton(trip, "hotels", "Add PDF", opts)),
    row("plane", "Flights and tickets", trip.flights.length ? `${trip.flights.length} on file` : "None yet", uploadButton(trip, "flights", "Add PDF", opts)),
    status);
  close = openSheet("Add or update documents", content, [{ label: "Close", cls: "glass" }], { eyebrow: "Documents" });
  return close;
}
