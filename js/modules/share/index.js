/* share module: send a trip to another phone as a link (the whole plan travels inside the link: no account, no token),
   import a trip link or a saved trip file. Live progress is a separate module that this sheet only embeds. */
import { h } from "../../core/dom.js";
import { ic } from "../../core/icons.js";
import * as store from "../../core/store.js";
import { svc } from "../../core/registry.js";
import { go } from "../../core/router.js";
import { shell, openSheet, toast } from "../../core/ui.js";
import { bus } from "../../core/bus.js";
import { download, fmtShort, clip, uid, randomTopic } from "../../core/util.js";
import { buildOptions, decode, preview, importTrip, SOFT_LIMIT, LinkError } from "./link.js";

const base = () => location.origin + location.pathname.replace(/index\.html$/, "");
function copyText(t) { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(() => toast("Link copied"), () => toast("Press and hold the link to copy it.")); else toast("Press and hold the link to copy it."); }
async function shareLink(url, title) { if (navigator.share) { try { await navigator.share({ title, text: "My trip plan", url }); return; } catch (e) { if (e && e.name === "AbortError") return; } } copyText(url); }

export function exportFile(onlyId) {
  const list = store.trips().filter(t => !onlyId || t.id === onlyId).map(t => { const c = JSON.parse(JSON.stringify(t)); if (c.settings) { c.settings.scheduled = {}; delete c.settings.topic; } return c; });
  return JSON.stringify({ app: "trip-pilot", v: 1, exported: Date.now(), trips: list }, null, 2);
}
export function importFile(text) {
  let data; try { data = JSON.parse(text); } catch (e) { throw new Error("That file is not a Trip Pilot export."); }
  if (!data || data.app !== "trip-pilot" || !Array.isArray(data.trips)) throw new Error("That file is not a Trip Pilot export.");
  let n = 0; data.trips.forEach(t => { if (!t || !Array.isArray(t.days)) return; if (store.getTrip(t.id)) { t.id = uid("trip"); t.name += " (copy)"; } t.settings = Object.assign({ notifyTime: "07:30", includeNames: false, tz: "auto", scheduled: {} }, t.settings, { topic: randomTopic() }); store.trips().push(store.fixTrip(t)); n++; });
  store.save(); return n;
}

export function shareSheet(trip) {
  const body = h("div"), refs = h("input", { type: "checkbox" }), out = h("div"); let options = [], chosen = "full", token = 0;
  async function build() {
    const my = ++token; out.replaceChildren(h("p", { class: "muted" }, h("span", { class: "spinner" }), "Building the link\u2026"));
    options = await buildOptions(trip, { refs: refs.checked }, base()); if (my !== token) return;
    chosen = (options.find(o => o.length <= SOFT_LIMIT) || options[options.length - 1]).id; paint();
  }
  function paint() {
    const cur = options.find(o => o.id === chosen);
    out.replaceChildren(h("div", { class: "field", style: { margin: "6px 0 4px" } }, "How much detail"),
      ...options.map(o => h("label", { class: "pickrow" }, h("input", { type: "radio", name: "lvl", checked: o.id === chosen, onchange: () => { chosen = o.id; paint(); } }), h("span", null, o.label), h("span", { class: "muted small", style: { flex: "0 0 auto" } }, o.length.toLocaleString() + " characters"))),
      cur.length > SOFT_LIMIT ? h("div", { class: "warnbox" }, "This link is very long. Some chat apps cut long links, so the other phone may say it is incomplete. Try a shorter option, or save the trip as a file.") : null,
      h("div", { class: "linkrow", style: { marginTop: "10px" } }, h("input", { type: "text", value: cur.url, readonly: true, "aria-label": "Trip link", onclick: e => e.target.select() })),
      h("div", { class: "row", style: { marginTop: "10px", gap: "8px" } }, h("button", { class: "btn small gold", type: "button", onclick: () => copyText(cur.url) }, ic("link", 15), "Copy link"), h("button", { class: "btn small glass", type: "button", onclick: () => shareLink(cur.url, trip.name) }, ic("ext", 15), "Share\u2026"), h("button", { class: "btn small glass", type: "button", onclick: () => download(`${trip.name.replace(/[^\w]+/g, "_")}.json`, exportFile(trip.id), "application/json") }, "Save as file")));
  }
  body.append(h("p", { class: "muted" }, "The whole plan is inside this link, so the other phone needs nothing else: no account, no GitHub. Open the link there and tap Add to this phone."));
  if (svc("live")) body.append(h("div", { class: "eyebrow", style: { margin: "14px 0 4px" } }, "Progress"), svc("live").controls(trip, build), h("hr", { class: "soft" }));
  body.append(h("label", { class: "pickrow" }, refs, h("span", null, "Include hotel confirmation numbers, PIN codes and flight booking references")), out,
    h("p", { class: "muted small", style: { marginTop: "12px" } }, "Notes and alert settings are never included. A link is a copy from now: if you change the plan, copy a new link and open it on the other phone and it updates the same trip."));
  refs.addEventListener("change", build); openSheet("Share " + (trip.name.length > 26 ? "this trip" : trip.name), body, [{ label: "Done", cls: "gold" }], { eyebrow: "Share" }); build();
}

function importView({ payload }) {
  const card = h("div", { class: "glass card" }), body = h("div", null, card), home = h("button", { class: "btn gold", type: "button", onclick: () => go("#/", { replace: true }) }, "Go to my trips");
  const note = (m, x) => card.replaceChildren(h("span", { class: "eyebrow" }, "Shared trip"), h("p", null, m), x);
  (async () => {
    card.append(h("p", { class: "muted" }, h("span", { class: "spinner" }), "Opening the trip\u2026"));
    let data; try { data = await decode(payload || ""); } catch (e) { return note(e.message, home); }
    const pv = preview(data), t = data.trip, first = t.days[0] && t.days[0].date, last = t.days.length && t.days[t.days.length - 1].date;
    card.replaceChildren(h("span", { class: "eyebrow" }, pv.exists ? "Update available" : "Shared with you"), h("h2", { class: "serif", style: { marginTop: "4px" } }, clip(t.name, 60)),
      h("div", { class: "meta-line" }, h("span", { class: "pill gold" }, `${fmtShort(first)} \u2013 ${fmtShort(last)}`), h("span", { class: "pill" }, `${pv.days} days`), h("span", { class: "pill" }, `${pv.stops} places`), h("span", { class: "pill" }, ic("hotel", 13), String(pv.hotels)), h("span", { class: "pill" }, ic("plane", 13), String(pv.flights)), pv.live ? h("span", { class: "pill green" }, ic("refresh", 13), "Live progress") : null),
      pv.live ? h("div", { class: "banner" }, ic("refresh", 22), h("div", { class: "grow" }, h("b", null, "This trip shares progress live"), h("span", { class: "muted" }, "Places ticked on other phones appear on yours, and yours appear on theirs."))) : null,
      pv.level && pv.level !== "full" ? h("div", { class: "warnbox" }, "This link has " + (pv.level === "min" ? "names and map places only" : "shortened descriptions") + ". Ask for the full-detail link if you want every note.") : null,
      h("p", { class: "muted" }, pv.exists ? `You already have "${pv.mineName}" on this phone. Updating replaces its plan with this version and keeps your notes and ticks.` : "It will be added to this phone and works offline once it is added."),
      h("div", { class: "row", style: { marginTop: "12px" } }, h("button", { class: "btn gold", type: "button", onclick: () => { try { const r = importTrip(data); toast(r.updated ? "Trip updated" : "Trip added to this phone"); go(`#/trip/${r.trip.id}/plan`, { replace: true }); if (svc("live") && svc("live").isLive(r.trip)) svc("live").sync(r.trip); } catch (e) { toast(e.message, 6000); } } }, ic("check", 16, 2.4), pv.exists ? "Update this trip" : "Add to this phone"), h("button", { class: "btn glass", type: "button", onclick: () => go("#/", { replace: true }) }, "Not now")));
  })();
  return shell({ eyebrow: "Trip Pilot", title: "Shared trip", back: "#/", body });
}
function homeCard() {
  const paste = h("input", { type: "text", placeholder: "Got a trip link? Paste it here", "aria-label": "Paste a trip link" });
  const file = h("input", { type: "file", accept: ".json,application/json", style: { display: "none" }, onchange: async e => { const f = (e.target.files || [])[0]; e.target.value = ""; if (!f) return; try { const n = importFile(await f.text()); toast(`${n} trip(s) imported`); bus.emit("route-refresh"); } catch (err) { toast(err.message, 6000); } } });
  return h("section", { class: "glass card" }, h("span", { class: "eyebrow" }, "Share and sync"), h("h3", { style: { margin: "4px 0 6px" } }, "Send a trip to another phone"),
    h("p", { class: "muted" }, "Open a trip and tap the link button at the top. The whole plan goes inside the link, with no account. Turn on live progress so everyone sees each other's ticks."),
    h("div", { class: "row nowrap", style: { gap: "8px" } }, h("div", { class: "grow" }, paste), h("button", { class: "btn small gold", type: "button", onclick: () => { const m = paste.value.trim().match(/#\/t\/([A-Za-z0-9_.\-]+)/); if (m) go("#/t/" + m[1]); else toast("That does not look like a trip link."); } }, "Open")),
    h("div", { class: "row", style: { marginTop: "10px" } }, h("label", { class: "btn small glass", style: { cursor: "pointer" } }, ic("filePlus", 15), "Import a trip file", file)));
}
export default { id: "share", version: "2.0.0", title: "Share a trip", description: "Trip links (the plan inside the link), trip files, importing.",
  init(ctx) { ctx.route("t/:payload", importView); ctx.homeSection({ id: "share", order: 40, render: homeCard }); ctx.tripAction({ id: "share", order: 5, icon: "link", label: "Share this trip", run: shareSheet }); ctx.service("share", { shareSheet, exportFile, importFile }); } };
