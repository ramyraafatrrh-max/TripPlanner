/* views-trip.js - the trip screens: Plan, Place, Hotels, Flights, Settings */
import { h, fmtDate, fmtLong, fmtShort, daysBetween, todayIn, nowHM, clip, download, uid, shortStopName } from "./util.js";
import * as store from "./store.js";
import * as maps from "./maps.js";
import * as notify from "./notify.js";
import { webInfo, stopLinks, searchTermFor } from "./places.js";
import { extractPages, pagesToText, parseHotel, parseFlights, detectYears } from "./parser.js";
import { shell, toast, openSheet, confirmSheet, backBtn, navigate } from "./ui.js";

/* ---------- shared bits ---------- */
const planUI = {}; // per trip: {dayId, rearrange, sel:Set, map, fromHotel}

function notFound() {
  return shell({ title: "Trip not found", back: "#/", body: h("div", { class: "card empty" }, "This trip is not on this device any more.", h("p", null, h("a", { class: "btn", href: "#/" }, "Go to my trips"))) });
}

function smartDayIndex(trip) {
  for (let i = 0; i < trip.days.length; i++) if (todayIn(trip.days[i].tz) === trip.days[i].date) return i;
  const up = trip.days.findIndex(d => d.date > todayIn(d.tz));
  return up >= 0 ? up : Math.max(0, trip.days.length - 1);
}
const isToday = d => todayIn(d.tz) === d.date;

function gearButton(trip) {
  return h("a", { class: "iconbtn", href: `#/trip/${trip.id}/settings`, "aria-label": "Trip settings" }, "\u2699\uFE0F");
}
function tripShell(trip, tab, body) {
  return shell({ title: trip.name, sub: store.progress(trip).done + " of " + store.progress(trip).total + " places visited", back: "#/", actions: gearButton(trip), tripId: trip.id, tab, body });
}

async function loadPdfs(files) {
  const pdfjs = await (await import("./pdfloader.js")).getPdfjs();
  const out = [];
  for (const f of files) {
    const pages = await extractPages(pdfjs, new Uint8Array(await f.arrayBuffer()));
    out.push({ name: f.name, pages, text: pagesToText(pages) });
  }
  return out;
}

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
  let cleanupMap = null;

  const todayDay = trip.days.find(isToday);
  if (todayDay) notify.localMorningNotice(trip, todayDay, trip.days.indexOf(todayDay) + 1);

  function refreshTop() {
    const p = store.progress(trip);
    const sub = view.querySelector(".topbar .sub");
    if (sub) sub.textContent = `${p.done} of ${p.total} places visited`;
  }
  function persist() { store.save(); refreshTop(); }

  function draw() {
    const y = window.scrollY;
    if (cleanupMap) { cleanupMap.then?.(fn => fn && fn()); cleanupMap = null; }
    body.innerHTML = "";
    const day = trip.days.find(d => d.id === ui.dayId);
    if (!trip.days.length) { body.appendChild(h("div", { class: "card empty" }, "This trip has no days yet.")); return; }

    /* day chips */
    const chips = h("div", { class: "daychips", role: "tablist", "aria-label": "Days" });
    trip.days.forEach((d, i) => {
      const dp = store.dayProgress(d);
      const c = h("button", { type: "button", role: "tab", "aria-selected": d.id === ui.dayId, class: "chip" + (d.id === ui.dayId ? " on" : "") + (isToday(d) ? " today" : "") + (dp.total && dp.done === dp.total ? " full" : ""),
        onclick: () => { ui.dayId = d.id; ui.sel.clear(); history.replaceState(null, "", `#/trip/${trip.id}/plan/${d.date}`); draw(); } },
        h("b", null, "Day " + (i + 1)), h("span", null, fmtShort(d.date)), h("small", null, dp.done + "/" + dp.total));
      chips.appendChild(c);
    });
    body.appendChild(chips);
    setTimeout(() => chips.querySelector(".on")?.scrollIntoView({ inline: "center", block: "nearest" }), 0);

    const idx = trip.days.indexOf(day);
    const dp = store.dayProgress(day);
    const cities = store.dayCities(day);
    const hotel = store.hotelForDate(trip, day.date);
    const flights = store.flightsForDate(trip, day.date);

    /* day card */
    const card = h("div", { class: "card daycard" });
    card.appendChild(h("div", { class: "muted" }, `Day ${idx + 1} of ${trip.days.length} \u00B7 ${fmtLong(day.date)}` + (cities.length ? " \u00B7 " + cities.join(" \u2192 ") : "")));
    card.appendChild(h("h2", null, store.dayTitle(day)));
    const meta = h("div", { class: "meta-line" });
    meta.appendChild(h("span", { class: "pill" + (dp.total && dp.done === dp.total ? " green" : "") }, dp.total && dp.done === dp.total ? "\u2705 Day complete" : `${dp.done}/${dp.total} visited`));
    if (isToday(day)) meta.appendChild(h("span", { class: "pill sun" }, "Today \u00B7 " + nowHM(day.tz) + " local"));
    if (hotel) meta.appendChild(h("a", { class: "pill", href: `#/trip/${trip.id}/hotels`, style: { textDecoration: "none" } }, "\uD83C\uDFE8 " + clip(hotel.name, 26)));
    flights.forEach(f => meta.appendChild(h("a", { class: "pill sun", href: `#/trip/${trip.id}/flights`, style: { textDecoration: "none" } }, "\u2708\uFE0F " + f.number + (f.depart ? " " + f.depart : ""))));
    card.appendChild(meta);
    card.appendChild(h("div", { class: "bar" }, h("i", { style: { width: dp.pct + "%" } })));

    if (day.stops.length) {
      const first = day.stops.find(s => !s.visited);
      const row = h("div", { class: "row", style: { marginTop: "10px" } });
      row.appendChild(h("button", { class: "btn small green", type: "button", onclick: () => { ui.map = !ui.map; draw(); } }, ui.map ? "Hide map" : "\uD83D\uDDFA\uFE0F Show route map"));
      const useStops = (dp.done > 0 && dp.done < dp.total) ? day.stops.filter(s => !s.visited) : day.stops;
      const urls = maps.routeUrls(useStops, { origin: ui.fromHotel && hotel ? (hotel.name + " " + hotel.address).trim() : "" });
      urls.forEach(u => row.appendChild(h("a", { class: "btn small", href: u.url, target: "_blank", rel: "noopener" }, "\u2197 " + u.label + (useStops !== day.stops ? " (remaining)" : ""))));
      if (first) row.appendChild(h("a", { class: "btn small sun", href: maps.nextStopUrl(first), target: "_blank", rel: "noopener" }, "\u25B6 Next: " + clip(shortStopName(first.name), 22)));
      card.appendChild(row);
      if (hotel) card.appendChild(h("label", { class: "check", style: { marginTop: "10px" } }, h("input", { type: "checkbox", checked: ui.fromHotel, onchange: e => { ui.fromHotel = e.target.checked; draw(); } }), "Start the route from my hotel"));
    }

    if (ui.map && day.stops.length) {
      const wrap = h("div", { class: "map-wrap" });
      if (store.settings().mapsKey) {
        const g = h("div", { class: "gmap" });
        wrap.appendChild(g);
        cleanupMap = maps.drawDayMap(g, day.stops, s => navigate(`#/trip/${trip.id}/place/${s.id}`)).catch(err => {
          wrap.innerHTML = ""; wrap.appendChild(h("div", { class: "warn" }, "Could not load the Google map (" + err.message + "). Check the API key in Settings, or use the buttons above."));
        });
      } else {
        const src = maps.routeEmbedSrc(day.stops);
        wrap.appendChild(h("iframe", { src, loading: "lazy", title: "Route map", referrerpolicy: "no-referrer-when-downgrade", allowfullscreen: true }));
      }
      card.appendChild(wrap);
      if (!store.settings().mapsKey) card.appendChild(h("p", { class: "muted" }, "Tip: the preview shows the route between your stops. For numbered pins on every stop, add a Google Maps key in Settings."));
    }

    /* rearrange controls */
    const rrow = h("div", { class: "row", style: { marginTop: "10px" } });
    rrow.appendChild(h("button", { class: "btn small " + (ui.rearrange ? "sun" : "ghost"), type: "button", onclick: () => { ui.rearrange = !ui.rearrange; ui.sel.clear(); draw(); } }, ui.rearrange ? "Done rearranging" : "\u270F\uFE0F Rearrange this day"));
    if (ui.rearrange) {
      rrow.appendChild(h("button", { class: "btn small ghost", type: "button", onclick: () => bringSheet(trip, day, draw) }, "\u2B07 Bring stops from other days"));
      rrow.appendChild(h("button", { class: "btn small ghost", type: "button", onclick: () => addStopSheet(trip, day, draw) }, "\uFF0B Add a stop"));
    }
    card.appendChild(rrow);
    body.appendChild(card);

    /* stops */
    if (!day.stops.length) body.appendChild(h("div", { class: "card empty" }, "A free day. Use Rearrange to bring stops from other days, or add your own."));
    day.stops.forEach((s, i) => body.appendChild(stopCard(trip, day, s, i)));

    /* toolbar when rearranging */
    toolbarHost.innerHTML = "";
    if (ui.rearrange) {
      const n = ui.sel.size;
      toolbarHost.appendChild(h("div", { class: "toolbar" }, h("div", { class: "inner" },
        h("span", { style: { color: "#fff", alignSelf: "center", fontSize: ".85rem" } }, n + " selected"),
        h("button", { class: "btn small sun", type: "button", disabled: n === 0, onclick: () => moveSheet(trip, new Set(ui.sel), day, () => { ui.sel.clear(); draw(); }) }, "Move to\u2026"),
        h("button", { class: "btn small red", type: "button", disabled: n === 0, onclick: () => confirmSheet("Delete " + n + " stop(s)?", "They will be removed from the plan.", "Delete", () => { trip.days.forEach(d => (d.stops = d.stops.filter(s => !ui.sel.has(s.id)))); ui.sel.clear(); persist(); draw(); }) }, "Delete"),
        h("button", { class: "btn small ghost", style: { color: "#fff", borderColor: "#fff5" }, type: "button", onclick: () => { ui.rearrange = false; ui.sel.clear(); draw(); } }, "Done"))));
    }
    window.scrollTo(0, y);
  }

  function stopCard(trip, day, s, i) {
    const card = h("div", { class: "stop" + (s.visited ? " visited" : ""), "data-id": s.id });
    card.appendChild(h("div", { class: "num" }, String(i + 1)));
    card.appendChild(h("h3", null, s.name));
    if (s.area) card.appendChild(h("div", { class: "area" }, "\uD83D\uDCCD " + s.area));
    if (s.visited && s.visitedAt) card.appendChild(h("div", { class: "when" }, "Visited " + new Date(s.visitedAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })));
    const snippet = s.activity || s.transit || s.notes;
    if (snippet) card.appendChild(h("p", { class: "snippet" }, snippet));
    if (!ui.rearrange) {
      card.appendChild(h("label", { class: "check visit" }, h("input", { type: "checkbox", checked: s.visited, "aria-label": "Visited: " + s.name,
        onchange: e => { s.visited = e.target.checked; s.visitedAt = s.visited ? Date.now() : null; persist(); draw(); } }), "Visited"));
      card.appendChild(h("div", { class: "acts" },
        h("a", { class: "btn small", href: `#/trip/${trip.id}/place/${s.id}` }, "Details & info"),
        h("a", { class: "btn small ghost", href: maps.dirUrl(s.query || s.name), target: "_blank", rel: "noopener" }, "\uD83E\uDDED Directions"),
        h("a", { class: "btn small ghost", href: maps.placeUrl(s.query || s.name), target: "_blank", rel: "noopener" }, "\uD83D\uDDFA\uFE0F Map")));
    } else {
      card.appendChild(h("label", { class: "check sel visit" }, h("input", { type: "checkbox", checked: ui.sel.has(s.id), "aria-label": "Select " + s.name,
        onchange: e => { e.target.checked ? ui.sel.add(s.id) : ui.sel.delete(s.id); draw(); } }), "Select"));
      const di = trip.days.indexOf(day);
      const mv = (delta) => { const j = i + delta; if (j < 0 || j >= day.stops.length) return; [day.stops[i], day.stops[j]] = [day.stops[j], day.stops[i]]; persist(); draw(); };
      const toDay = (delta) => { const t = trip.days[di + delta]; if (!t) return; day.stops.splice(i, 1); t.stops.push(s); persist(); toast(`Moved to ${fmtDate(t.date)}`); draw(); };
      card.appendChild(h("div", { class: "reorder" },
        h("button", { class: "btn small ghost", type: "button", disabled: i === 0, "aria-label": "Move up", onclick: () => mv(-1) }, "\u25B2"),
        h("button", { class: "btn small ghost", type: "button", disabled: i === day.stops.length - 1, "aria-label": "Move down", onclick: () => mv(1) }, "\u25BC"),
        h("button", { class: "btn small ghost", type: "button", disabled: di === 0, onclick: () => toDay(-1) }, "\u25C0 Day"),
        h("button", { class: "btn small ghost", type: "button", disabled: di === trip.days.length - 1, onclick: () => toDay(1) }, "Day \u25B6")));
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
    t.stops.filter(s => !ids.has(s.id)).forEach((s, i) => posSel.appendChild(h("option", { value: s.id }, `After: ${clip(shortStopName(s.name), 38)}`)));
  };
  daySel.addEventListener("change", fillPos); fillPos();
  const content = h("div", null, h("label", { class: "field" }, "Move " + ids.size + " stop(s) to"), daySel, h("label", { class: "field" }, "Position"), posSel);
  openSheet("Move stops", content, [
    { label: "Cancel", cls: "ghost" },
    { label: "Move", cls: "sun", onclick: () => {
      const moving = [];
      trip.days.forEach(d => (d.stops = d.stops.filter(s => { if (ids.has(s.id)) { moving.push(s); return false; } return true; })));
      const t = trip.days.find(d => d.id === daySel.value);
      let at = t.stops.length;
      if (posSel.value === "start") at = 0;
      else if (posSel.value !== "end") at = t.stops.findIndex(s => s.id === posSel.value) + 1;
      t.stops.splice(at, 0, ...moving);
      store.save(); toast(`Moved ${moving.length} stop(s) to ${fmtDate(t.date)}`); done();
    } }
  ]);
}

function bringSheet(trip, day, redraw) {
  const picked = new Set();
  const list = h("div");
  trip.days.forEach((d, i) => {
    if (d.id === day.id || !d.stops.length) return;
    list.appendChild(h("h4", { style: { margin: "12px 0 4px", color: "var(--navy2)" } }, `Day ${i + 1} \u00B7 ${fmtDate(d.date)} ${d.date < day.date ? "(earlier)" : "(later)"}`));
    d.stops.forEach(s => list.appendChild(h("label", { class: "check sel", style: { display: "flex", margin: "4px 0" } },
      h("input", { type: "checkbox", onchange: e => (e.target.checked ? picked.add(s.id) : picked.delete(s.id)) }),
      h("span", null, clip(shortStopName(s.name), 46) + (s.visited ? "  \u2713 visited" : "")))));
  });
  const copyBox = h("input", { type: "checkbox", id: "cp" });
  openSheet("Bring stops into " + fmtDate(day.date),
    h("div", null, h("p", { class: "muted" }, "Pick stops from earlier or later days. They are moved here (unless you choose copy)."), list,
      h("label", { class: "check", style: { marginTop: "10px" } }, copyBox, "Copy instead of move")), [
      { label: "Cancel", cls: "ghost" },
      { label: "Add to this day", cls: "sun", onclick: () => {
        if (!picked.size) { toast("Tick at least one stop."); return false; }
        const moved = [];
        trip.days.forEach(d => {
          if (d.id === day.id) return;
          if (copyBox.checked) d.stops.forEach(s => { if (picked.has(s.id)) moved.push(Object.assign({}, s, { id: uid("s"), visited: false, visitedAt: null })); });
          else d.stops = d.stops.filter(s => { if (picked.has(s.id)) { moved.push(s); return false; } return true; });
        });
        day.stops.push(...moved);
        store.save(); toast(`Added ${moved.length} stop(s)`); redraw();
      } }]);
}

function addStopSheet(trip, day, redraw) {
  const name = h("input", { type: "text", placeholder: "e.g. Ichiran Ramen Shibuya" });
  const query = h("input", { type: "text", placeholder: "Name or address to find on Google Maps (optional)" });
  const note = h("textarea", { placeholder: "Notes (optional)" });
  openSheet("Add a stop", h("div", null, h("label", { class: "field" }, "Place name"), name, h("label", { class: "field" }, "Google Maps search"), query, h("label", { class: "field" }, "Notes"), note), [
    { label: "Cancel", cls: "ghost" },
    { label: "Add", cls: "sun", onclick: () => {
      if (!name.value.trim()) { toast("Give the stop a name."); return false; }
      day.stops.push({ id: uid("s"), name: name.value.trim(), area: "", query: (query.value || name.value).trim(), transit: "", activity: note.value.trim(), baby: "", eats: "", city: day.city, label: "", visited: false, visitedAt: null, notes: "", searchTerm: "" });
      store.save(); redraw();
    } }]);
}

/* =====================================================================
   PLACE DETAIL
   ===================================================================== */
export function placeView(route) {
  const trip = store.getTrip(route.id);
  const found = trip && store.findStop(trip, route.stopId);
  if (!found) return notFound();
  const { day, stop } = found;
  const parent = `#/trip/${trip.id}/plan/${day.date}`;
  const body = h("div");

  const visited = h("label", { class: "check" }, h("input", { type: "checkbox", checked: stop.visited, onchange: e => { stop.visited = e.target.checked; stop.visitedAt = stop.visited ? Date.now() : null; store.save(); toast(stop.visited ? "Marked as visited \u2705" : "Marked as not visited"); } }), "I have visited this place");
  const head = h("div", { class: "card" },
    h("div", { class: "muted" }, `${fmtLong(day.date)} \u00B7 stop ${day.stops.indexOf(stop) + 1} of ${day.stops.length}`),
    h("h2", null, stop.name), stop.area ? h("div", { class: "muted" }, "\uD83D\uDCCD " + stop.area) : null,
    h("div", { class: "row", style: { marginTop: "10px" } }, visited),
    h("div", { class: "row", style: { marginTop: "10px" } },
      h("a", { class: "btn small", href: maps.placeUrl(stop.query || stop.name), target: "_blank", rel: "noopener" }, "\uD83D\uDDFA\uFE0F Open in Google Maps"),
      h("a", { class: "btn small sun", href: maps.dirUrl(stop.query || stop.name), target: "_blank", rel: "noopener" }, "\uD83E\uDDED Directions from here")),
    h("div", { class: "map-wrap" }, h("iframe", { src: maps.placeEmbedSrc(stop.query || stop.name), loading: "lazy", title: "Map of " + stop.name, referrerpolicy: "no-referrer-when-downgrade", allowfullscreen: true })));
  body.appendChild(head);

  const mine = h("div", { class: "card" }, h("h3", null, "From your itinerary"));
  const block = (t, v) => v ? mine.appendChild(h("div", { class: "info-block" }, h("h4", null, t), h("p", null, v))) : null;
  block("What you will see and do", stop.activity);
  block("How to get there", stop.transit);
  block("Baby and family notes", stop.baby);
  block("Eating and cost", stop.eats);
  if (!stop.activity && !stop.transit && !stop.baby && !stop.eats) mine.appendChild(h("p", { class: "muted" }, "Nothing was written for this stop in your PDF."));
  body.appendChild(mine);

  const web = h("div", { class: "card" }, h("h3", null, "About this place (from the web)"));
  const termInput = h("input", { type: "text", value: searchTermFor(stop), "aria-label": "Search term" });
  const results = h("div");
  const load = async () => {
    stop.searchTerm = termInput.value.trim(); store.save();
    results.innerHTML = ""; results.appendChild(h("p", { class: "muted" }, h("span", { class: "spinner" }), "Looking this place up\u2026"));
    try {
      const info = await webInfo(stop.searchTerm);
      results.innerHTML = "";
      const good = info.filter(i => !i.error);
      if (!good.length) results.appendChild(h("div", { class: "warn" }, info.some(i => i.error) ? "Could not reach Wikipedia/Wikivoyage (are you offline?)." : "No article found for \"" + stop.searchTerm + "\". Try a simpler name above (e.g. just the landmark) and search again."));
      good.forEach(i => results.appendChild(h("div", { class: "webinfo" },
        i.image ? h("img", { src: i.image, alt: i.title, loading: "lazy" }) : null,
        h("b", null, i.title + " \u00B7 " + i.source), h("p", { style: { margin: "4px 0" } }, i.extract),
        i.url ? h("a", { href: i.url, target: "_blank", rel: "noopener" }, "Read more on " + i.source) : null)));
    } catch (e) { results.innerHTML = ""; results.appendChild(h("div", { class: "warn" }, "Lookup failed: " + e.message)); }
  };
  web.appendChild(h("div", { class: "row" }, h("div", { class: "grow" }, termInput), h("button", { class: "btn small", type: "button", onclick: load }, "Search")));
  web.appendChild(results);
  web.appendChild(h("p", { class: "muted", style: { marginTop: "8px" } }, "Summaries come from Wikipedia and Wikivoyage. TripAdvisor and the other travel sites do not allow apps to read their pages, so they open in a new tab:"));
  web.appendChild(h("div", { class: "linkgrid" }, stopLinks(stop).map(l => h("a", { class: "btn small ghost", href: l.url, target: "_blank", rel: "noopener" }, l.label))));
  body.appendChild(web);
  load();

  const notes = h("textarea", { placeholder: "Your own notes, booking codes, reminders\u2026" });
  notes.value = stop.notes || "";
  notes.addEventListener("input", () => { stop.notes = notes.value; store.save(); });
  body.appendChild(h("div", { class: "card" }, h("h3", null, "My notes"), notes));

  return shell({ title: shortStopName(stop.name), sub: fmtDate(day.date), back: parent, tripId: trip.id, tab: "plan", body });
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
    body.appendChild(h("div", { class: "row between", style: { margin: "4px 2px" } },
      h("h2", { style: { color: "#fff", margin: 0, textShadow: "0 2px 8px #0008" } }, "Where you stay"),
      h("div", { class: "row" },
        h("button", { class: "btn small sun", type: "button", onclick: () => hotelSheet(trip, null, draw) }, "\uFF0B Add"),
        pdfAdder("From PDF", async files => {
          const docs = await loadPdfs(files);
          docs.forEach(d => trip.hotels.push(Object.assign({ id: uid("h") }, parseHotel(d.text, d.name, trip.year))));
          store.save(); toast(`Added ${docs.length} booking(s). Please check the details.`); draw();
        }))));
    if (!trip.hotels.length) body.appendChild(h("div", { class: "card empty" }, "No hotels yet. Add a booking PDF or enter one by hand."));
    trip.hotels.slice().sort((a, b) => (a.checkIn || "").localeCompare(b.checkIn || "")).forEach(hotel => {
      const nights = hotel.checkIn && hotel.checkOut ? daysBetween(hotel.checkIn, hotel.checkOut) : null;
      const q = (hotel.name + " " + (hotel.address || "")).trim();
      const mapBox = h("div");
      const card = h("div", { class: "card hotel" },
        h("div", { class: "photo" }),
        h("h3", { style: { marginTop: "14px" } }, hotel.name || "Hotel"),
        h("div", { class: "meta-line" },
          hotel.checkIn ? h("span", { class: "pill" }, "In " + fmtDate(hotel.checkIn)) : null,
          hotel.checkOut ? h("span", { class: "pill" }, "Out " + fmtDate(hotel.checkOut)) : null,
          nights ? h("span", { class: "pill green" }, nights + " night" + (nights === 1 ? "" : "s")) : null),
        hotel.address ? h("p", null, "\uD83D\uDCCD " + hotel.address) : null,
        hotel.confirmation ? h("p", null, "\uD83C\uDFAB Confirmation: ", h("b", null, hotel.confirmation)) : null,
        hotel.phone ? h("p", null, "\u260E\uFE0F ", h("a", { href: "tel:" + hotel.phone.replace(/[^\d+]/g, "") }, hotel.phone)) : null,
        hotel.notes ? h("p", { class: "muted" }, hotel.notes) : null,
        h("div", { class: "row" },
          h("a", { class: "btn small", href: maps.placeUrl(q), target: "_blank", rel: "noopener" }, "\uD83D\uDDFA\uFE0F Google Maps"),
          h("a", { class: "btn small sun", href: maps.dirUrl(q), target: "_blank", rel: "noopener" }, "\uD83E\uDDED Directions"),
          h("button", { class: "btn small ghost", type: "button", onclick: () => { mapBox.innerHTML = ""; if (!mapBox.dataset.on) { mapBox.dataset.on = 1; mapBox.appendChild(h("div", { class: "map-wrap" }, h("iframe", { src: maps.placeEmbedSrc(q), loading: "lazy", title: "Map of " + hotel.name, allowfullscreen: true }))); } else delete mapBox.dataset.on; } }, "Map preview"),
          h("button", { class: "btn small ghost", type: "button", onclick: () => hotelSheet(trip, hotel, draw) }, "Edit"),
          h("button", { class: "btn small ghost", type: "button", onclick: () => confirmSheet("Delete this hotel?", hotel.name, "Delete", () => { trip.hotels = trip.hotels.filter(x => x.id !== hotel.id); store.save(); draw(); }) }, "Delete")),
        mapBox);
      body.appendChild(card);
    });
    body.appendChild(h("p", { class: "muted", style: { color: "#fff", textAlign: "center" } }, "Details read from PDFs can be wrong, so tap Edit to correct anything."));
  }
  draw();
  return view;
}

function pdfAdder(label, onFiles) {
  const input = h("input", { type: "file", accept: "application/pdf,.pdf", multiple: true, style: { display: "none" },
    onchange: async e => { const files = Array.from(e.target.files || []); e.target.value = ""; if (!files.length) return; toast("Reading PDF\u2026"); try { await onFiles(files); } catch (err) { toast("Could not read that PDF: " + err.message); } } });
  return h("label", { class: "btn small ghost", style: { background: "#fff" } }, "\uD83D\uDCC4 " + label, input);
}

function hotelSheet(trip, hotel, redraw) {
  const isNew = !hotel;
  hotel = hotel || { id: uid("h"), name: "", address: "", checkIn: "", checkOut: "", confirmation: "", phone: "", notes: "" };
  const f = {};
  const field = (key, label, type = "text") => { f[key] = h("input", { type, value: hotel[key] || "" }); return h("div", null, h("label", { class: "field" }, label), f[key]); };
  openSheet(isNew ? "Add a hotel" : "Edit hotel", h("div", null,
    field("name", "Hotel name"), field("address", "Address"), field("checkIn", "Check-in", "date"), field("checkOut", "Check-out", "date"),
    field("confirmation", "Confirmation number"), field("phone", "Phone"), field("notes", "Notes")), [
    { label: "Cancel", cls: "ghost" },
    { label: "Save", cls: "sun", onclick: () => {
      Object.keys(f).forEach(k => (hotel[k] = f[k].value.trim()));
      if (!hotel.name) { toast("Please enter a name."); return false; }
      if (isNew) trip.hotels.push(hotel);
      store.save(); redraw();
    } }]);
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
    body.appendChild(h("div", { class: "row between", style: { margin: "4px 2px" } },
      h("h2", { style: { color: "#fff", margin: 0, textShadow: "0 2px 8px #0008" } }, "Your flights"),
      h("div", { class: "row" },
        h("button", { class: "btn small sun", type: "button", onclick: () => flightSheet(trip, null, draw) }, "\uFF0B Add"),
        pdfAdder("From PDF", async files => {
          const docs = await loadPdfs(files);
          let n = 0;
          docs.forEach(d => parseFlights(d.text, d.name, trip.year).forEach(fl => { trip.flights.push(Object.assign({ id: uid("f") }, fl)); n++; }));
          store.save(); toast(n ? `Found ${n} flight(s). Please check the details.` : "No flights recognised. Add them by hand with \uFF0B."); draw();
        }))));
    if (!trip.flights.length) body.appendChild(h("div", { class: "card empty" }, "No flights yet. Add a ticket PDF or enter flights by hand."));
    trip.flights.slice().sort((a, b) => (a.date + a.depart).localeCompare(b.date + b.depart)).forEach(fl => {
      body.appendChild(h("div", { class: "ticket" },
        h("div", { class: "main" },
          h("div", { class: "muted" }, fl.date ? fmtLong(fl.date) : "Date not set"),
          h("div", { class: "route" }, h("span", null, fl.from || "???"), h("span", { class: "arrow" }), h("span", null, fl.to || "???")),
          h("div", { class: "meta-line" },
            fl.depart ? h("span", { class: "pill" }, "Departs " + fl.depart) : null,
            fl.arrive ? h("span", { class: "pill" }, "Arrives " + fl.arrive) : null,
            fl.booking ? h("span", { class: "pill sun" }, "Ref " + fl.booking) : null),
          fl.notes ? h("p", { class: "muted" }, fl.notes) : null,
          h("div", { class: "row" },
            fl.from ? h("a", { class: "btn small ghost", href: maps.placeUrl(fl.from + " airport"), target: "_blank", rel: "noopener" }, "Departure airport") : null,
            fl.to ? h("a", { class: "btn small ghost", href: maps.placeUrl(fl.to + " airport"), target: "_blank", rel: "noopener" }, "Arrival airport") : null,
            h("button", { class: "btn small ghost", type: "button", onclick: () => flightSheet(trip, fl, draw) }, "Edit"),
            h("button", { class: "btn small ghost", type: "button", onclick: () => confirmSheet("Delete this flight?", fl.number, "Delete", () => { trip.flights = trip.flights.filter(x => x.id !== fl.id); store.save(); draw(); }) }, "Delete"))),
        h("div", { class: "stub" }, h("span", { style: { fontSize: "1.6rem" } }, "\u2708\uFE0F"), h("b", null, fl.number || "Flight"), h("small", null, fl.booking ? "Ref " + fl.booking : ""))));
    });
    body.appendChild(h("p", { class: "muted", style: { color: "#fff", textAlign: "center" } }, "Flight details read from PDFs are a best guess, so tap Edit to correct anything."));
  }
  draw();
  return view;
}

function flightSheet(trip, fl, redraw) {
  const isNew = !fl;
  fl = fl || { id: uid("f"), number: "", date: "", from: "", to: "", depart: "", arrive: "", booking: "", notes: "" };
  const f = {};
  const field = (key, label, type = "text", ph = "") => { f[key] = h("input", { type, value: fl[key] || "", placeholder: ph }); return h("div", null, h("label", { class: "field" }, label), f[key]); };
  openSheet(isNew ? "Add a flight" : "Edit flight", h("div", null,
    field("number", "Flight number", "text", "EK 926"), field("date", "Date", "date"), field("from", "From (airport code)", "text", "CAI"), field("to", "To (airport code)", "text", "DXB"),
    field("depart", "Departure time", "time"), field("arrive", "Arrival time", "time"), field("booking", "Booking reference"), field("notes", "Notes")), [
    { label: "Cancel", cls: "ghost" },
    { label: "Save", cls: "sun", onclick: () => {
      Object.keys(f).forEach(k => (fl[k] = f[k].value.trim()));
      fl.from = fl.from.toUpperCase(); fl.to = fl.to.toUpperCase();
      if (!fl.number) { toast("Please enter the flight number."); return false; }
      if (isNew) trip.flights.push(fl);
      store.save(); redraw();
    } }]);
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
  body.appendChild(h("div", { class: "card" }, h("h3", null, "Trip"), h("label", { class: "field" }, "Trip name"), name,
    h("p", { class: "muted" }, `${trip.days.length} days \u00B7 ${fmtShort(trip.days[0]?.date)} to ${fmtShort(trip.days[trip.days.length - 1]?.date)}`)));

  /* alerts */
  const time = h("input", { type: "time", value: t.notifyTime });
  time.addEventListener("change", () => { t.notifyTime = time.value || "07:30"; t.scheduled = {}; store.save(); toast("Alert time saved. Sync again to update the schedule."); });
  const urls = notify.topicUrls(trip);
  const status = h("p", { class: "muted" });
  const run = (label, fn) => async () => { status.textContent = label + "\u2026"; try { const r = await fn(); status.textContent = r || "Done."; } catch (e) { status.textContent = "Problem: " + e.message; } };
  const alerts = h("div", { class: "card" },
    h("h3", null, "\uD83D\uDD14 Morning alerts on your phone"),
    h("p", { class: "muted" }, "Each morning you get a notification with a link to that day's plan. It is sent through the free ntfy service, so you need the ntfy app on your phone."),
    h("ol", { style: { paddingLeft: "20px", margin: "6px 0" } },
      h("li", null, "Install the free ", h("b", null, "ntfy"), " app (App Store or Google Play)."),
      h("li", null, "In ntfy tap + and subscribe to this topic: ", h("kbd", null, t.topic)),
      h("li", null, "Tap Send test below to check it works."),
      h("li", null, "Choose how alerts are sent (below).")),
    h("label", { class: "field" }, "Send alerts at (local time of each day)"), time,
    h("div", { class: "row", style: { marginTop: "10px" } },
      h("a", { class: "btn small ghost", href: urls.app }, "Open in ntfy app"),
      h("a", { class: "btn small ghost", href: urls.web, target: "_blank", rel: "noopener" }, "ntfy web page"),
      h("button", { class: "btn small ghost", type: "button", onclick: () => { navigator.clipboard?.writeText(t.topic); toast("Topic copied"); } }, "Copy topic"),
      h("button", { class: "btn small", type: "button", onclick: run("Sending test", async () => { await notify.sendTest(trip); return "Test sent. Check your phone."; }) }, "Send test")),
    h("h4", { style: { margin: "16px 0 4px", color: "var(--navy2)" } }, "Option A: GitHub schedule (best, works with the app closed)"),
    h("p", { class: "muted" }, "A scheduled GitHub Action sends the alerts. This button saves your plan's alerts file into your repository (needs the token below)."),
    h("label", { class: "check", style: { margin: "6px 0 10px" } }, h("input", { type: "checkbox", checked: !!t.includeNames, onchange: e => { t.includeNames = e.target.checked; store.save(); } }), "Include place names in the alerts file"),
    h("p", { class: "muted" }, "Leave this off if your repository is public: anyone could read the file. Off means the alert only says \"Day 3: Sat 19 Dec, tap to open today's plan\"."),
    h("div", { class: "row" },
      h("button", { class: "btn small green", type: "button", onclick: run("Saving to GitHub", async () => { await notify.syncToGithub(trip); return "Saved. The Action will send alerts at your chosen time each day."; }) }, "Sync alerts to GitHub"),
      h("button", { class: "btn small ghost", type: "button", onclick: () => download(`${trip.id}.json`, notify.alertsJson(trip), "application/json") }, "Download alerts file")),
    h("h4", { style: { margin: "16px 0 4px", color: "var(--navy2)" } }, "Option B: schedule from this phone (next 3 days)"),
    h("p", { class: "muted" }, "ntfy can hold messages for up to 3 days. Open the app every few days and tap this to queue the next ones. Do not use A and B together or you will get two alerts."),
    h("button", { class: "btn small", type: "button", onclick: run("Scheduling", async () => { const n = await notify.scheduleUpcoming(trip); return n ? `${n} alert(s) queued.` : "Nothing new to queue in the next 3 days."; }) }, "Queue next 3 days"),
    h("h4", { style: { margin: "16px 0 4px", color: "var(--navy2)" } }, "Option C: calendar reminders"),
    h("div", { class: "row" },
      h("button", { class: "btn small ghost", type: "button", onclick: () => download(`${trip.name.replace(/[^\w]+/g, "_")}_reminders.ics`, notify.buildICS(trip), "text/calendar") }, "Download calendar (.ics)"),
      h("button", { class: "btn small ghost", type: "button", onclick: async () => { if (!("Notification" in window)) return toast("This browser has no notifications."); const r = await Notification.requestPermission(); toast("Browser notifications: " + r); } }, "Allow browser notices")),
    status);
  body.appendChild(alerts);

  /* github */
  const tok = h("input", { type: "password", value: g.ghToken || "", placeholder: "github_pat_\u2026", autocomplete: "off" });
  const own = h("input", { type: "text", value: notify.repoInfo().owner || "", placeholder: "your GitHub username" });
  const rep = h("input", { type: "text", value: notify.repoInfo().repo || "", placeholder: "repository name" });
  [[tok, "ghToken"], [own, "ghOwner"], [rep, "ghRepo"]].forEach(([el, k]) => el.addEventListener("change", () => { g[k] = el.value.trim(); store.save(); toast("Saved"); }));
  body.appendChild(h("div", { class: "card" }, h("h3", null, "GitHub (for Option A)"),
    h("p", { class: "muted" }, "Create a fine-grained token at github.com/settings/tokens with access to only this repository and the permission Contents: Read and write. It is stored only on this phone."),
    h("label", { class: "field" }, "Token"), tok, h("label", { class: "field" }, "Owner"), own, h("label", { class: "field" }, "Repository"), rep));

  /* google maps key */
  const key = h("input", { type: "password", value: g.mapsKey || "", placeholder: "Optional: Google Maps API key", autocomplete: "off" });
  key.addEventListener("change", () => { g.mapsKey = key.value.trim(); store.save(); toast(g.mapsKey ? "Key saved. The route map now shows numbered pins." : "Key removed."); });
  body.appendChild(h("div", { class: "card" }, h("h3", null, "Google Maps (optional)"),
    h("p", { class: "muted" }, "Without a key you still get route links and an embedded preview. With your own key (Maps JavaScript API, Geocoding API and Maps Embed API enabled, restricted to your site address) the day map shows numbered pins."),
    key));

  body.appendChild(h("div", { class: "card" }, h("h3", null, "Danger zone"),
    h("button", { class: "btn red", type: "button", onclick: () => confirmSheet("Delete this trip?", "Your progress and notes for \"" + trip.name + "\" will be removed from this device.", "Delete trip", async () => {
      try { await notify.removeFromGithub(trip); } catch (e) { /* ignore */ }
      store.removeTrip(trip.id); navigate("#/"); toast("Trip deleted");
    }) }, "Delete this trip")));

  return shell({ title: "Settings", sub: trip.name, back: `#/trip/${trip.id}/plan`, body });
}
