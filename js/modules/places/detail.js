/* detail.js - the page for one place: what you planned, a map, web info, your notes. */
import { h } from "../../core/dom.js";
import { ic } from "../../core/icons.js";
import * as store from "../../core/store.js";
import { svc } from "../../core/registry.js";
import { shell, notFound, toast } from "../../core/ui.js";
import { bus } from "../../core/bus.js";
import { fmtDate, fmtLong, shortName, hasPt } from "../../core/util.js";
import { webInfo, searchTermFor, stopLinks } from "./wiki.js";
import { editStopSheet } from "./edit.js";

const block = (icon, title, text) => (text ? h("div", { class: "info-block" }, h("h4", null, ic(icon, 15), title), h("p", null, text)) : null);

export function placeView({ id, stopId }) {
  const trip = store.getTrip(id), found = trip && store.findStop(trip, stopId);
  if (!found) return notFound("This place is not in the plan any more.");
  const { day, stop } = found, maps = svc("maps");
  const body = h("div");

  const tick = h("button", { class: "btn small", type: "button" });
  const paint = () => { tick.className = "btn small " + (stop.visited ? "green" : "glass"); tick.setAttribute("aria-pressed", stop.visited); tick.replaceChildren(ic("check", 16, 2.4), stop.visited ? "Visited" : "Mark as visited"); };
  tick.addEventListener("click", () => { stop.visited = !stop.visited; stop.visitedAt = stop.visited ? Date.now() : null; stop.vts = Date.now(); store.save(); bus.emit("progress-changed", { id: trip.id, stopId: stop.id }); paint(); toast(stop.visited ? "Marked as visited" : "Marked as not visited"); });
  paint();

  const located = hasPt(stop);
  body.append(h("div", { class: "glass card" },
    h("div", { class: "kick muted" }, `${fmtLong(day.date)} \u00B7 stop ${day.stops.indexOf(stop) + 1} of ${day.stops.length}${stop.time ? " \u00B7 " + stop.time : ""}`),
    h("h2", { class: "serif big" }, stop.mapUrl ? h("a", { href: stop.mapUrl, target: "_blank", rel: "noopener", class: "maplink" }, stop.name, ic("ext", 15)) : stop.name),
    stop.area ? h("div", { class: "area muted" }, ic("pin", 14), stop.area) : null,
    stop.added ? h("span", { class: "pill gold" }, "Added by you") : null,
    h("div", { class: "row", style: { marginTop: "12px" } }, tick,
      h("a", { class: "btn small gold", href: maps.dirUrl(stop), target: "_blank", rel: "noopener" }, ic("nav", 15), "Directions"),
      h("a", { class: "btn small glass", href: maps.placeUrl(stop), target: "_blank", rel: "noopener" }, ic("map", 15), stop.mapUrl ? "Open my link" : "Open in Maps"),
      h("button", { class: "btn small glass", type: "button", onclick: () => editStopSheet(trip, stop, () => bus.emit("route-refresh")) }, ic("edit", 15), "Edit")),
    !stop.mapUrl ? h("p", { class: "muted small" }, "Tip: tap Edit and paste a Google Maps link so this place opens exactly where you want.") : null,
    h("div", { class: "map-wrap" }, h("iframe", { src: maps.placeEmbed(stop), loading: "lazy", title: "Map of " + stop.name, referrerpolicy: "no-referrer-when-downgrade", allowfullscreen: true })),
    located ? h("p", { class: "muted small" }, `Location: ${(+stop.lat).toFixed(5)}, ${(+stop.lng).toFixed(5)}`) : null));

  const mine = h("div", { class: "glass card" }, h("h3", null, "From your itinerary"));
  [block("star", "What you will see and do", stop.activity), block("route", "How to get there", stop.transit || day.transit), block("baby", "Baby and family notes", stop.baby || day.baby), block("utensils", "Eating and cost", stop.eats || day.eats)].forEach(b => b && mine.append(b));
  if (mine.children.length === 1) mine.append(h("p", { class: "muted" }, "Nothing was written for this place."));
  body.append(mine);

  const web = h("div", { class: "glass card" }, h("h3", null, "About this place"));
  const term = h("input", { type: "text", value: searchTermFor(stop), "aria-label": "Search term" });
  const results = h("div");
  const load = async () => {
    stop.searchTerm = term.value.trim(); store.save(true);
    results.replaceChildren(h("p", { class: "muted" }, h("span", { class: "spinner" }), "Looking this place up\u2026"));
    try {
      const infos = await webInfo(stop.searchTerm), good = infos.filter(i => !i.error);
      results.replaceChildren(...(good.length ? good.map(i => h("div", { class: "webinfo" }, i.image ? h("img", { src: i.image, alt: i.title, loading: "lazy" }) : null, h("b", null, `${i.title} \u00B7 ${i.source}`), h("p", null, i.extract), i.url ? h("a", { href: i.url, target: "_blank", rel: "noopener" }, "Read more on " + i.source) : null))
        : [h("div", { class: "warnbox" }, infos.some(i => i.error) ? "Could not reach Wikipedia or Wikivoyage (are you offline?)." : `No article found for "${stop.searchTerm}". Try a simpler name and search again.`)]));
    } catch (e) { results.replaceChildren(h("div", { class: "warnbox" }, "Lookup failed: " + e.message)); }
  };
  web.append(h("div", { class: "row nowrap" }, h("div", { class: "grow" }, term), h("button", { class: "btn small gold", type: "button", onclick: load }, ic("search", 15), "Search")), results,
    h("p", { class: "muted", style: { margin: "10px 0 8px" } }, "Summaries come from Wikipedia and Wikivoyage. TripAdvisor and other travel sites do not let apps read their pages, so they open in a new tab:"),
    h("div", { class: "linkgrid" }, stopLinks(stop).map(l => h("a", { class: "btn small glass", href: l.url, target: "_blank", rel: "noopener" }, ic("ext", 14), l.label))));
  body.append(web); load();

  const notes = h("textarea", { placeholder: "Your own notes, booking codes, reminders\u2026" }); notes.value = stop.notes || "";
  notes.addEventListener("input", () => { stop.notes = notes.value; store.save(true); });
  body.append(h("div", { class: "glass card" }, h("h3", null, "My notes"), notes));
  return shell({ eyebrow: fmtDate(day.date), title: shortName(stop.name), back: `#/trip/${trip.id}/plan/${day.date}`, home: true, body });
}
