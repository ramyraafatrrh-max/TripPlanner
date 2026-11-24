/* welcome module: the home screen. It shows the sections other modules registered and "Confirmed trips" with progress. */
import { h } from "../../core/dom.js";
import { ic } from "../../core/icons.js";
import * as store from "../../core/store.js";
import { reg, svc, byOrder } from "../../core/registry.js";
import { roundBtn, setBackground, shell } from "../../core/ui.js";
import { fmtShort } from "../../core/util.js";

function tripCard(t) {
  const p = store.progress(t), first = t.days[0] && t.days[0].date, last = t.days.length && t.days[t.days.length - 1].date;
  const photo = svc("banner") && svc("banner").thumb ? svc("banner").thumb(t) : store.coverUrl(store.coverKey(t)), live = svc("live") && svc("live").isLive(t);
  return h("a", { class: "glass trip-card", href: `#/trip/${t.id}/plan`, "aria-label": `Open ${t.name}` }, h("div", { class: "tc-photo", style: { backgroundImage: `url("${photo}")` } }),
    h("div", { class: "tc-body" }, h("h3", { class: "serif" }, t.name), h("div", { class: "stat-line muted" }, first ? `${fmtShort(first)} \u2013 ${fmtShort(last)} \u00B7 ` : "", `${t.days.length} days \u00B7 ${t.hotels.length} hotel${t.hotels.length === 1 ? "" : "s"} \u00B7 ${t.flights.length} flight${t.flights.length === 1 ? "" : "s"}`),
      h("div", { class: "row", style: { gap: "6px", margin: "6px 0" } }, live ? h("span", { class: "pill green" }, ic("refresh", 12), "Live progress") : null, t.viaShare ? h("span", { class: "pill" }, "Shared") : null), h("div", { class: "bar" }, h("i", { style: { width: p.pct + "%" } })), h("div", { class: "muted small" }, `${p.done} of ${p.total} places visited`)),
    h("span", { class: "chev" }, ic("right", 20)));
}
function homeView() {
  setBackground("img/sky.jpg");
  const trips = store.trips(), sections = reg.homeSections.slice().sort(byOrder), body = h("div", { class: "home" });
  body.append(h("section", { class: "hero" }, h("span", { class: "eyebrow" }, "Your travel companion"), h("h1", { class: "serif" }, "Plan it. Walk it. Remember it."), h("p", null, "Upload your itinerary, hotels and flights. Get a day-by-day route on Google Maps, tick off places as you go, and add new ones any time.")));
  sections.filter(s => (s.order ?? 50) < 30).forEach(s => body.append(s.render()));
  body.append(h("section", { class: "trips" }, h("div", { class: "row between" }, h("h2", { class: "serif tabtitle" }, "Confirmed trips"), trips.length ? h("span", { class: "muted small" }, `${trips.length} trip${trips.length === 1 ? "" : "s"}`) : null),
    trips.length ? trips.map(tripCard) : h("div", { class: "glass card empty" }, ic("map", 32), h("p", null, "No trips yet. Upload an itinerary above, or start a blank trip."))));
  sections.filter(s => (s.order ?? 50) >= 30).forEach(s => body.append(s.render()));
  return shell({ eyebrow: "Trip Pilot", title: "My trips", actions: [reg.services.settings ? roundBtn("gear", "App settings and modules", null, "#/app") : null].filter(Boolean), body });
}
export default { id: "welcome", version: "2.1.0", title: "Welcome page", description: "The home screen and the Confirmed trips list.", init(ctx) { ctx.route("", homeView); } };
