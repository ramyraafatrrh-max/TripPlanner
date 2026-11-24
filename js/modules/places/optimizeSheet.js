/* optimizeSheet.js - the "Shortest route" button on a day. */
import { h } from "../../core/dom.js";
import { ic } from "../../core/icons.js";
import { openSheet, toast } from "../../core/ui.js";
import { bus } from "../../core/bus.js";
import { fmtDate, hasPt } from "../../core/util.js";
import { locateDay, reorderDay, hotelPoint, summary } from "./day.js";

export function openOptimize(trip, day) {
  const keepPinned = h("input", { type: "checkbox", checked: true }), keepTimed = h("input", { type: "checkbox" }), fromHotel = h("input", { type: "checkbox", checked: true });
  const status = h("div", { class: "muted", "aria-live": "polite" });
  const hasHotel = !!hotelPoint(trip, day);
  const body = h("div", null,
    h("p", { class: "muted" }, `This finds the order of ${fmtDate(day.date)}'s ${day.stops.length} places with the least travelling. You can undo it straight after.`),
    h("label", { class: "pickrow" }, keepPinned, h("span", null, "Keep pinned stops in place")),
    h("label", { class: "pickrow" }, keepTimed, h("span", null, "Keep stops that have a set time (like 09:00) in place")),
    hasHotel ? h("label", { class: "pickrow" }, fromHotel, h("span", null, "Start from my hotel")) : null, status);
  openSheet("Shortest route for this day", body, [
    { label: "Cancel", cls: "glass" },
    { label: "Find the shortest route", cls: "gold", onclick: async ev => {
      ev.currentTarget.disabled = true;
      await locateDay(trip, day, { onProgress: (i, n) => { status.textContent = `Finding places on the map\u2026 ${i} of ${n}`; } });
      const r = reorderDay(trip, day, { fromHotel: fromHotel.checked && hasHotel, keepPinned: keepPinned.checked, keepTimed: keepTimed.checked });
      bus.emit("trip-changed", { id: trip.id });
      const missing = day.stops.filter(s => !hasPt(s)).length;
      toast(r.changed ? `Route ${summary(r)}. ${r.moved} place${r.moved === 1 ? "" : "s"} moved.` : "This day is already in the best order." + (missing ? ` ${missing} place(s) have no location yet.` : ""), 5200);
      bus.emit("route-refresh");
    } }], { eyebrow: "Route" });
}
