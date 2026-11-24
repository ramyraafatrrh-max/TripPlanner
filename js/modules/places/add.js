/* add.js - "Add places": type a name and/or paste a Google Maps link, pick a day, and the app places it so the day has the
   least travel. Several places can be added at once. */
import { h } from "../../core/dom.js";
import { ic } from "../../core/icons.js";
import * as store from "../../core/store.js";
import { svc } from "../../core/registry.js";
import { openSheet, toast } from "../../core/ui.js";
import { bus } from "../../core/bus.js";
import { fmtDate, fmtKm, hasPt, clip } from "../../core/util.js";
import { locateDay, reorderDay, rankDays, hotelPoint, summary } from "./day.js";
import { geocode } from "./geo.js";

function readEntry(name, link) {
  const maps = svc("maps"); const e = { name: (name || "").trim(), link: (link || "").trim(), lat: NaN, lng: NaN, warn: "", error: "" };
  if (e.link) {
    const p = maps.parseLink(e.link);
    if (!p || !p.ok) e.error = (p && p.error) || "I could not read that link.";
    else { e.link = p.url; e.lat = p.lat; e.lng = p.lng; e.warn = p.warn || ""; if (!e.name && p.name) e.name = p.name; if (p.short && !e.name) e.error = "This is a short link, so please type the place name too."; }
  }
  if (!e.name && !e.error) e.error = "Give the place a name or paste its Google Maps link.";
  return e;
}

export function openAddPlaces(trip, preferDayId) {
  if (!trip.days.length) { toast("This trip has no days yet."); return; }
  const day0 = trip.days.find(d => d.id === preferDayId) || trip.days[0];
  const daySel = h("select", { "aria-label": "Day" }, trip.days.map(d => h("option", { value: d.id, selected: d.id === day0.id }, `${fmtDate(d.date)} \u00B7 ${d.city || store.dayCities(d).join(", ") || "\u2014"} \u00B7 ${d.stops.length} place${d.stops.length === 1 ? "" : "s"}`)));
  const rows = h("div", { class: "addrows" });
  const status = h("div", { class: "muted", "aria-live": "polite" });
  const suggest = h("div");
  const warn = h("div");
  let cancelled = false;

  const addRow = (name = "", link = "") => {
    const n = h("input", { type: "text", placeholder: "Place name, e.g. Tokyo Tower", value: name, "aria-label": "Place name" });
    const l = h("input", { type: "url", inputmode: "url", placeholder: "Google Maps link (optional, tap it later to open the map)", value: link, "aria-label": "Google Maps link" });
    const tip = h("div", { class: "muted small" });
    l.addEventListener("input", () => {
      const p = l.value.trim() ? svc("maps").parseLink(l.value) : null;
      tip.textContent = !p ? "" : !p.ok ? p.error : p.warn ? p.warn : Number.isFinite(p.lat) ? "Location read from the link." : "Link saved.";
      if (p && p.ok && p.name && !n.value.trim()) n.value = p.name;
    });
    const row = h("div", { class: "addrow" }, h("div", { class: "grow" }, n, l, tip),
      h("button", { class: "round small", type: "button", "aria-label": "Remove this place", onclick: () => { row.remove(); if (!rows.children.length) addRow(); } }, ic("x", 16)));
    row._get = () => ({ name: n.value, link: l.value });
    rows.append(row);
  };
  addRow();

  const bulk = h("textarea", { rows: 4, placeholder: "Tokyo Tower | https://maps.app.goo.gl/...\nHamarikyu Gardens\nhttps://www.google.com/maps/place/Ueno+Park/@35.71,139.77,15z" });
  const bulkBox = h("div", { hidden: true }, h("p", { class: "muted" }, "One place per line. A line can be a name, a link, or \u201Cname | link\u201D."), bulk,
    h("button", { class: "btn small glass", type: "button", onclick: () => {
      bulk.value.split("\n").map(x => x.trim()).filter(Boolean).forEach(line => {
        const m = /^(.*?)\s*[|\u2013\u2014]\s*(https?:\/\/\S+)$/.exec(line) || (/^https?:\/\/\S+$/.test(line) ? ["", "", line] : null);
        if (m) addRow(m[1], m[2]); else addRow(line, "");
      });
      const first = rows.firstChild; if (first && first._get && !first._get().name && !first._get().link && rows.children.length > 1) first.remove();
      bulk.value = ""; bulkBox.hidden = true;
    } }, "Use this list"));

  const mode = (id, label, checked, hint) => h("label", { class: "pickrow tall" }, h("input", { type: "radio", name: "mode", value: id, checked }), h("span", null, h("b", null, label), h("small", { class: "muted block" }, hint)));
  const keepPinned = h("input", { type: "checkbox", checked: true }), keepTimed = h("input", { type: "checkbox" });
  const fromHotel = h("input", { type: "checkbox", checked: true });
  const optsBox = h("div", null,
    h("label", { class: "pickrow" }, keepPinned, h("span", null, "Keep pinned stops in place")),
    h("label", { class: "pickrow" }, keepTimed, h("span", null, "Also keep stops that have a set time (like 09:00)")),
    h("label", { class: "pickrow" }, fromHotel, h("span", null, "Start the route from my hotel (when its location is known)")));

  const suggestBtn = h("button", { class: "btn small glass", type: "button", onclick: async () => {
    const entries = [...rows.children].map(r => r._get()).filter(e => e.name.trim() || e.link.trim());
    if (!entries.length) { warn.replaceChildren(h("div", { class: "warnbox" }, "Enter a place first.")); return; }
    warn.replaceChildren(); suggest.replaceChildren(); cancelled = false;
    const e = readEntry(entries[0].name, entries[0].link);
    if (e.error) { warn.replaceChildren(h("div", { class: "warnbox" }, e.error)); return; }
    let p = Number.isFinite(e.lat) ? { lat: e.lat, lng: e.lng } : null;
    status.textContent = "Finding that place\u2026";
    if (!p) { const g = await geocode(`${e.name}${day0.city ? ", " + day0.city : ""}`, hotelPoint(trip, day0)); if (g) p = g; }
    if (!p) { status.textContent = ""; warn.replaceChildren(h("div", { class: "warnbox" }, "I could not find that place on the map. Paste its Google Maps link, or pick the day yourself.")); return; }
    let located = 0;
    for (const d of trip.days) { if (cancelled) break; status.textContent = `Locating ${fmtDate(d.date)}\u2026 (first time only, about a second per place)`; located += (await locateDay(trip, d, { cancelled: () => cancelled })).found; }
    status.textContent = "";
    const ranks = rankDays(trip, p).slice(0, 3);
    if (!ranks.length) { warn.replaceChildren(h("div", { class: "warnbox" }, "No stops have a location yet, so I cannot compare days.")); return; }
    suggest.replaceChildren(h("div", { class: "muted" }, "Best fit, by extra travel:"), h("div", { class: "chipset" }, ranks.map(r => h("button", { type: "button", class: "tag chipbtn", onclick: () => { daySel.value = r.day.id; } }, `${fmtDate(r.day.date)} \u00B7 +${fmtKm(r.added)}`))));
    daySel.value = ranks[0].day.id;
  } }, ic("sparkle", 15), "Suggest the best day");

  const body = h("div", null,
    h("label", { class: "field" }, "Day"), daySel, h("div", { class: "row", style: { margin: "8px 0" } }, suggestBtn), suggest,
    h("label", { class: "field" }, "Places to add"), rows,
    h("div", { class: "row", style: { gap: "8px", marginTop: "8px" } },
      h("button", { class: "btn small glass", type: "button", onclick: () => addRow() }, ic("plus", 15), "Add another place"),
      h("button", { class: "btn small glass", type: "button", onclick: () => { bulkBox.hidden = !bulkBox.hidden; } }, ic("file", 15), "Paste a list")),
    bulkBox,
    h("label", { class: "field" }, "Where should it go?"),
    mode("reorder", "Reorder the whole day for the least travel", true, "Recommended. Moves stops around so the day has the fewest hops."),
    mode("insert", "Keep my order, put it where it adds the least travel", false, "Nothing else moves."),
    mode("end", "Just add it at the end of the day", false, "No reordering."),
    h("details", { class: "opts" }, h("summary", null, "Options"), optsBox), warn, status);

  openSheet("Add places", body, [
    { label: "Cancel", cls: "glass", onclick: () => { cancelled = true; } },
    { label: "Add to the plan", cls: "gold", onclick: async (ev, close) => {
      warn.replaceChildren();
      const raw = [...rows.children].map(r => r._get()).filter(e => e.name.trim() || e.link.trim());
      if (!raw.length) { warn.replaceChildren(h("div", { class: "warnbox" }, "Enter at least one place.")); return false; }
      const entries = raw.map(r => readEntry(r.name, r.link));
      const bad = entries.find(e => e.error);
      if (bad) { warn.replaceChildren(h("div", { class: "warnbox" }, `${clip(bad.name || "A place", 30)}: ${bad.error}`)); return false; }
      const day = trip.days.find(d => d.id === daySel.value);
      const m = body.querySelector("input[name=mode]:checked").value;
      const btn = ev.currentTarget; btn.disabled = true; cancelled = false;
      const newIds = [];
      entries.forEach(e => {
        const s = store.makeStop({ name: e.name, query: e.name, city: day.city || "", mapUrl: e.link, added: true });
        if (Number.isFinite(e.lat)) { s.lat = e.lat; s.lng = e.lng; s.locSrc = "link"; }
        day.stops.push(s); newIds.push(s.id);
      });
      let result = null;
      if (m !== "end") {
        await locateDay(trip, day, { onProgress: (i, n, s) => { status.textContent = `Finding places on the map\u2026 ${i} of ${n}`; } });
        result = reorderDay(trip, day, { fromHotel: fromHotel.checked, keepPinned: keepPinned.checked, keepTimed: keepTimed.checked, newIds, keepOrder: m === "insert" });
      }
      store.save();
      bus.emit("trip-changed", { id: trip.id });
      const n = entries.length;
      toast(result && result.changed ? `Added ${n} place${n > 1 ? "s" : ""} to ${fmtDate(day.date)}. Route ${summary(result)}.` : `Added ${n} place${n > 1 ? "s" : ""} to ${fmtDate(day.date)}.` + (result && result.unlocated ? ` ${result.unlocated} stop(s) have no location yet.` : ""), 5200);
      location.hash = `#/trip/${trip.id}/plan/${day.date}`; bus.emit("route-refresh");
    } }], { eyebrow: "Update the plan" });
}
