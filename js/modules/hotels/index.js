/* hotels module: the Hotels tab. Stay cards read from booking PDFs (or typed by hand) with exact GPS directions,
   confirmation number and PIN, check-in window and the free-cancellation deadline. */
import { h } from "../../core/dom.js";
import { ic } from "../../core/icons.js";
import * as store from "../../core/store.js";
import { svc } from "../../core/registry.js";
import { bus } from "../../core/bus.js";
import { tripShell, notFound, openSheet, confirmSheet, toast } from "../../core/ui.js";
import { fmtDate, fmtLong, daysBetween, todayIn, hasPt, uid, isIso } from "../../core/util.js";

const asPlace = x => ({ name: x.name, query: `${x.name} ${x.address || ""}`.trim(), lat: x.lat, lng: x.lng, locSrc: hasPt(x) ? (x.locSrc || "gps") : "", mapUrl: x.mapUrl || "" });
function copy(text, what) { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast(`${what} copied`), () => toast("Press and hold to copy.")); else toast("Press and hold to copy."); }
const kv = (icon, content) => h("div", { class: "kv" }, ic(icon, 16), content);

function cancelNote(x) {
  if (!isIso(x.freeCancelUntil)) return null;
  const left = daysBetween(todayIn(), x.freeCancelUntil);
  const text = left < 0 ? `Free cancellation ended ${fmtDate(x.freeCancelUntil)}` : left === 0 ? "Free cancellation ends today" : `Free cancellation until ${fmtDate(x.freeCancelUntil)} (${left} day${left === 1 ? "" : "s"} left)`;
  return h("span", { class: "pill " + (left < 0 ? "dim" : left <= 14 ? "warn" : "green") }, ic("clock", 13), text);
}

export function hotelsView({ id }) {
  const trip = store.getTrip(id); if (!trip) return notFound();
  const body = h("div"), view = tripShell(trip, "hotels", body), maps = svc("maps"), intake = svc("intake");
  const draw = () => {
    body.replaceChildren(h("div", { class: "row between", style: { margin: "2px 2px 6px" } },
      h("div", null, h("span", { class: "eyebrow" }, "Accommodation"), h("h2", { class: "serif tabtitle" }, "Where you stay")),
      h("div", { class: "row", style: { gap: "8px" } }, h("button", { class: "btn small glass", type: "button", onclick: () => hotelSheet(trip, null, draw) }, ic("plus", 15), "By hand"), intake ? intake.uploadButton(trip, "hotels", "Upload PDF") : null)));
    if (!trip.hotels.length) body.append(h("div", { class: "glass card empty" }, ic("hotel", 34), h("p", null, "No hotels yet. Forgot to upload them? Add the booking PDFs and I will read the name, dates, address, phone, GPS and confirmation number."), intake ? h("div", { class: "row center" }, intake.uploadButton(trip, "hotels", "Upload hotel PDF", { cls: "btn gold" })) : null));
    trip.hotels.slice().sort((a, b) => (a.checkIn || "").localeCompare(b.checkIn || "")).forEach(x => {
      const nights = x.nights || (x.checkIn && x.checkOut ? daysBetween(x.checkIn, x.checkOut) : null), place = asPlace(x), mapBox = h("div");
      const cn = cancelNote(x);
      body.append(h("article", { class: "glass card stay" },
        h("div", { class: "head" }, h("div", { class: "grow" }, h("span", { class: "eyebrow" }, "Stay"), h("h3", { class: "serif" }, x.name || "Hotel"), x.nameLocal ? h("div", { class: "muted small" }, x.nameLocal) : null), nights ? h("div", { class: "nights" }, h("b", null, String(nights)), h("small", null, nights === 1 ? "night" : "nights")) : null),
        h("div", { class: "bodyin" },
          h("div", { class: "dates" }, h("div", { class: "d" }, h("small", null, "Check-in"), h("b", null, x.checkIn ? fmtDate(x.checkIn) : "?"), x.checkInTime ? h("small", null, x.checkInTime) : null), h("span", { class: "mid" }, ic("arrowR", 18)), h("div", { class: "d r" }, h("small", null, "Check-out"), h("b", null, x.checkOut ? fmtDate(x.checkOut) : "?"), x.checkOutTime ? h("small", null, x.checkOutTime) : null)),
          cn ? h("div", { class: "meta-line" }, cn) : null,
          x.address ? kv("pin", h("a", { href: maps ? maps.placeUrl(place) : "#", target: "_blank", rel: "noopener" }, x.address)) : null,
          x.phone ? kv("link", h("a", { href: "tel:" + x.phone.replace(/[^\d+]/g, "") }, x.phone)) : null,
          x.confirmation ? kv("file", h("span", null, "Confirmation ", h("b", null, x.confirmation), " ", h("button", { class: "tag-mini btnlike", type: "button", onclick: () => copy(x.confirmation, "Confirmation number") }, "Copy"))) : null,
          x.pin ? kv("lock", h("span", null, "PIN ", h("b", null, x.pin), " ", h("button", { class: "tag-mini btnlike", type: "button", onclick: () => copy(x.pin, "PIN") }, "Copy"))) : null,
          x.room ? kv("hotel", h("span", null, x.room + (x.units > 1 ? ` \u00D7 ${x.units}` : ""))) : null,
          x.guests ? kv("baby", h("span", null, x.guests)) : null,
          x.price ? kv("star", h("span", null, "Total ", h("b", null, x.price), x.priceHome ? ` (${x.priceHome})` : "")) : null,
          x.requests ? kv("edit", h("span", { class: "muted" }, "Your request: " + x.requests)) : null,
          x.notes ? kv("info", h("span", { class: "muted" }, x.notes)) : null,
          hasPt(x) ? h("div", { class: "muted small" }, `Exact location from the booking: ${(+x.lat).toFixed(5)}, ${(+x.lng).toFixed(5)}`) : h("div", { class: "muted small" }, "No GPS in this booking. Tap Edit to paste a Google Maps link."),
          h("div", { class: "row", style: { marginTop: "12px", gap: "8px" } },
            maps ? h("a", { class: "btn small gold", href: maps.dirUrl(place), target: "_blank", rel: "noopener" }, ic("nav", 15), "Directions") : null,
            maps ? h("a", { class: "btn small glass", href: maps.placeUrl(place), target: "_blank", rel: "noopener" }, ic("map", 15), "Maps") : null,
            maps ? h("button", { class: "btn small glass", type: "button", onclick: () => { if (mapBox.dataset.on) { mapBox.replaceChildren(); delete mapBox.dataset.on; } else { mapBox.dataset.on = 1; mapBox.append(h("div", { class: "map-wrap" }, h("iframe", { src: maps.placeEmbed(place), loading: "lazy", title: "Map of " + x.name, allowfullscreen: true }))); } } }, "Preview") : null,
            h("button", { class: "btn small glass", type: "button", onclick: () => hotelSheet(trip, x, draw) }, ic("edit", 15), "Edit"),
            h("button", { class: "btn small glass", type: "button", "aria-label": "Delete hotel", onclick: () => confirmSheet("Delete this hotel?", x.name, "Delete", () => { trip.hotels = trip.hotels.filter(o => o.id !== x.id); store.save(); bus.emit("trip-changed", { id: trip.id }); draw(); }) }, ic("trash", 15))), mapBox)));
    });
    if (trip.hotels.length) body.append(h("p", { class: "muted center small" }, "Details read from PDFs are best guesses. Tap Edit to correct anything."));
  };
  draw();
  const off = bus.on("trip-changed", e => { if (!view.isConnected) off(); else if (e.id === trip.id) draw(); });
  return view;
}

/* add / edit / review a hotel. For a hotel just read from a PDF, pass { isNew:true, missing:[...] } and it opens as a review. */
export function hotelSheet(trip, hotel, redraw, { isNew = !hotel, missing = [], title } = {}) {
  hotel = hotel || { id: uid("h"), name: "", address: "", checkIn: "", checkOut: "", confirmation: "", phone: "", notes: "" };
  const f = {}, maps = svc("maps");
  const field = (key, label, type = "text", ph = "") => { f[key] = h("input", { type, value: hotel[key] == null ? "" : hotel[key], placeholder: ph, class: missing.includes(label.toLowerCase()) ? "warn" : null, "aria-label": label }); return h("div", null, h("label", { class: "field" }, label), f[key]); };
  const link = h("input", { type: "url", inputmode: "url", value: hotel.mapUrl || "", placeholder: "Paste a Google Maps link for an exact spot", "aria-label": "Google Maps link" });
  const gps = h("input", { type: "text", value: hasPt(hotel) ? `${(+hotel.lat).toFixed(6)}, ${(+hotel.lng).toFixed(6)}` : "", placeholder: "latitude, longitude", "aria-label": "GPS" });
  const msg = h("div", { class: "muted small" }); link.addEventListener("input", () => { const p = link.value.trim() && maps ? maps.parseLink(link.value) : null; msg.textContent = !p ? "" : !p.ok ? p.error : Number.isFinite(p.lat) ? "Location read from the link." : (p.warn || "Link saved."); if (p && p.ok && Number.isFinite(p.lat)) gps.value = `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`; });
  const body = h("div", null,
    isNew && missing.length ? h("div", { class: "warnbox" }, "I could not read: " + missing.join(", ") + ". Please fill those in (outlined below).") : null,
    field("name", "Hotel name"), field("nameLocal", "Name in local language (optional)"), field("address", "Address"), field("phone", "Phone"),
    h("label", { class: "field" }, "Google Maps link"), link, msg, h("label", { class: "field" }, "GPS location"), gps,
    field("checkIn", "Check-in date", "date"), field("checkInTime", "Check-in time or window", "text", "16:00 \u2013 23:30"), field("checkOut", "Check-out date", "date"), field("checkOutTime", "Check-out time", "text", "until 11:00"),
    field("confirmation", "Confirmation number"), field("pin", "PIN code"), field("room", "Room or apartment"), field("guests", "Guests"), field("price", "Total price"), field("freeCancelUntil", "Free cancellation until", "date"), field("notes", "Notes"));
  openSheet(title || (isNew ? "Add a hotel" : "Edit hotel"), body, [{ label: "Cancel", cls: "glass" }, { label: "Save", cls: "gold", onclick: () => {
    ["name", "nameLocal", "address", "phone", "checkIn", "checkInTime", "checkOut", "checkOutTime", "confirmation", "pin", "room", "guests", "price", "freeCancelUntil", "notes"].forEach(k => { hotel[k] = f[k].value.trim(); });
    if (!hotel.name) { toast("Please enter a name."); return false; }
    const lp = link.value.trim() && maps ? maps.parseLink(link.value) : null;
    if (link.value.trim() && (!lp || !lp.ok)) { toast((lp && lp.error) || "I could not read that link."); return false; }
    hotel.mapUrl = lp ? lp.url : "";
    const c = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(gps.value);
    if (gps.value.trim() && !c) { toast("Use the form 35.6586, 139.7454 for the GPS location."); return false; }
    if (c) { const changed = !(hasPt(hotel) && Math.abs(hotel.lat - +c[1]) < 1e-6 && Math.abs(hotel.lng - +c[2]) < 1e-6); hotel.lat = +c[1]; hotel.lng = +c[2]; if (changed || !hotel.locSrc) hotel.locSrc = lp && Number.isFinite(lp.lat) ? "link" : "manual"; } else { delete hotel.lat; delete hotel.lng; delete hotel.locSrc; }
    if (hotel.checkIn && hotel.checkOut) hotel.nights = Math.max(0, daysBetween(hotel.checkIn, hotel.checkOut));
    if (isNew) trip.hotels.push(hotel);
    store.save(); bus.emit("trip-changed", { id: trip.id }); if (redraw) redraw();
  } }], { eyebrow: "Accommodation" });
}

export default {
  id: "hotels", version: "2.0.0", title: "Hotels tab",
  description: "Hotel stay cards: dates, address, phone, GPS, confirmation, PIN, cancellation deadline.",
  init(ctx) {
    ctx.route("trip/:id/hotels", hotelsView);
    ctx.tab({ id: "hotels", label: "Hotels", icon: "hotel", order: 20 });
    ctx.service("hotels", { hotelSheet });
  }
};
