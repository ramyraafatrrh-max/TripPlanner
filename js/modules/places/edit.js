/* edit.js - edit one place: name, Google Maps link, time, notes, pin. */
import { h } from "../../core/dom.js";
import * as store from "../../core/store.js";
import { svc } from "../../core/registry.js";
import { openSheet, toast, confirmSheet } from "../../core/ui.js";
import { bus } from "../../core/bus.js";
import { hasPt } from "../../core/util.js";
import { locateStop } from "./geo.js";

export function editStopSheet(trip, stop, afterSave) {
  const maps = svc("maps");
  const name = h("input", { type: "text", value: stop.name, "aria-label": "Name" });
  const link = h("input", { type: "url", inputmode: "url", value: stop.mapUrl || "", placeholder: "Paste a Google Maps link", "aria-label": "Google Maps link" });
  const time = h("input", { type: "time", value: /^\d{1,2}:\d{2}$/.test(stop.time) ? stop.time.padStart(5, "0") : "", "aria-label": "Time" });
  const notes = h("textarea", { rows: 3, "aria-label": "Notes" }); notes.value = stop.notes || "";
  const pin = h("input", { type: "checkbox", checked: !!stop.locked });
  const coords = h("input", { type: "text", value: hasPt(stop) ? `${(+stop.lat).toFixed(6)}, ${(+stop.lng).toFixed(6)}` : "", placeholder: "latitude, longitude (optional)", "aria-label": "Coordinates" });
  const msg = h("div", { class: "muted small", "aria-live": "polite" });
  const where = () => !hasPt(stop) ? "No location yet. It stays where it is when the day is reordered." : ({ link: "Location from your Google Maps link.", gps: "Exact location from a booking.", manual: "Location typed by you.", geo: "Location found by searching the name. Paste a link for an exact spot." }[stop.locSrc] || "Location set.");
  msg.textContent = where();
  link.addEventListener("input", () => { const p = link.value.trim() ? maps.parseLink(link.value) : null; msg.textContent = !p ? where() : !p.ok ? p.error : p.warn || (Number.isFinite(p.lat) ? "Location read from the link." : "Link saved."); if (p && p.ok && p.name && !name.value.trim()) name.value = p.name; });
  const body = h("div", null, h("label", { class: "field" }, "Name"), name, h("label", { class: "field" }, "Google Maps link"), link, msg,
    h("label", { class: "field" }, "Time (optional)"), time, h("label", { class: "field" }, "Location (optional)"), coords, h("label", { class: "field" }, "Notes"), notes,
    h("label", { class: "pickrow" }, pin, h("span", null, "Pin this stop: it keeps its place when the day is reordered")));
  openSheet("Edit place", body, [
    { label: "Delete", cls: "danger", onclick: () => { confirmSheet("Delete this place?", stop.name, "Delete", () => { trip.days.forEach(d => { d.stops = d.stops.filter(s => s.id !== stop.id); }); store.save(); bus.emit("trip-changed", { id: trip.id }); toast("Place deleted"); location.hash = `#/trip/${trip.id}/plan`; bus.emit("route-refresh"); }); return true; } },
    { label: "Cancel", cls: "glass" },
    { label: "Save", cls: "gold", onclick: async () => {
      const n = name.value.trim(); if (!n) { toast("Please enter a name."); return false; }
      const renamed = n !== stop.name; stop.name = n; if (renamed && !stop.mapUrl && stop.locSrc === "geo") { delete stop.lat; delete stop.lng; delete stop.locSrc; stop.query = n; }
      const url = link.value.trim();
      if (url) { const p = maps.parseLink(url); if (!p || !p.ok) { toast((p && p.error) || "I could not read that link."); return false; } stop.mapUrl = p.url; if (Number.isFinite(p.lat)) { stop.lat = p.lat; stop.lng = p.lng; stop.locSrc = "link"; } }
      else stop.mapUrl = "";
      const c = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(coords.value);
      if (coords.value.trim() && !c) { toast("Use the form 35.6586, 139.7454 for the location."); return false; }
      if (c && !(Math.abs(+c[1] - (+stop.lat || 0)) < 1e-6 && Math.abs(+c[2] - (+stop.lng || 0)) < 1e-6)) { stop.lat = +c[1]; stop.lng = +c[2]; stop.locSrc = "manual"; }
      if (!coords.value.trim() && stop.locSrc === "manual") { delete stop.lat; delete stop.lng; delete stop.locSrc; }
      stop.time = time.value || ""; stop.notes = notes.value; stop.locked = pin.checked;
      store.save(); bus.emit("trip-changed", { id: trip.id }); if (afterSave) afterSave(stop);
      if (!hasPt(stop)) locateStop(stop, { city: stop.city }).then(ok => { if (ok) { store.save(true); } });
    } }], { eyebrow: "Place" });
}
