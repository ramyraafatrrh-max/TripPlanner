/* views-trip.js - the trip screens: Plan, Place, Hotels, Flights, Settings */
import { h, fmtDate, fmtLong, fmtShort, dow, dayNum, monName, daysBetween, todayIn, nowHM, clip, download, uid, shortStopName } from "./util.js";
import * as store from "./store.js";
import * as maps from "./maps.js";
import * as notify from "./notify.js";
import { webInfo, stopLinks, searchTermFor } from "./places.js";
import { shell, toast, openSheet, confirmSheet, roundBtn, go } from "./ui.js";
import { ic, ring } from "./icons.js";
import { docsSheet, uploadButton } from "./docs.js";
import { shareCard, tripLinkSheet } from "./shareui.js";
import { COMMON_TZ } from "./util.js";

const planUI = {}; // per trip: {dayId, rearrange, sel:Set, map, fromHotel}

function notFound() {
  return shell({ title: "Trip not found", back: "#/", body: h("div", { class: "glass card empty" }, ic("map", 30), h("p", null, "This trip is not on this device any more."), h("a", { class: "btn gold", href: "#/" }, "Go to my trips")) });
}
function smartDayIndex(trip) {
  for (let i = 0; i < trip.days.length; i++) if (todayIn(trip.days[i].tz) === trip.days[i].date) return i;
  const up = trip.days.findIndex(d => d.date > todayIn(d.tz));
  return up >= 0 ? up : Math.max(0, trip.days.length - 1);
}
const isToday = d => todayIn(d.tz) === d.date;

function tripShell(trip, tab, body) {
  const p = store.progress(trip);
  return shell({
    eyebrow: "Trip Pilot", title: trip.name, sub: `${p.done} of ${p.total} places visited`, back: "#/",
    actions: [roundBtn("link", "Share this trip", () => tripLinkSheet(trip)), roundBtn("filePlus", "Add or update documents", () => docsSheet(trip)), roundBtn("sliders", "Trip settings", null, `#/trip/${trip.id}/settings`)],
    tripId: trip.id, tab, body
  });
}
const info = (icon, title, text) => (text ? h("div", { class: "info-block" }, h("h4", null, ic(icon, 15), title), h("p", null, text)) : null);

/* =====================================================================
   PLAN
   ===================================================================== */
export function planView(route) {
  const trip = store.getTrip(route.id);
  if (!trip) return notFound();
  const ui = (planUI[trip.id] ||= { dayId: null, rearrange: false, sel: new Set(), map: false, fromHotel: false });
  if (route.date) { const d = trip.days.find(x => x.date === route.date); if (d) ui.dayId = d.id; }
  if (!ui.dayId || !trip.days.find(d => d.id === ui.dayId)) ui.dayId = trip.days[smartDayIndex(trip)]?.id || null;

  const body = h("div");
  const view = tripShell(trip, "plan", body);
  const toolbarHost = h("div");
  view.appendChild(toolbarHost);

  const todayDay = trip.days.find(isToday);
  if (todayDay) notify.localMorningNotice(trip, todayDay, trip.days.indexOf(todayDay) + 1);

  function persist() { store.save(); const p = store.progress(trip); const sub = view.querySelector(".topbar .sub"); if (sub) sub.textContent = `${p.done} of ${p.total} places visited`; }

  function draw() {
    const y = window.scrollY;
    body.innerHTML = "";
    if (!trip.days.length) { body.appendChild(h("div", { class: "glass card empty" }, "This trip has no days yet.")); return; }
    const p = store.progress(trip);
    const first = trip.days[0].date, last = trip.days[trip.days.length - 1].date;

    /* cover */
    body.appendChild(h("section", { class: "cover" },
      h("div", { class: "photo", style: { backgroundImage: `url("${store.coverUrl(store.coverKey(trip))}")` } }),
      h("div", { class: "in" },
        h("span", { class: "eyebrow" }, `${fmtShort(first)} \u2013 ${fmtShort(last)} \u00B7 ${trip.days.length} days`),
        h("h1", null, trip.name),
        h("div", { class: "row between", style: { marginTop: "10px" } },
          h("div", { class: "row", style: { gap: "8px" } },
            h("a", { class: "pill " + (trip.hotels.length ? "" : "warn"), href: `#/trip/${trip.id}/hotels`, onclick: e => { e.preventDefault(); go(`#/trip/${trip.id}/hotels`, { replace: true }); } }, ic("hotel", 14), `${trip.hotels.length} hotel${trip.hotels.length === 1 ? "" : "s"}`),
            h("a", { class: "pill " + (trip.flights.length ? "" : "warn"), href: `#/trip/${trip.id}/flights`, onclick: e => { e.preventDefault(); go(`#/trip/${trip.id}/flights`, { replace: true }); } }, ic("plane", 14), `${trip.flights.length} flight${trip.flights.length === 1 ? "" : "s"}`)),
          ring(p.pct, 58)))));

    /* missing documents nudge */
    const missing = [!trip.hotels.length ? "hotel bookings" : null, !trip.flights.length ? "flights" : null].filter(Boolean);
    if (missing.length) body.appendChild(h("div", { class: "banner" }, ic("filePlus", 22), h("div", { class: "grow" }, h("b", null, "Add your " + missing.join(" and ")), h("span", { class: "muted" }, "Forgot to upload them? Add the PDFs now.")),
      h("button", { class: "btn small gold", type: "button", onclick: () => docsSheet(trip) }, "Add")));

    /* day tiles */
    const tiles = h("div", { class: "tiles", role: "tablist", "aria-label": "Days" });
    trip.days.forEach((d, i) => {
      const dp = store.dayProgress(d);
      tiles.appendChild(h("button", { type: "button", role: "tab", "aria-selected": d.id === ui.dayId, "aria-label": `Day ${i + 1}, ${fmtLong(d.date)}`,
        class: "tile" + (d.id === ui.dayId ? " on" : "") + (isToday(d) ? " today" : "") + (dp.total && dp.done === dp.total ? " full" : ""),
        onclick: () => { ui.dayId = d.id; ui.sel.clear(); history.replaceState(null, "", `#/trip/${trip.id}/plan/${d.date}`); draw(); } },
        h("span", { class: "dow" }, dow(d.date)), h("span", { class: "num" }, String(dayNum(d.date))), h("span", { class: "mon" }, monName(d.date)),
        h("span", { class: "dots" }, h("i", { style: { width: dp.pct + "%" } }))));
    });
    body.appendChild(tiles);
    setTimeout(() => tiles.querySelector(".on")?.scrollIntoView({ inline: "center", block: "nearest" }), 0);

    const day = trip.days.find(d => d.id === ui.dayId);
    const idx = trip.days.indexOf(day);
    const dp = store.dayProgress(day);
    const cities = store.dayCities(day);
    const hotel = store.hotelForDate(trip, day.date);
    const flights = store.flightsForDate(trip, day.date);

    const card = h("div", { class: "glass card daycard" });
    card.appendChild(h("div", { class: "kick" }, `Day ${idx + 1} of ${trip.days.length} \u00B7 ${fmtLong(day.date)}` + (cities.length ? " \u00B7 " + cities.join(" \u2192 ") : "")));
    card.appendChild(h("h2", { class: "serif" }, store.dayTitle(day)));
    const meta = h("div", { class: "meta-line" });
    meta.appendChild(h("span", { class: "pill " + (dp.total && dp.done === dp.total ? "green" : "gold") }, dp.total && dp.done === dp.total ? "Day complete" : `${dp.done}/${dp.total} visited`));
    if (isToday(day)) meta.appendChild(h("span", { class: "pill warn" }, "Today \u00B7 " + nowHM(day.tz) + " local"));
    if (hotel) meta.appendChild(h("a", { class: "pill", href: `#/trip/${trip.id}/hotels` }, ic("hotel", 13), clip(hotel.name, 24)));
    flights.forEach(f => meta.appendChild(h("a", { class: "pill", href: `#/trip/${trip.id}/flights` }, ic("plane", 13), f.number + (f.depart ? " " + f.depart : ""))));
    card.appendChild(meta);
    card.appendChild(h("div", { class: "bar" }, h("i", { style: { width: dp.pct + "%" } })));

    if (day.stops.length) {
      const nextStop = day.stops.find(s => !s.visited);
      const row = h("div", { class: "row", style: { marginTop: "12px", gap: "8px" } });
      row.appendChild(h("button", { class: "btn small green", type: "button", onclick: () => { ui.map = !ui.map; draw(); } }, ic("map", 16), ui.map ? "Hide map" : "Route map"));
      const useStops = (dp.done > 0 && dp.done < dp.total) ? day.stops.filter(s => !s.visited) : day.stops;
      maps.routeUrls(useStops, { origin: ui.fromHotel && hotel ? (hotel.name + " " + hotel.address).trim() : "" })
        .forEach(u => row.appendChild(h("a", { class: "btn small gold", href: u.url, target: "_blank", rel: "noopener" }, ic("ext", 15), u.label + (useStops !== day.stops ? " (rest)" : ""))));
      if (nextStop) row.appendChild(h("a", { class: "btn small glass", href: maps.nextStopUrl(nextStop), target: "_blank", rel: "noopener" }, ic("nav", 15), "Next: " + clip(shortStopName(nextStop.name), 18)));
      card.appendChild(row);
      if (hotel) card.appendChild(h("div", { class: "row", style: { marginTop: "10px" } }, h("button", { type: "button", class: "pill btnlike" + (ui.fromHotel ? " on" : ""), "aria-pressed": ui.fromHotel, onclick: () => { ui.fromHotel = !ui.fromHotel; draw(); } }, ic("hotel", 13), "Start from my hotel")));
    }
    if (ui.map && day.stops.length) {
      const wrap = h("div", { class: "map-wrap" });
      if (store.settings().mapsKey) {
        const g = h("div", { class: "gmap" });
        wrap.appendChild(g);
        maps.drawDayMap(g, day.stops, s => go(`#/trip/${trip.id}/place/${s.id}`)).catch(err => { wrap.innerHTML = ""; wrap.appendChild(h("div", { class: "warnbox" }, "Could not load the Google map (" + err.message + "). Check the key in Settings, or use the buttons above.")); });
      } else wrap.appendChild(h("iframe", { src: maps.routeEmbedSrc(day.stops), loading: "lazy", title: "Route map", referrerpolicy: "no-referrer-when-downgrade", allowfullscreen: true }));
      card.appendChild(wrap);
      if (!store.settings().mapsKey) card.appendChild(h("p", { class: "muted", style: { marginTop: "8px" } }, "The preview shows the route between your stops. For numbered pins on every stop, add a Google Maps key in Settings."));
    }

    const rrow = h("div", { class: "row", style: { marginTop: "12px", gap: "8px" } });
    rrow.appendChild(h("button", { class: "btn small " + (ui.rearrange ? "gold" : "line"), type: "button", onclick: () => { ui.rearrange = !ui.rearrange; ui.sel.clear(); draw(); } }, ic("move", 16), ui.rearrange ? "Done rearranging" : "Rearrange this day"));
    if (ui.rearrange) {
      rrow.appendChild(h("button", { class: "btn small glass", type: "button", onclick: () => bringSheet(trip, day, draw) }, ic("down", 15), "Bring stops here"));
      rrow.appendChild(h("button", { class: "btn small glass", type: "button", onclick: () => addStopSheet(trip, day, draw) }, ic("plus", 15), "Add a stop"));
    }
    card.appendChild(rrow);
    body.appendChild(card);

    if (!day.stops.length) body.appendChild(h("div", { class: "glass card empty" }, ic("calendar", 28), h("p", null, "A free day. Use Rearrange to bring stops from other days, or add your own.")));
    const tl = h("div", { class: "timeline" });
    day.stops.forEach((s, i) => tl.appendChild(stopCard(trip, day, s, i)));
    body.appendChild(tl);

    toolbarHost.innerHTML = "";
    if (ui.rearrange) {
      const n = ui.sel.size;
      toolbarHost.appendChild(h("div", { class: "toolbar" }, h("div", { class: "inner" },
        h("span", { class: "muted" }, n + " selected"),
        h("button", { class: "btn small gold", type: "button", disabled: n === 0, onclick: () => moveSheet(trip, new Set(ui.sel), day, () => { ui.sel.clear(); draw(); }) }, ic("move", 15), "Move to\u2026"),
        h("button", { class: "btn small danger", type: "button", disabled: n === 0, onclick: () => confirmSheet("Delete " + n + " stop(s)?", "They will be removed from the plan.", "Delete", () => { trip.days.forEach(d => (d.stops = d.stops.filter(s => !ui.sel.has(s.id)))); ui.sel.clear(); persist(); draw(); }) }, ic("trash", 15), "Delete"),
        h("button", { class: "btn small glass", type: "button", onclick: () => { ui.rearrange = false; ui.sel.clear(); draw(); } }, "Done"))));
    }
    window.scrollTo(0, y);
  }

  function stopCard(trip, day, s, i) {
    const body = h("div", { class: "glass body" });
    const card = h("div", { class: "stop" + (s.visited ? " visited" : ""), "data-id": s.id }, h("div", { class: "badge" }, s.visited ? ic("check", 20, 2.4) : String(i + 1)), body);
    body.appendChild(h("h3", { class: "serif" }, s.name));
    if (s.area) body.appendChild(h("div", { class: "area" }, ic("pin", 13), s.area));
    if (s.visited && s.visitedAt) body.appendChild(h("div", { class: "when" }, "Visited " + new Date(s.visitedAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })));
    const snippet = s.activity || s.transit || s.notes;
    if (snippet) body.appendChild(h("p", { class: "snippet" }, snippet));
    if (!ui.rearrange) {
      body.appendChild(h("button", { class: "tick", type: "button", "aria-pressed": s.visited, "aria-label": (s.visited ? "Visited: " : "Mark visited: ") + s.name,
        onclick: () => {
          s.visited = !s.visited; s.visitedAt = s.visited ? Date.now() : null; persist();
          if (s.visited && navigator.vibrate) { try { navigator.vibrate(25); } catch (e) { /* ignore */ } }
          const dp = store.dayProgress(day); if (s.visited && dp.total && dp.done === dp.total) toast("Day complete. Well done!");
          draw();
        } }, ic("check", 20, 2.4)));
      body.appendChild(h("div", { class: "acts" },
        h("a", { class: "btn small gold", href: `#/trip/${trip.id}/place/${s.id}` }, ic("star", 14), "Details"),
        h("a", { class: "btn small glass", href: maps.dirUrl(s.query || s.name), target: "_blank", rel: "noopener" }, ic("nav", 14), "Directions"),
        h("a", { class: "btn small glass", href: maps.placeUrl(s.query || s.name), target: "_blank", rel: "noopener" }, ic("map", 14), "Map")));
    } else {
      body.appendChild(h("button", { class: "selbox", type: "button", "aria-pressed": ui.sel.has(s.id), "aria-label": "Select " + s.name, onclick: () => { ui.sel.has(s.id) ? ui.sel.delete(s.id) : ui.sel.add(s.id); draw(); } }, ic("check", 20, 2.4)));
      const di = trip.days.indexOf(day);
      const mv = delta => { const j = i + delta; if (j < 0 || j >= day.stops.length) return; [day.stops[i], day.stops[j]] = [day.stops[j], day.stops[i]]; persist(); draw(); };
      const toDay = delta => { const t = trip.days[di + delta]; if (!t) return; day.stops.splice(i, 1); t.stops.push(s); persist(); toast(`Moved to ${fmtDate(t.date)}`); draw(); };
      body.appendChild(h("div", { class: "reorder" },
        h("button", { class: "btn small glass", type: "button", disabled: i === 0, "aria-label": "Move up", onclick: () => mv(-1) }, ic("up", 16)),
        h("button", { class: "btn small glass", type: "button", disabled: i === day.stops.length - 1, "aria-label": "Move down", onclick: () => mv(1) }, ic("down", 16)),
        h("button", { class: "btn small glass", type: "button", disabled: di === 0, onclick: () => toDay(-1) }, ic("left", 15), "Day"),
        h("button", { class: "btn small glass", type: "button", disabled: di === trip.days.length - 1, onclick: () => toDay(1) }, "Day", ic("right", 15))));
    }
    return card;
  }

  draw();
  return view;
}

/* ---------- sheets used by the Plan tab ---------- */
function moveSheet(trip, ids, fromDay, done) {
  const daySel = h("select", { id: "mvDay" }, trip.days.map((d, i) => h("option", { value: d.id, selected: d.id === fromDay.id }, `Day ${i + 1} \u00B7 ${fmtDate(d.date)} \u00B7 ${store.dayCities(d).join(" \u2192 ") || "no city"}`)));
  const posSel = h("select", { id: "mvPos" });
  const fillPos = () => {
    const t = trip.days.find(d => d.id === daySel.value);
    posSel.innerHTML = "";
    posSel.appendChild(h("option", { value: "end" }, "At the end of the day"));
    posSel.appendChild(h("option", { value: "start" }, "At the start of the day"));
    t.stops.filter(s => !ids.has(s.id)).forEach(s => posSel.appendChild(h("option", { value: s.id }, `After: ${clip(shortStopName(s.name), 38)}`)));
  };
  daySel.addEventListener("change", fillPos); fillPos();
  openSheet("Move stops", h("div", null, h("label", { class: "field" }, "Move " + ids.size + " stop(s) to"), daySel, h("label", { class: "field" }, "Position"), posSel), [
    { label: "Cancel", cls: "glass" },
    { label: "Move", cls: "gold", onclick: () => {
      const moving = [];
      trip.days.forEach(d => (d.stops = d.stops.filter(s => { if (ids.has(s.id)) { moving.push(s); return false; } return true; })));
      const t = trip.days.find(d => d.id === daySel.value);
      let at = t.stops.length;
      if (posSel.value === "start") at = 0; else if (posSel.value !== "end") at = t.stops.findIndex(s => s.id === posSel.value) + 1;
      t.stops.splice(at, 0, ...moving);
      store.save(); toast(`Moved ${moving.length} stop(s) to ${fmtDate(t.date)}`); done();
    } }], { eyebrow: "Rearrange" });
}
function bringSheet(trip, day, redraw) {
  const picked = new Set();
  const list = h("div");
  trip.days.forEach((d, i) => {
    if (d.id === day.id || !d.stops.length) return;
    list.appendChild(h("div", { class: "daylabel" }, `Day ${i + 1} \u00B7 ${fmtDate(d.date)} ${d.date < day.date ? "(earlier)" : "(later)"}`));
    d.stops.forEach(s => list.appendChild(h("label", { class: "pickrow" }, h("input", { type: "checkbox", onchange: e => (e.target.checked ? picked.add(s.id) : picked.delete(s.id)) }), h("span", null, clip(shortStopName(s.name), 46) + (s.visited ? "  (visited)" : "")))));
  });
  const copyBox = h("input", { type: "checkbox", id: "cp" });
  openSheet("Bring stops into " + fmtDate(day.date), h("div", null, h("p", { class: "muted" }, "Pick stops from earlier or later days. They are moved here, unless you choose copy."), list, h("label", { class: "pickrow", style: { marginTop: "12px" } }, copyBox, h("span", null, "Copy instead of move"))), [
    { label: "Cancel", cls: "glass" },
    { label: "Add to this day", cls: "gold", onclick: () => {
      if (!picked.size) { toast("Tick at least one stop."); return false; }
      const moved = [];
      trip.days.forEach(d => {
        if (d.id === day.id) return;
        if (copyBox.checked) d.stops.forEach(s => { if (picked.has(s.id)) moved.push(Object.assign({}, s, { id: uid("s"), visited: false, visitedAt: null })); });
        else d.stops = d.stops.filter(s => { if (picked.has(s.id)) { moved.push(s); return false; } return true; });
      });
      day.stops.push(...moved);
      store.save(); toast(`Added ${moved.length} stop(s)`); redraw();
    } }], { eyebrow: "Rearrange" });
}
function addStopSheet(trip, day, redraw) {
  const name = h("input", { type: "text", placeholder: "e.g. Ichiran Ramen Shibuya" });
  const query = h("input", { type: "text", placeholder: "Name or address to find on Google Maps (optional)" });
  const note = h("textarea", { placeholder: "Notes (optional)" });
  openSheet("Add a stop", h("div", null, h("label", { class: "field" }, "Place name"), name, h("label", { class: "field" }, "Google Maps search"), query, h("label", { class: "field" }, "Notes"), note), [
    { label: "Cancel", cls: "glass" },
    { label: "Add", cls: "gold", onclick: () => {
      if (!name.value.trim()) { toast("Give the stop a name."); return false; }
      day.stops.push({ id: uid("s"), name: name.value.trim(), area: "", query: (query.value || name.value).trim(), transit: "", activity: note.value.trim(), baby: "", eats: "", city: day.city, label: "", visited: false, visitedAt: null, notes: "", searchTerm: "" });
      store.save(); redraw();
    } }], { eyebrow: "Rearrange" });
}

/* =====================================================================
   PLACE DETAIL
   ===================================================================== */
export function placeView(route) {
  const trip = store.getTrip(route.id);
  const found = trip && store.findStop(trip, route.stopId);
  if (!found) return notFound();
  const { day, stop } = found;
  const body = h("div");

  const tickBtn = h("button", { class: "btn small " + (stop.visited ? "green" : "glass"), type: "button", "aria-pressed": stop.visited });
  const paintTick = () => { tickBtn.className = "btn small " + (stop.visited ? "green" : "glass"); tickBtn.setAttribute("aria-pressed", stop.visited); tickBtn.innerHTML = ""; tickBtn.appendChild(ic("check", 16, 2.4)); tickBtn.appendChild(document.createTextNode(stop.visited ? "Visited" : "Mark as visited")); };
  tickBtn.addEventListener("click", () => { stop.visited = !stop.visited; stop.visitedAt = stop.visited ? Date.now() : null; store.save(); paintTick(); toast(stop.visited ? "Marked as visited" : "Marked as not visited"); });
  paintTick();

  body.appendChild(h("div", { class: "glass card" },
    h("div", { class: "kick muted" }, `${fmtLong(day.date)} \u00B7 stop ${day.stops.indexOf(stop) + 1} of ${day.stops.length}`),
    h("h2", { class: "serif", style: { fontSize: "1.5rem", marginTop: "4px" } }, stop.name),
    stop.area ? h("div", { class: "area muted", style: { display: "flex", gap: "6px", alignItems: "center" } }, ic("pin", 14), stop.area) : null,
    h("div", { class: "row", style: { marginTop: "12px" } }, tickBtn,
      h("a", { class: "btn small gold", href: maps.dirUrl(stop.query || stop.name), target: "_blank", rel: "noopener" }, ic("nav", 15), "Directions"),
      h("a", { class: "btn small glass", href: maps.placeUrl(stop.query || stop.name), target: "_blank", rel: "noopener" }, ic("map", 15), "Open in Maps")),
    h("div", { class: "map-wrap" }, h("iframe", { src: maps.placeEmbedSrc(stop.query || stop.name), loading: "lazy", title: "Map of " + stop.name, referrerpolicy: "no-referrer-when-downgrade", allowfullscreen: true }))));

  const mine = h("div", { class: "glass card" }, h("h3", null, "From your itinerary"));
  [info("star", "What you will see and do", stop.activity), info("route", "How to get there", stop.transit), info("baby", "Baby and family notes", stop.baby), info("utensils", "Eating and cost", stop.eats)].forEach(b => b && mine.appendChild(b));
  if (!stop.activity && !stop.transit && !stop.baby && !stop.eats) mine.appendChild(h("p", { class: "muted" }, "Nothing was written for this stop in your PDF."));
  body.appendChild(mine);

  const web = h("div", { class: "glass card" }, h("h3", null, "About this place"));
  const termInput = h("input", { type: "text", value: searchTermFor(stop), "aria-label": "Search term" });
  const results = h("div");
  const load = async () => {
    stop.searchTerm = termInput.value.trim(); store.save();
    results.innerHTML = ""; results.appendChild(h("p", { class: "muted" }, h("span", { class: "spinner" }), "Looking this place up\u2026"));
    try {
      const infos = await webInfo(stop.searchTerm);
      results.innerHTML = "";
      const good = infos.filter(i => !i.error);
      if (!good.length) results.appendChild(h("div", { class: "warnbox" }, infos.some(i => i.error) ? "Could not reach Wikipedia or Wikivoyage (are you offline?)." : "No article found for \"" + stop.searchTerm + "\". Try a simpler name above and search again."));
      good.forEach(i => results.appendChild(h("div", { class: "webinfo" }, i.image ? h("img", { src: i.image, alt: i.title, loading: "lazy" }) : null,
        h("b", null, i.title + " \u00B7 " + i.source), h("p", { style: { margin: "4px 0" } }, i.extract), i.url ? h("a", { href: i.url, target: "_blank", rel: "noopener" }, "Read more on " + i.source) : null)));
    } catch (e) { results.innerHTML = ""; results.appendChild(h("div", { class: "warnbox" }, "Lookup failed: " + e.message)); }
  };
  web.appendChild(h("div", { class: "row", style: { flexWrap: "nowrap" } }, h("div", { class: "grow" }, termInput), h("button", { class: "btn small gold", type: "button", onclick: load }, ic("search", 15), "Search")));
  web.appendChild(results);
  web.appendChild(h("p", { class: "muted", style: { margin: "10px 0 8px" } }, "Summaries come from Wikipedia and Wikivoyage. TripAdvisor and other travel sites do not allow apps to read their pages, so they open in a new tab:"));
  web.appendChild(h("div", { class: "linkgrid" }, stopLinks(stop).map(l => h("a", { class: "btn small glass", href: l.url, target: "_blank", rel: "noopener" }, ic("ext", 14), l.label))));
  body.appendChild(web);
  load();

  const notes = h("textarea", { placeholder: "Your own notes, booking codes, reminders\u2026" });
  notes.value = stop.notes || "";
  notes.addEventListener("input", () => { stop.notes = notes.value; store.save(); });
  body.appendChild(h("div", { class: "glass card" }, h("h3", null, "My notes"), notes));

  return shell({ eyebrow: fmtDate(day.date), title: shortStopName(stop.name), back: `#/trip/${trip.id}/plan/${day.date}`, home: true, body });
}

/* =====================================================================
   HOTELS
   ===================================================================== */
export function hotelsView(route) {
  const trip = store.getTrip(route.id);
  if (!trip) return notFound();
  const body = h("div");
  const view = tripShell(trip, "hotels", body);

  function draw() {
    body.innerHTML = "";
    body.appendChild(h("div", { class: "row between", style: { margin: "2px 2px 6px" } },
      h("div", null, h("span", { class: "eyebrow" }, "Accommodation"), h("h2", { class: "serif", style: { margin: "2px 0 0", fontSize: "1.6rem" } }, "Where you stay")),
      h("div", { class: "row", style: { gap: "8px" } },
        h("button", { class: "btn small glass", type: "button", onclick: () => hotelSheet(trip, null, draw) }, ic("plus", 15), "By hand"),
        uploadButton(trip, "hotels", "Upload PDF"))));
    if (!trip.hotels.length) body.appendChild(h("div", { class: "glass card empty" }, ic("hotel", 34), h("p", null, "No hotels yet. Forgot to upload them? Add the booking PDFs and I will read the dates and addresses."),
      h("div", { class: "row", style: { justifyContent: "center" } }, uploadButton(trip, "hotels", "Upload hotel PDF", { cls: "btn gold" }))));
    trip.hotels.slice().sort((a, b) => (a.checkIn || "").localeCompare(b.checkIn || "")).forEach(hotel => {
      const nights = hotel.checkIn && hotel.checkOut ? daysBetween(hotel.checkIn, hotel.checkOut) : null;
      const q = (hotel.name + " " + (hotel.address || "")).trim();
      const mapBox = h("div");
      body.appendChild(h("article", { class: "glass card stay" },
        h("div", { class: "head" }, h("div", { class: "grow" }, h("span", { class: "eyebrow" }, "Stay"), h("h3", { class: "serif" }, hotel.name || "Hotel")),
          nights ? h("div", { class: "nights" }, h("b", null, String(nights)), h("small", null, nights === 1 ? "night" : "nights")) : null),
        h("div", { class: "bodyin" },
          h("div", { class: "dates" },
            h("div", { class: "d" }, h("small", null, "Check-in"), h("b", null, hotel.checkIn ? fmtDate(hotel.checkIn) : "?")), h("span", { class: "mid" }, ic("arrowR", 18)),
            h("div", { class: "d r" }, h("small", null, "Check-out"), h("b", null, hotel.checkOut ? fmtDate(hotel.checkOut) : "?"))),
          hotel.address ? h("div", { class: "kv" }, ic("pin", 16), hotel.address) : null,
          hotel.confirmation ? h("div", { class: "kv" }, ic("file", 16), h("span", null, "Confirmation ", h("b", null, hotel.confirmation))) : null,
          hotel.phone ? h("div", { class: "kv" }, ic("link", 16), h("a", { href: "tel:" + hotel.phone.replace(/[^\d+]/g, "") }, hotel.phone)) : null,
          hotel.notes ? h("div", { class: "kv muted" }, ic("clock", 16), hotel.notes) : null,
          h("div", { class: "row", style: { marginTop: "12px", gap: "8px" } },
            h("a", { class: "btn small gold", href: maps.dirUrl(q), target: "_blank", rel: "noopener" }, ic("nav", 15), "Directions"),
            h("a", { class: "btn small glass", href: maps.placeUrl(q), target: "_blank", rel: "noopener" }, ic("map", 15), "Maps"),
            h("button", { class: "btn small glass", type: "button", onclick: () => { if (mapBox.dataset.on) { mapBox.innerHTML = ""; delete mapBox.dataset.on; } else { mapBox.dataset.on = 1; mapBox.appendChild(h("div", { class: "map-wrap" }, h("iframe", { src: maps.placeEmbedSrc(q), loading: "lazy", title: "Map of " + hotel.name, allowfullscreen: true }))); } } }, "Preview"),
            h("button", { class: "btn small glass", type: "button", onclick: () => hotelSheet(trip, hotel, draw) }, ic("edit", 15), "Edit"),
            h("button", { class: "btn small glass", type: "button", "aria-label": "Delete hotel", onclick: () => confirmSheet("Delete this hotel?", hotel.name, "Delete", () => { trip.hotels = trip.hotels.filter(x => x.id !== hotel.id); store.save(); draw(); }) }, ic("trash", 15))),
          mapBox)));
    });
    if (trip.hotels.length) body.appendChild(h("p", { class: "muted", style: { textAlign: "center" } }, "Details read from PDFs are a best guess. Tap Edit to correct anything."));
  }
  draw();
  return view;
}
function hotelSheet(trip, hotel, redraw) {
  const isNew = !hotel;
  hotel = hotel || { id: uid("h"), name: "", address: "", checkIn: "", checkOut: "", confirmation: "", phone: "", notes: "" };
  const f = {};
  const field = (key, label, type = "text") => { f[key] = h("input", { type, value: hotel[key] || "" }); return h("div", null, h("label", { class: "field" }, label), f[key]); };
  openSheet(isNew ? "Add a hotel" : "Edit hotel", h("div", null, field("name", "Hotel name"), field("address", "Address"), field("checkIn", "Check-in", "date"), field("checkOut", "Check-out", "date"), field("confirmation", "Confirmation number"), field("phone", "Phone"), field("notes", "Notes")), [
    { label: "Cancel", cls: "glass" },
    { label: "Save", cls: "gold", onclick: () => {
      Object.keys(f).forEach(k => (hotel[k] = f[k].value.trim()));
      if (!hotel.name) { toast("Please enter a name."); return false; }
      if (isNew) trip.hotels.push(hotel);
      store.save(); redraw();
    } }], { eyebrow: "Accommodation" });
}

/* =====================================================================
   FLIGHTS
   ===================================================================== */
export function flightsView(route) {
  const trip = store.getTrip(route.id);
  if (!trip) return notFound();
  const body = h("div");
  const view = tripShell(trip, "flights", body);

  function draw() {
    body.innerHTML = "";
    body.appendChild(h("div", { class: "row between", style: { margin: "2px 2px 6px" } },
      h("div", null, h("span", { class: "eyebrow" }, "Boarding passes"), h("h2", { class: "serif", style: { margin: "2px 0 0", fontSize: "1.6rem" } }, "Your flights")),
      h("div", { class: "row", style: { gap: "8px" } },
        h("button", { class: "btn small glass", type: "button", onclick: () => flightSheet(trip, null, draw) }, ic("plus", 15), "By hand"),
        uploadButton(trip, "flights", "Upload PDF"))));
    if (!trip.flights.length) body.appendChild(h("div", { class: "glass card empty" }, ic("plane", 34), h("p", null, "No flights yet. Forgot to upload them? Add the ticket PDF and I will read the flight numbers and times."),
      h("div", { class: "row", style: { justifyContent: "center" } }, uploadButton(trip, "flights", "Upload flight PDF", { cls: "btn gold" }))));
    trip.flights.slice().sort((a, b) => ((a.date || "") + (a.depart || "")).localeCompare((b.date || "") + (b.depart || ""))).forEach(fl => {
      body.appendChild(h("div", { class: "pass" },
        h("div", { class: "main" },
          h("div", { class: "muted" }, fl.date ? fmtLong(fl.date) : "Date not set"),
          h("div", { class: "route" }, h("span", null, fl.from || "???"), h("span", { class: "arrow" }, ic("plane", 18)), h("span", null, fl.to || "???")),
          h("div", { class: "meta-line" },
            fl.depart ? h("span", { class: "pill gold" }, "Departs " + fl.depart) : null, fl.arrive ? h("span", { class: "pill" }, "Arrives " + fl.arrive) : null,
            fl.booking ? h("span", { class: "pill" }, "Ref " + fl.booking) : null),
          fl.notes ? h("p", { class: "muted" }, fl.notes) : null,
          h("div", { class: "row", style: { gap: "8px" } },
            fl.from ? h("a", { class: "btn small glass", href: maps.placeUrl(fl.from + " airport"), target: "_blank", rel: "noopener" }, ic("pin", 14), "From") : null,
            fl.to ? h("a", { class: "btn small glass", href: maps.placeUrl(fl.to + " airport"), target: "_blank", rel: "noopener" }, ic("pin", 14), "To") : null,
            h("button", { class: "btn small glass", type: "button", onclick: () => flightSheet(trip, fl, draw) }, ic("edit", 14)),
            h("button", { class: "btn small glass", type: "button", "aria-label": "Delete flight", onclick: () => confirmSheet("Delete this flight?", fl.number, "Delete", () => { trip.flights = trip.flights.filter(x => x.id !== fl.id); store.save(); draw(); }) }, ic("trash", 14)))),
        h("div", { class: "stub" }, ic("plane", 22), h("b", null, fl.number || "Flight"), h("span", { class: "bars" }))));
    });
    if (trip.flights.length) body.appendChild(h("p", { class: "muted", style: { textAlign: "center" } }, "Flight details read from PDFs are a best guess. Tap the pencil to correct anything."));
  }
  draw();
  return view;
}
function flightSheet(trip, fl, redraw) {
  const isNew = !fl;
  fl = fl || { id: uid("f"), number: "", date: "", from: "", to: "", depart: "", arrive: "", booking: "", notes: "" };
  const f = {};
  const field = (key, label, type = "text", ph = "") => { f[key] = h("input", { type, value: fl[key] || "", placeholder: ph }); return h("div", null, h("label", { class: "field" }, label), f[key]); };
  openSheet(isNew ? "Add a flight" : "Edit flight", h("div", null, field("number", "Flight number", "text", "EK 926"), field("date", "Date", "date"), field("from", "From (airport code)", "text", "CAI"), field("to", "To (airport code)", "text", "DXB"), field("depart", "Departure time", "time"), field("arrive", "Arrival time", "time"), field("booking", "Booking reference"), field("notes", "Notes")), [
    { label: "Cancel", cls: "glass" },
    { label: "Save", cls: "gold", onclick: () => {
      Object.keys(f).forEach(k => (fl[k] = f[k].value.trim()));
      fl.from = fl.from.toUpperCase(); fl.to = fl.to.toUpperCase();
      if (!fl.number) { toast("Please enter the flight number."); return false; }
      if (isNew) trip.flights.push(fl);
      store.save(); redraw();
    } }], { eyebrow: "Boarding pass" });
}

/* =====================================================================
   SETTINGS
   ===================================================================== */
export function settingsView(route) {
  const trip = store.getTrip(route.id);
  if (!trip) return notFound();
  const g = store.settings();
  const t = trip.settings;
  const body = h("div");

  const name = h("input", { type: "text", value: trip.name });
  name.addEventListener("change", () => { trip.name = name.value.trim() || trip.name; store.save(); toast("Name saved"); });
  body.appendChild(h("div", { class: "glass card" }, h("span", { class: "eyebrow" }, "Trip"), h("h3", { style: { marginTop: "4px" } }, "Details"), h("label", { class: "field" }, "Trip name"), name,
    h("p", { class: "muted" }, `${trip.days.length} days \u00B7 ${fmtShort(trip.days[0]?.date)} to ${fmtShort(trip.days[trip.days.length - 1]?.date)}`),
    h("div", { class: "row", style: { gap: "8px" } }, h("button", { class: "btn small gold", type: "button", onclick: () => tripLinkSheet(trip) }, ic("link", 15), "Share this trip"), h("button", { class: "btn small glass", type: "button", onclick: () => docsSheet(trip) }, ic("filePlus", 15), "Add or update documents"))));

  /* cover picture */
  const picker = h("div", { class: "coverpick", role: "radiogroup", "aria-label": "Cover picture" });
  store.COVERS.forEach(c => picker.appendChild(h("button", { type: "button", role: "radio", "aria-checked": store.coverKey(trip) === c.id, "aria-label": c.label, class: store.coverKey(trip) === c.id ? "on" : "", style: { backgroundImage: `url("${store.coverUrl(c.id)}")` },
    onclick: () => { trip.cover = c.id; store.save(); window.dispatchEvent(new CustomEvent("trip-refresh")); } }, h("span", null, c.label))));
  body.appendChild(h("div", { class: "glass card" }, h("span", { class: "eyebrow" }, "Look"), h("h3", { style: { marginTop: "4px" } }, "Cover picture"), picker));

  /* sharing */
  body.appendChild(shareCard());

  /* time zone for the alerts */
  const tzSel = h("select", { "aria-label": "Alert time zone" }, h("option", { value: "auto" }, "Follow the city in my itinerary"), COMMON_TZ.map(z => h("option", { value: z }, z.replace("_", " "))));
  tzSel.value = (t.tz && t.tz !== "auto") ? t.tz : "auto";
  tzSel.addEventListener("change", () => { t.tz = tzSel.value; store.applyTz(trip); t.scheduled = {}; store.save(); toast("Time zone saved. Sync alerts again to update the schedule."); });

  const time = h("input", { type: "time", value: t.notifyTime });
  time.addEventListener("change", () => { t.notifyTime = time.value || "07:30"; t.scheduled = {}; store.save(); toast("Alert time saved. Sync again to update the schedule."); });
  const urls = notify.topicUrls(trip);
  const status = h("p", { class: "muted" });
  const run = (label, fn) => async () => { status.textContent = label + "\u2026"; try { const r = await fn(); status.textContent = r || "Done."; } catch (e) { status.textContent = "Problem: " + e.message; } };
  body.appendChild(h("div", { class: "glass card" },
    h("span", { class: "eyebrow" }, "Alerts"), h("h3", { style: { marginTop: "4px" } }, "Morning alerts on your phone"),
    h("p", { class: "muted" }, "Each morning you get a notification with a link to that day's plan, sent through the free ntfy service."),
    h("ol", null, h("li", null, "Install the free ", h("b", null, "ntfy"), " app (App Store or Google Play)."), h("li", null, "In ntfy tap + and subscribe to this topic: ", h("kbd", null, t.topic)), h("li", null, "Tap Send test to check it works."), h("li", null, "Choose how alerts are sent (below).")),
    h("label", { class: "field" }, "Send alerts at (local time)"), time,
    h("label", { class: "field" }, "Time zone"), tzSel,
    h("div", { class: "row", style: { marginTop: "12px", gap: "8px" } },
      h("a", { class: "btn small glass", href: urls.app }, "Open ntfy app"),
      h("a", { class: "btn small glass", href: urls.web, target: "_blank", rel: "noopener" }, "ntfy web"),
      h("button", { class: "btn small glass", type: "button", onclick: () => { navigator.clipboard?.writeText(t.topic); toast("Topic copied"); } }, "Copy topic"),
      h("button", { class: "btn small gold", type: "button", onclick: run("Sending test", async () => { await notify.sendTest(trip); return "Test sent. Check your phone."; }) }, ic("bell", 15), "Send test")),
    h("hr", { class: "soft" }),
    h("span", { class: "eyebrow" }, "Option A \u00B7 best"), h("p", { style: { margin: "4px 0" } }, "GitHub schedule: works with the app closed."),
    h("p", { class: "muted" }, "A scheduled GitHub Action sends the alerts. This saves your plan's alerts file into your repository (needs the token below)."),
    h("label", { class: "pickrow" }, h("input", { type: "checkbox", checked: !!t.includeNames, onchange: e => { t.includeNames = e.target.checked; store.save(); } }), h("span", null, "Include place names in the alerts file")),
    h("p", { class: "muted" }, "Leave this off if your repository is public: anyone could read the file. Off means the alert only says \"Day 3: Sat 19 Dec, tap to open today's plan\"."),
    h("div", { class: "row", style: { gap: "8px" } },
      h("button", { class: "btn small green", type: "button", onclick: run("Saving to GitHub", async () => { await notify.syncToGithub(trip); return "Saved. The Action will send alerts at your chosen time each day."; }) }, "Sync alerts to GitHub"),
      h("button", { class: "btn small glass", type: "button", onclick: () => download(`${trip.id}.json`, notify.alertsJson(trip), "application/json") }, "Download file")),
    h("hr", { class: "soft" }),
    h("span", { class: "eyebrow" }, "Option B"), h("p", { style: { margin: "4px 0" } }, "Queue from this phone (next 3 days)."),
    h("p", { class: "muted" }, "ntfy can hold messages for up to 3 days. Open the app every few days and tap this. Do not combine A and B or you will get two alerts."),
    h("button", { class: "btn small glass", type: "button", onclick: run("Scheduling", async () => { const n = await notify.scheduleUpcoming(trip); return n ? `${n} alert(s) queued.` : "Nothing new to queue in the next 3 days."; }) }, "Queue next 3 days"),
    h("hr", { class: "soft" }),
    h("span", { class: "eyebrow" }, "Option C"), h("p", { style: { margin: "4px 0" } }, "Calendar reminders."),
    h("div", { class: "row", style: { gap: "8px" } },
      h("button", { class: "btn small glass", type: "button", onclick: () => download(`${trip.name.replace(/[^\w]+/g, "_")}_reminders.ics`, notify.buildICS(trip), "text/calendar") }, "Download calendar (.ics)"),
      h("button", { class: "btn small glass", type: "button", onclick: async () => { if (!("Notification" in window)) return toast("This browser has no notifications."); const r = await Notification.requestPermission(); toast("Browser notifications: " + r); } }, "Allow browser notices")),
    status));

  const tok = h("input", { type: "password", value: g.ghToken || "", placeholder: "github_pat_\u2026", autocomplete: "off" });
  const own = h("input", { type: "text", value: notify.repoInfo().owner || "", placeholder: "your GitHub username" });
  const rep = h("input", { type: "text", value: notify.repoInfo().repo || "", placeholder: "repository name" });
  [[tok, "ghToken"], [own, "ghOwner"], [rep, "ghRepo"]].forEach(([el, k]) => el.addEventListener("change", () => { g[k] = el.value.trim(); store.save(); toast("Saved"); }));
  body.appendChild(h("div", { class: "glass card" }, h("span", { class: "eyebrow" }, "Option A setup"), h("h3", { style: { marginTop: "4px" } }, "GitHub"),
    h("p", { class: "muted" }, "Create a fine-grained token at github.com/settings/tokens with access to only this repository and the permission Contents: Read and write. It is stored only on this phone."),
    h("label", { class: "field" }, "Token"), tok, h("label", { class: "field" }, "Owner"), own, h("label", { class: "field" }, "Repository"), rep));

  const key = h("input", { type: "password", value: g.mapsKey || "", placeholder: "Optional: Google Maps API key", autocomplete: "off" });
  key.addEventListener("change", () => { g.mapsKey = key.value.trim(); store.save(); toast(g.mapsKey ? "Key saved. The route map now shows numbered pins." : "Key removed."); });
  body.appendChild(h("div", { class: "glass card" }, h("span", { class: "eyebrow" }, "Optional"), h("h3", { style: { marginTop: "4px" } }, "Google Maps pins"),
    h("p", { class: "muted" }, "Without a key you still get route links and an embedded preview. With your own key (Maps JavaScript API, Geocoding API and Maps Embed API enabled, restricted to your site address) the day map shows numbered pins."), key));

  body.appendChild(h("div", { class: "glass card" }, h("h3", null, "Danger zone"), trip.viaShare ? h("p", { class: "muted" }, "This trip comes from a shared profile. If you remove it here it comes back the next time the owner updates the plan. Use Disconnect in Share and sync to stop that.") : null,
    h("button", { class: "btn danger", type: "button", onclick: () => confirmSheet("Delete this trip?", "Your progress and notes for \"" + trip.name + "\" will be removed from this device.", "Delete trip", async () => {
      try { await notify.removeFromGithub(trip); } catch (e) { /* ignore */ }
      store.removeTrip(trip.id); go("#/", { replace: true }); toast("Trip deleted");
    }) }, ic("trash", 16), "Delete this trip")));

  return shell({ eyebrow: trip.name, title: "Settings", back: `#/trip/${trip.id}/plan`, home: true, body });
}
