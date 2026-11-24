/* plan module: the Plan tab. Day tiles, the day card, the list of places with Visited ticks, route buttons and rearranging. */
import { h } from "../../core/dom.js";
import { ic, ring } from "../../core/icons.js";
import * as store from "../../core/store.js";
import { svc } from "../../core/registry.js";
import { bus } from "../../core/bus.js";
import { go } from "../../core/router.js";
import { tripShell, notFound, toast, openSheet, confirmSheet } from "../../core/ui.js";
import { fmtDate, fmtLong, fmtShort, dow, dayNum, monName, todayIn, nowHM, clip, shortName, fmtKm, hasPt } from "../../core/util.js";

const UI = {};
const isToday = d => todayIn(d.tz) === d.date;
function openDayIndex(trip) { const i = trip.days.findIndex(isToday); if (i >= 0) return i; const up = trip.days.findIndex(d => d.date > todayIn(d.tz)); return up >= 0 ? up : Math.max(0, trip.days.length - 1); }

export function planView({ id, date }) {
  const trip = store.getTrip(id); if (!trip) return notFound();
  const ui = (UI[id] ||= { dayId: null, rearrange: false, sel: new Set(), map: false, fromHotel: false });
  if (date) { const d = trip.days.find(x => x.date === date); if (d) ui.dayId = d.id; }
  if (!ui.dayId || !trip.days.find(d => d.id === ui.dayId)) ui.dayId = (trip.days[openDayIndex(trip)] || {}).id || null;

  const body = h("div"), toolbarHost = h("div"), view = tripShell(trip, "plan", body);
  /* the rearrange bar sits between the scrolling area and the tab bar, as part of the layout */
  const dock = view.querySelector(".dock"); if (dock) view.insertBefore(toolbarHost, dock); else view.append(toolbarHost);
  const scroller = view.querySelector(".scroll"), maps = svc("maps"), places = svc("places");
  const refreshHeader = () => { const p = store.progress(trip), sub = view.querySelector(".topbar .sub"); if (sub) sub.textContent = `${p.done} of ${p.total} places visited`; };
  const persist = () => { store.save(); refreshHeader(); };
  const changed = () => { store.save(); bus.emit("trip-changed", { id: trip.id }); };

  function draw() {
    const keepY = scroller ? scroller.scrollTop : 0; body.replaceChildren();
    if (!trip.days.length) { body.append(h("div", { class: "glass card empty" }, "This trip has no days yet.")); return; }
    const p = store.progress(trip), first = trip.days[0].date, last = trip.days[trip.days.length - 1].date;
    const day = trip.days.find(d => d.id === ui.dayId), idx = trip.days.indexOf(day), dp = store.dayProgress(day);
    const hotel = store.hotelForDate(trip, day.date), flights = store.flightsForDate(trip, day.date), cities = store.dayCities(day);

    const heroInner = h("div", { class: "in" }, h("span", { class: "eyebrow" }, `${fmtShort(first)} \u2013 ${fmtShort(last)} \u00B7 ${trip.days.length} days`), h("h1", null, trip.name),
      h("div", { class: "row between", style: { marginTop: "10px" } }, h("div", { class: "row", style: { gap: "8px" } },
        h("a", { class: "pill " + (trip.hotels.length ? "" : "warn"), href: `#/trip/${trip.id}/hotels`, onclick: e => { e.preventDefault(); go(`#/trip/${trip.id}/hotels`, { replace: true }); } }, ic("hotel", 14), `${trip.hotels.length} hotel${trip.hotels.length === 1 ? "" : "s"}`),
        h("a", { class: "pill " + (trip.flights.length ? "" : "warn"), href: `#/trip/${trip.id}/flights`, onclick: e => { e.preventDefault(); go(`#/trip/${trip.id}/flights`, { replace: true }); } }, ic("plane", 14), `${trip.flights.length} flight${trip.flights.length === 1 ? "" : "s"}`),
        svc("live") && svc("live").isLive(trip) ? h("a", { class: "pill green", href: `#/trip/${trip.id}/settings` }, ic("refresh", 13), "Live") : null), ring(p.pct, 58)));
    const banner = svc("banner");
    body.append(banner ? banner.coverSection(trip, day, heroInner) : h("section", { class: "cover" }, h("div", { class: "layers" }, h("div", { class: "photo on", style: { backgroundImage: `url("${store.coverUrl(store.coverKey(trip))}")` } })), heroInner));

    const missing = [!trip.hotels.length ? "hotel bookings" : null, !trip.flights.length ? "flights" : null].filter(Boolean);
    if (missing.length && svc("intake")) body.append(h("div", { class: "banner" }, ic("filePlus", 22), h("div", { class: "grow" }, h("b", null, "Add your " + missing.join(" and ")), h("span", { class: "muted" }, "Forgot to upload them? Add the PDFs now.")), h("button", { class: "btn small gold", type: "button", onclick: () => svc("intake").openDocs(trip) }, "Add")));

    const tiles = h("div", { class: "tiles", role: "tablist", "aria-label": "Days" });
    trip.days.forEach((d, i) => { const q = store.dayProgress(d); tiles.append(h("button", { type: "button", role: "tab", "aria-selected": d.id === ui.dayId, "aria-label": `Day ${i + 1}, ${fmtLong(d.date)}`, class: "tile" + (d.id === ui.dayId ? " on" : "") + (isToday(d) ? " today" : "") + (q.total && q.done === q.total ? " full" : ""),
      onclick: () => { ui.dayId = d.id; ui.sel.clear(); history.replaceState(null, "", `#/trip/${trip.id}/plan/${d.date}`); draw(); } }, h("span", { class: "dow" }, dow(d.date)), h("span", { class: "num" }, String(dayNum(d.date))), h("span", { class: "mon" }, monName(d.date)), h("span", { class: "dots" }, h("i", { style: { width: q.pct + "%" } })))); });
    /* centre today's tile by scrolling the tile row sideways only (scrollIntoView would also yank the page back up after every tick) */
    body.append(tiles); setTimeout(() => { const on = tiles.querySelector(".on"); if (!on) return; const a = on.getBoundingClientRect(), t = tiles.getBoundingClientRect(); tiles.scrollLeft += (a.left + a.width / 2) - (t.left + t.width / 2); }, 0);

    const card = h("div", { class: "glass card daycard" });
    card.append(h("div", { class: "kick" }, `Day ${idx + 1} of ${trip.days.length} \u00B7 ${fmtLong(day.date)}` + (cities.length ? " \u00B7 " + cities.join(" \u2192 ") : "")), h("h2", { class: "serif" }, store.dayTitle(day)));
    const meta = h("div", { class: "meta-line" }, h("span", { class: "pill " + (dp.total && dp.done === dp.total ? "green" : "gold") }, dp.total && dp.done === dp.total ? "Day complete" : `${dp.done}/${dp.total} visited`));
    if (isToday(day)) meta.append(h("span", { class: "pill warn" }, "Today \u00B7 " + nowHM(day.tz) + " local"));
    if (hotel) meta.append(h("a", { class: "pill", href: `#/trip/${trip.id}/hotels` }, ic("hotel", 13), clip(hotel.name, 24)));
    flights.forEach(f => meta.append(h("a", { class: "pill", href: `#/trip/${trip.id}/flights` }, ic("plane", 13), f.number + (f.depart ? " " + f.depart : ""))));
    card.append(meta, h("div", { class: "bar" }, h("i", { style: { width: dp.pct + "%" } })));

    if (day.lastOpt && day.undo) card.append(h("div", { class: "banner slim" }, ic("shuffle", 20), h("div", { class: "grow" }, h("b", null, "Route updated"), h("span", { class: "muted" }, `${fmtKm(day.lastOpt.before)} \u2192 ${fmtKm(day.lastOpt.after)}` + (day.lastOpt.unlocated ? ` \u00B7 ${day.lastOpt.unlocated} place(s) without a location stayed put` : ""))),
      h("button", { class: "btn small glass", type: "button", onclick: () => { if (places.undoReorder(day)) { changed(); toast("Order restored"); draw(); } } }, "Undo"), h("button", { class: "round small", type: "button", "aria-label": "Dismiss", onclick: () => { day.lastOpt = null; day.undo = null; store.save(); draw(); } }, ic("x", 14))));

    const originOf = () => (ui.fromHotel && hotel ? (hasPt(hotel) ? `${(+hotel.lat).toFixed(6)},${(+hotel.lng).toFixed(6)}` : `${hotel.name} ${hotel.address || ""}`.trim()) : "");
    if (day.stops.length && maps) {
      const next = day.stops.find(s => !s.visited), row = h("div", { class: "row", style: { marginTop: "12px", gap: "8px" } });
      row.append(h("button", { class: "btn small green", type: "button", onclick: () => { ui.map = !ui.map; draw(); } }, ic("map", 16), ui.map ? "Hide map" : "Route map"));
      const use = dp.done > 0 && dp.done < dp.total ? day.stops.filter(s => !s.visited) : day.stops;
      maps.routeUrls(use, { origin: originOf() }).forEach(u => row.append(h("a", { class: "btn small gold", href: u.url, target: "_blank", rel: "noopener" }, ic("ext", 15), u.label + (use !== day.stops ? " (rest)" : ""))));
      if (next) row.append(h("a", { class: "btn small glass", href: maps.dirUrl(next), target: "_blank", rel: "noopener" }, ic("nav", 15), "Next: " + clip(shortName(next.name), 18)));
      card.append(row);
      if (hotel) card.append(h("div", { class: "row", style: { marginTop: "10px" } }, h("button", { type: "button", class: "pill btnlike" + (ui.fromHotel ? " on" : ""), "aria-pressed": ui.fromHotel, onclick: () => { ui.fromHotel = !ui.fromHotel; draw(); } }, ic("hotel", 13), "Start from my hotel")));
    }
    if (ui.map && day.stops.length && maps) card.append(h("div", { class: "map-wrap" }, h("iframe", { src: maps.routeEmbed(day.stops, originOf()), loading: "lazy", title: "Route map", referrerpolicy: "no-referrer-when-downgrade", allowfullscreen: true })), h("p", { class: "muted small", style: { marginTop: "8px" } }, "Google shows driving by default: switch to Transit or Walking inside Maps."));

    const actions = h("div", { class: "row", style: { marginTop: "12px", gap: "8px" } });
    if (places) { actions.append(h("button", { class: "btn small gold", type: "button", onclick: () => places.openAddPlaces(trip, day.id) }, ic("plus", 16), "Add place")); if (day.stops.length > 1) actions.append(h("button", { class: "btn small glass", type: "button", onclick: () => places.openOptimize(trip, day) }, ic("shuffle", 15), "Shortest route")); }
    actions.append(h("button", { class: "btn small " + (ui.rearrange ? "gold" : "line"), type: "button", onclick: () => { ui.rearrange = !ui.rearrange; ui.sel.clear(); draw(); } }, ic("move", 16), ui.rearrange ? "Done" : "Rearrange"));
    if (ui.rearrange) actions.append(h("button", { class: "btn small glass", type: "button", onclick: () => bringSheet(trip, day, () => { changed(); draw(); }) }, ic("down", 15), "Bring stops here"));
    card.append(actions);
    const notes = [["route", "How to get there", day.transit], ["utensils", "Eat", day.eats], ["baby", "Baby and family notes", day.baby]].filter(n => n[2]);
    if (notes.length) card.append(h("details", { class: "daynotes" }, h("summary", null, "Day notes: transport, food and baby tips"), notes.map(([i, t, v]) => h("div", { class: "info-block" }, h("h4", null, ic(i, 15), t), h("p", null, v)))));
    body.append(card);
    if (!day.stops.length) body.append(h("div", { class: "glass card empty" }, ic("calendar", 28), h("p", null, "No places yet on this day. Tap Add place to add one with its Google Maps link.")));
    const tl = h("div", { class: "timeline" }); day.stops.forEach((s, i) => tl.append(stopCard(day, s, i))); body.append(tl);

    toolbarHost.replaceChildren();
    if (ui.rearrange) { const n = ui.sel.size, sel = day.stops.filter(s => ui.sel.has(s.id));
      toolbarHost.append(h("div", { class: "toolbar" }, h("div", { class: "inner" }, h("span", { class: "muted" }, n + " selected"),
        h("button", { class: "btn small gold", type: "button", disabled: !n, onclick: () => moveSheet(trip, new Set(ui.sel), day, () => { ui.sel.clear(); changed(); draw(); }) }, ic("move", 15), "Move"),
        h("button", { class: "btn small glass", type: "button", disabled: !n, onclick: () => { const lock = !sel.every(s => s.locked); sel.forEach(s => { s.locked = lock; }); persist(); draw(); } }, ic("lock", 15), sel.length && sel.every(s => s.locked) ? "Unpin" : "Pin"),
        h("button", { class: "btn small danger", type: "button", disabled: !n, onclick: () => confirmSheet(`Delete ${n} place(s)?`, "They will be removed from the plan.", "Delete", () => { trip.days.forEach(d => { d.stops = d.stops.filter(s => !ui.sel.has(s.id)); }); ui.sel.clear(); changed(); draw(); }) }, ic("trash", 15), "Delete"),
        h("button", { class: "btn small glass", type: "button", onclick: () => { ui.rearrange = false; ui.sel.clear(); draw(); } }, "Done")))); }
    if (scroller) scroller.scrollTop = keepY;
  }

  function stopCard(day, s, i) {
    const bodyEl = h("div", { class: "glass body" }), el = h("div", { class: "stop" + (s.visited ? " visited" : ""), "data-id": s.id }, h("div", { class: "badge" }, s.visited ? ic("check", 20, 2.4) : String(i + 1)), bodyEl);
    bodyEl.append(h("h3", { class: "serif" }, s.time ? h("span", { class: "tchip" }, s.time) : null, s.mapUrl ? h("a", { href: s.mapUrl, target: "_blank", rel: "noopener", class: "maplink", title: "Open in Google Maps" }, s.name, ic("ext", 13)) : s.name));
    if (s.area) bodyEl.append(h("div", { class: "area" }, ic("pin", 13), s.area));
    const tags = h("div", { class: "tags" }); if (s.added) tags.append(h("span", { class: "tag-mini gold" }, "Added")); if (s.locked) tags.append(h("span", { class: "tag-mini" }, ic("lock", 11), "Pinned")); if (!hasPt(s) && day.stops.length > 1) tags.append(h("span", { class: "tag-mini dim", title: "No location yet" }, "No location")); if (tags.children.length) bodyEl.append(tags);
    if (s.visited && s.visitedAt) bodyEl.append(h("div", { class: "when" }, "Visited " + new Date(s.visitedAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })));
    const snippet = s.activity || s.transit || s.notes; if (snippet) bodyEl.append(h("p", { class: "snippet" }, clip(snippet, 190)));
    if (!ui.rearrange) {
      bodyEl.append(h("button", { class: "tick", type: "button", "aria-pressed": s.visited, "aria-label": (s.visited ? "Visited: " : "Mark visited: ") + s.name, onclick: () => { s.visited = !s.visited; s.visitedAt = s.visited ? Date.now() : null; s.vts = Date.now(); persist(); bus.emit("progress-changed", { id: trip.id, stopId: s.id }); if (s.visited && navigator.vibrate) { try { navigator.vibrate(25); } catch (e) { /* ignore */ } } const q = store.dayProgress(day); if (s.visited && q.total && q.done === q.total) toast("Day complete. Well done!"); draw(); } }, ic("check", 20, 2.4)));
      bodyEl.append(h("div", { class: "acts" }, h("a", { class: "btn small gold", href: `#/trip/${trip.id}/place/${s.id}` }, ic("star", 14), "Details"), maps ? h("a", { class: "btn small glass", href: maps.dirUrl(s), target: "_blank", rel: "noopener" }, ic("nav", 14), "Directions") : null, maps ? h("a", { class: "btn small glass", href: maps.placeUrl(s), target: "_blank", rel: "noopener" }, ic("map", 14), s.mapUrl ? "My link" : "Map") : null, places ? h("button", { class: "btn small glass", type: "button", "aria-label": "Edit " + s.name, onclick: () => places.editStopSheet(trip, s, () => { draw(); }) }, ic("edit", 14)) : null));
    } else {
      bodyEl.append(h("button", { class: "selbox", type: "button", "aria-pressed": ui.sel.has(s.id), "aria-label": "Select " + s.name, onclick: () => { ui.sel.has(s.id) ? ui.sel.delete(s.id) : ui.sel.add(s.id); draw(); } }, ic("check", 20, 2.4)));
      const di = trip.days.indexOf(day), mv = delta => { const j = i + delta; if (j < 0 || j >= day.stops.length) return; [day.stops[i], day.stops[j]] = [day.stops[j], day.stops[i]]; changed(); draw(); }, toDay = delta => { const t = trip.days[di + delta]; if (!t) return; day.stops.splice(i, 1); t.stops.push(s); changed(); toast(`Moved to ${fmtDate(t.date)}`); draw(); };
      bodyEl.append(h("div", { class: "reorder" }, h("button", { class: "btn small glass", type: "button", disabled: i === 0, "aria-label": "Move up", onclick: () => mv(-1) }, ic("up", 16)), h("button", { class: "btn small glass", type: "button", disabled: i === day.stops.length - 1, "aria-label": "Move down", onclick: () => mv(1) }, ic("down", 16)),
        h("button", { class: "btn small glass", type: "button", "aria-pressed": s.locked, "aria-label": s.locked ? "Unpin" : "Pin", onclick: () => { s.locked = !s.locked; persist(); draw(); } }, ic(s.locked ? "lock" : "unlock", 15)), h("button", { class: "btn small glass", type: "button", disabled: di === 0, onclick: () => toDay(-1) }, ic("left", 15), "Day"), h("button", { class: "btn small glass", type: "button", disabled: di === trip.days.length - 1, onclick: () => toDay(1) }, "Day", ic("right", 15))));
    }
    return el;
  }
  const offs = [bus.on("trip-changed", e => { if (!view.isConnected) offs.forEach(o => o()); else if (e.id === trip.id) draw(); }), bus.on("progress-changed", e => { if (!view.isConnected) return; if (e.id === trip.id && e.remote) { draw(); refreshHeader(); } })];
  draw(); return view;
}
function moveSheet(trip, ids, fromDay, done) {
  const daySel = h("select", null, trip.days.map((d, i) => h("option", { value: d.id, selected: d.id === fromDay.id }, `Day ${i + 1} \u00B7 ${fmtDate(d.date)} \u00B7 ${store.dayCities(d).join(" \u2192 ") || "no city"}`))), posSel = h("select");
  const fill = () => { const t = trip.days.find(d => d.id === daySel.value); posSel.replaceChildren(h("option", { value: "end" }, "At the end of the day"), h("option", { value: "start" }, "At the start of the day"), ...t.stops.filter(s => !ids.has(s.id)).map(s => h("option", { value: s.id }, `After: ${clip(shortName(s.name), 38)}`))); }; daySel.addEventListener("change", fill); fill();
  openSheet("Move places", h("div", null, h("label", { class: "field" }, "Move " + ids.size + " place(s) to"), daySel, h("label", { class: "field" }, "Position"), posSel), [{ label: "Cancel", cls: "glass" }, { label: "Move", cls: "gold", onclick: () => { const moving = []; trip.days.forEach(d => { d.stops = d.stops.filter(s => { if (ids.has(s.id)) { moving.push(s); return false; } return true; }); }); const t = trip.days.find(d => d.id === daySel.value); let at = t.stops.length; if (posSel.value === "start") at = 0; else if (posSel.value !== "end") at = t.stops.findIndex(s => s.id === posSel.value) + 1; t.stops.splice(at, 0, ...moving); toast(`Moved ${moving.length} place(s) to ${fmtDate(t.date)}`); done(); } }], { eyebrow: "Rearrange" });
}
function bringSheet(trip, day, redraw) {
  const picked = new Set(), list = h("div"); trip.days.forEach((d, i) => { if (d.id === day.id || !d.stops.length) return; list.append(h("div", { class: "daylabel" }, `Day ${i + 1} \u00B7 ${fmtDate(d.date)} ${d.date < day.date ? "(earlier)" : "(later)"}`)); d.stops.forEach(s => list.append(h("label", { class: "pickrow" }, h("input", { type: "checkbox", onchange: e => (e.target.checked ? picked.add(s.id) : picked.delete(s.id)) }), h("span", null, clip(shortName(s.name), 46) + (s.visited ? "  (visited)" : ""))))); });
  const copy = h("input", { type: "checkbox" });
  openSheet("Bring stops into " + fmtDate(day.date), h("div", null, h("p", { class: "muted" }, "Pick places from earlier or later days. They are moved here, unless you choose copy."), list, h("label", { class: "pickrow", style: { marginTop: "12px" } }, copy, h("span", null, "Copy instead of move"))), [{ label: "Cancel", cls: "glass" }, { label: "Add to this day", cls: "gold", onclick: () => { if (!picked.size) { toast("Tick at least one place."); return false; } const moved = []; trip.days.forEach(d => { if (d.id === day.id) return; if (copy.checked) d.stops.forEach(s => { if (picked.has(s.id)) moved.push(store.makeStop(Object.assign({}, s, { id: undefined, visited: false, visitedAt: null }))); }); else d.stops = d.stops.filter(s => { if (picked.has(s.id)) { moved.push(s); return false; } return true; }); }); day.stops.push(...moved); toast(`Added ${moved.length} place(s)`); redraw(); } }], { eyebrow: "Rearrange" });
}
export default { id: "plan", version: "2.1.0", title: "Plan tab", description: "Days, places, Visited ticks, route buttons and rearranging.",
  init(ctx) { ctx.route("trip/:id", p => planView(p)); ctx.route("trip/:id/plan", p => planView(p)); ctx.route("trip/:id/plan/:date", p => planView(p)); ctx.tab({ id: "plan", label: "Plan", icon: "calendar", order: 10 }); } };
