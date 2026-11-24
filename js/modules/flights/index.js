/* flights module: the Flights tab, shown as boarding passes. */
import { h } from "../../core/dom.js";
import { ic } from "../../core/icons.js";
import * as store from "../../core/store.js";
import { svc } from "../../core/registry.js";
import { bus } from "../../core/bus.js";
import { tripShell, notFound, openSheet, confirmSheet, toast } from "../../core/ui.js";
import { fmtLong, uid } from "../../core/util.js";

export function flightsView({ id }) {
  const trip = store.getTrip(id); if (!trip) return notFound();
  const body = h("div"), view = tripShell(trip, "flights", body), maps = svc("maps"), intake = svc("intake");
  const draw = () => {
    body.replaceChildren(h("div", { class: "row between", style: { margin: "2px 2px 6px" } },
      h("div", null, h("span", { class: "eyebrow" }, "Boarding passes"), h("h2", { class: "serif tabtitle" }, "Your flights")),
      h("div", { class: "row", style: { gap: "8px" } }, h("button", { class: "btn small glass", type: "button", onclick: () => flightSheet(trip, null, draw) }, ic("plus", 15), "By hand"), intake ? intake.uploadButton(trip, "flights", "Upload PDF") : null)));
    if (!trip.flights.length) body.append(h("div", { class: "glass card empty" }, ic("plane", 34), h("p", null, "No flights yet. Forgot to upload them? Add the ticket PDF and I will read the flight numbers, airports and times."), intake ? h("div", { class: "row center" }, intake.uploadButton(trip, "flights", "Upload flight PDF", { cls: "btn gold" })) : null));
    trip.flights.slice().sort((a, b) => ((a.date || "") + (a.depart || "")).localeCompare((b.date || "") + (b.depart || ""))).forEach(fl => {
      body.append(h("div", { class: "pass" },
        h("div", { class: "main" }, h("div", { class: "muted" }, fl.date ? fmtLong(fl.date) : "Date not set"),
          h("div", { class: "route" }, h("span", null, fl.from || "???"), h("span", { class: "arrow" }, ic("plane", 18)), h("span", null, fl.to || "???")),
          fl.fromCity || fl.toCity ? h("div", { class: "muted small" }, `${fl.fromCity || ""}${fl.fromCity && fl.toCity ? " to " : ""}${fl.toCity || ""}`) : null,
          h("div", { class: "meta-line" }, fl.depart ? h("span", { class: "pill gold" }, "Departs " + fl.depart) : null, fl.arrive ? h("span", { class: "pill" }, "Arrives " + fl.arrive + (fl.arriveDate && fl.arriveDate !== fl.date ? " (+1)" : "")) : null, fl.booking ? h("span", { class: "pill" }, "Ref " + fl.booking) : null),
          fl.notes ? h("p", { class: "muted" }, fl.notes) : null,
          h("div", { class: "row", style: { gap: "8px" } },
            fl.from && maps ? h("a", { class: "btn small glass", href: maps.placeUrl(fl.from + " airport"), target: "_blank", rel: "noopener" }, ic("pin", 14), "From") : null,
            fl.to && maps ? h("a", { class: "btn small glass", href: maps.placeUrl(fl.to + " airport"), target: "_blank", rel: "noopener" }, ic("pin", 14), "To") : null,
            h("button", { class: "btn small glass", type: "button", "aria-label": "Edit flight", onclick: () => flightSheet(trip, fl, draw) }, ic("edit", 14)),
            h("button", { class: "btn small glass", type: "button", "aria-label": "Delete flight", onclick: () => confirmSheet("Delete this flight?", fl.number, "Delete", () => { trip.flights = trip.flights.filter(x => x.id !== fl.id); store.save(); bus.emit("trip-changed", { id: trip.id }); draw(); }) }, ic("trash", 14)))),
        h("div", { class: "stub" }, ic("plane", 22), h("b", null, fl.number || "Flight"), h("span", { class: "bars" }))));
    });
    if (trip.flights.length) body.append(h("p", { class: "muted center small" }, "Details read from PDFs are best guesses. Tap the pencil to correct anything."));
  };
  draw();
  const off = bus.on("trip-changed", e => { if (!view.isConnected) off(); else if (e.id === trip.id) draw(); });
  return view;
}
function flightSheet(trip, fl, redraw) {
  const isNew = !fl; fl = fl || { id: uid("f"), number: "", date: "", from: "", to: "", depart: "", arrive: "", booking: "", notes: "" };
  const f = {}; const field = (key, label, type = "text", ph = "") => { f[key] = h("input", { type, value: fl[key] || "", placeholder: ph, "aria-label": label }); return h("div", null, h("label", { class: "field" }, label), f[key]); };
  openSheet(isNew ? "Add a flight" : "Edit flight", h("div", null, field("number", "Flight number", "text", "EK 926"), field("date", "Date", "date"), field("from", "From (airport code)", "text", "CAI"), field("to", "To (airport code)", "text", "DXB"), field("depart", "Departure time", "time"), field("arrive", "Arrival time", "time"), field("booking", "Booking reference"), field("notes", "Notes")),
    [{ label: "Cancel", cls: "glass" }, { label: "Save", cls: "gold", onclick: () => {
      Object.keys(f).forEach(k => { fl[k] = f[k].value.trim(); }); fl.from = fl.from.toUpperCase(); fl.to = fl.to.toUpperCase();
      if (!fl.number) { toast("Please enter the flight number."); return false; }
      if (isNew) trip.flights.push(fl); store.save(); bus.emit("trip-changed", { id: trip.id }); if (redraw) redraw();
    } }], { eyebrow: "Boarding pass" });
}
export default {
  id: "flights", version: "2.0.0", title: "Flights tab", description: "Flights shown as boarding passes.",
  init(ctx) { ctx.route("trip/:id/flights", flightsView); ctx.tab({ id: "flights", label: "Flights", icon: "plane", order: 30 }); }
};
