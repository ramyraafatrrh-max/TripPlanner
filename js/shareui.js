/* shareui.js - share a trip with another phone: a link with the plan inside, plus optional live progress */
import { h, clip, download, fmtShort } from "./util.js";
import * as store from "./store.js";
import * as share from "./share.js";
import * as link from "./link.js";
import * as live from "./live.js";
import { testBackend, defaultBackend } from "./backend.js";
import { shell, openSheet, toast, go } from "./ui.js";
import { ic } from "./icons.js";

function copyText(text) {
  const done = () => toast("Link copied");
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => toast("Press and hold the link to copy it."));
  else toast("Press and hold the link to copy it.");
}
async function shareLink(url, title) {
  if (navigator.share) { try { await navigator.share({ title, text: "My trip plans", url }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
  copyText(url);
}

/* ---------- live progress controls (used in the share sheet and in settings) ---------- */
export function connectionTest(box) {
  box.innerHTML = "";
  box.appendChild(h("p", { class: "muted" }, h("span", { class: "spinner" }), "Checking the sync service\u2026"));
  return testBackend().then(r => {
    box.innerHTML = "";
    r.steps.forEach(st => box.appendChild(h("div", { class: "kv" }, ic(st.ok ? "check" : "x", 16, 2.2), h("span", null, st.label + (st.ok ? "" : ": " + st.msg)))));
    box.appendChild(h("div", { class: r.ok ? "banner" : "warnbox" }, r.ok ? `Works. Live progress will use ${r.label}.` : `Not working: ${r.error} Live progress will not sync until this works. Your ticks stay safe on this phone.`));
  });
}
export function liveStatusLine(trip) {
  const st = live.statusOf(trip.id);
  let txt = "Live progress is on", cls = "green", icon = "check";
  if (st.state === "syncing") txt = "Syncing\u2026";
  else if (st.state === "pending") { txt = "Sharing your change\u2026"; cls = "warn"; }
  else if (st.state === "error") { txt = st.msg; cls = "warn"; icon = "x"; }
  else if (trip.live && trip.live.lastSync) txt = "Live \u00B7 synced " + live.ago(trip.live.lastSync);
  return h("span", { class: "pill " + cls }, ic(icon, 13, 2.4), txt);
}
export function liveControls(trip, onChange) {
  const box = h("div");
  const testBox = h("div");
  function draw() {
    box.innerHTML = "";
    if (live.isLive(trip)) {
      box.appendChild(h("div", { class: "meta-line" }, liveStatusLine(trip)));
      box.appendChild(h("p", { class: "muted" }, "Everyone who opens this trip's link sees your ticks within seconds, and you see theirs. Anyone with the link can tick places."));
      box.appendChild(h("div", { class: "row", style: { gap: "8px" } },
        h("button", { class: "btn small green", type: "button", onclick: async () => { const r = await live.sync(trip); toast(r.error ? "Could not sync right now" : r.changed ? `${r.changed} place(s) updated` : "Up to date"); draw(); } }, ic("refresh", 15), "Sync now"),
        h("button", { class: "btn small glass", type: "button", onclick: () => connectionTest(testBox) }, "Test connection"),
        h("button", { class: "btn small glass", type: "button", onclick: () => { live.disable(trip); draw(); onChange && onChange(); toast("Live progress turned off on this phone"); } }, "Turn off")));
    } else {
      const err = h("div", { class: "warnbox", hidden: true });
      const cb = h("input", { type: "checkbox", "aria-label": "Share my progress live" });
      cb.addEventListener("change", async () => {
        if (!cb.checked) return;
        cb.disabled = true; err.hidden = true;
        try { await live.enable(trip); toast("Live progress is on"); draw(); onChange && onChange(); }
        catch (e) { cb.checked = false; cb.disabled = false; err.textContent = (e && e.message) || "Could not turn on live progress."; err.hidden = false; }
      });
      box.appendChild(h("label", { class: "pickrow" }, cb, h("span", null, "Share progress live: everyone with the link sees each other's ticks")));
      box.appendChild(h("p", { class: "muted" }, "No account needed. The app creates a private room for this trip by itself and keeps your ticks in it, encrypted with a key that is only inside the link. Needs an internet connection to sync; ticking works offline."));
      box.appendChild(err);
      box.appendChild(h("button", { class: "btn small glass", type: "button", onclick: () => connectionTest(testBox) }, "Test connection"));
    }
    box.appendChild(testBox);
  }
  const onStatus = e => { if (!box.isConnected) { window.removeEventListener("live-status", onStatus); return; } if (!e.detail || e.detail.id === trip.id) { const keep = testBox.innerHTML; draw(); testBox.innerHTML = keep; } };
  window.addEventListener("live-status", onStatus);
  draw();
  return box;
}

/* ---------- share one trip as a link ---------- */
export function tripLinkSheet(trip) {
  const body = h("div");
  const refs = h("input", { type: "checkbox" });
  let options = [], chosen = "full", token = 0;
  const out = h("div");

  async function build() {
    const my = ++token;
    out.innerHTML = "";
    out.appendChild(h("p", { class: "muted" }, h("span", { class: "spinner" }), "Building the link\u2026"));
    options = await link.buildOptions(trip, { refs: refs.checked });
    if (my !== token) return;
    const fits = options.filter(o => o.length <= link.SOFT_LIMIT);
    chosen = (fits[0] || options[options.length - 1]).id;
    paint();
  }
  function paint() {
    out.innerHTML = "";
    const cur = options.find(o => o.id === chosen);
    out.appendChild(h("div", { class: "field", style: { margin: "6px 0 4px" } }, "How much detail"));
    options.forEach(o => out.appendChild(h("label", { class: "pickrow" },
      h("input", { type: "radio", name: "lvl", checked: o.id === chosen, onchange: () => { chosen = o.id; paint(); } }),
      h("span", null, o.label), h("span", { class: "muted", style: { fontSize: ".78rem", flex: "0 0 auto" } }, o.length.toLocaleString() + " characters"))));
    if (cur.length > link.SOFT_LIMIT) out.appendChild(h("div", { class: "warnbox" }, "This link is very long. Some chat apps cut long links, so the other phone may say the link is incomplete. Try a shorter option, or save the trip as a file."));
    out.appendChild(h("div", { class: "linkrow", style: { marginTop: "10px" } }, h("input", { type: "text", value: cur.url, readonly: true, "aria-label": "Trip link", onclick: e => e.target.select() })));
    out.appendChild(h("div", { class: "row", style: { marginTop: "10px", gap: "8px" } },
      h("button", { class: "btn small gold", type: "button", onclick: () => copyText(cur.url) }, ic("link", 15), "Copy link"),
      h("button", { class: "btn small glass", type: "button", onclick: () => shareLink(cur.url, trip.name) }, ic("ext", 15), "Share\u2026"),
      h("button", { class: "btn small glass", type: "button", onclick: () => download(`${trip.name.replace(/[^\w]+/g, "_")}.json`, share.exportFile(trip.id), "application/json") }, "Save as file")));
  }
  body.appendChild(h("p", { class: "muted" }, "The whole plan is inside this link, so the other phone needs nothing else: no account, no GitHub. Open the link there and tap Add to this phone."));
  body.appendChild(h("div", { class: "eyebrow", style: { margin: "14px 0 4px" } }, "Progress"));
  body.appendChild(liveControls(trip, build));
  body.appendChild(h("hr", { class: "soft" }));
  body.appendChild(h("label", { class: "pickrow" }, refs, h("span", null, "Include hotel confirmation numbers and flight booking references")));
  body.appendChild(out);
  body.appendChild(h("p", { class: "muted", style: { marginTop: "12px" } }, "Notes and alert settings are never included. The plan in a link is a copy from now: if you change the plan, copy a new link and open it on the other phone, and it updates the same trip there."));
  refs.addEventListener("change", build);
  openSheet("Share " + (trip.name.length > 26 ? "this trip" : trip.name), body, [{ label: "Done", cls: "gold" }], { eyebrow: "Share" });
  build();
}

/* page opened from a trip link */
export function importView(route) {
  const card = h("div", { class: "glass card" });
  const body = h("div", null, card);
  const homeBtn = h("button", { class: "btn gold", type: "button", onclick: () => go("#/", { replace: true }) }, "Go to my trips");
  const note = (msg, extra) => { card.innerHTML = ""; card.appendChild(h("span", { class: "eyebrow" }, "Shared trip")); card.appendChild(h("p", null, msg)); if (extra) card.appendChild(extra); };
  (async () => {
    card.appendChild(h("p", { class: "muted" }, h("span", { class: "spinner" }), "Opening the trip\u2026"));
    let data;
    try { data = await link.decodePayload(route.payload || ""); } catch (e) { return note(e.message, homeBtn); }
    const pv = link.preview(data);
    const t = data.trip;
    const first = t.days[0] && t.days[0].date, last = t.days[t.days.length - 1] && t.days[t.days.length - 1].date;
    card.innerHTML = "";
    card.appendChild(h("span", { class: "eyebrow" }, pv.exists ? "Update available" : "Shared with you"));
    card.appendChild(h("h2", { class: "serif", style: { marginTop: "4px" } }, clip(t.name, 60)));
    card.appendChild(h("div", { class: "meta-line" },
      h("span", { class: "pill gold" }, `${fmtShort(first)} \u2013 ${fmtShort(last)}`), h("span", { class: "pill" }, `${pv.days} days`), h("span", { class: "pill" }, `${pv.stops} places`),
      h("span", { class: "pill" }, ic("hotel", 13), String(pv.hotels)), h("span", { class: "pill" }, ic("plane", 13), String(pv.flights)),
      pv.live ? h("span", { class: "pill green" }, ic("refresh", 13), "Live progress") : null));
    if (pv.live) card.appendChild(h("div", { class: "banner" }, ic("refresh", 22), h("div", { class: "grow" }, h("b", null, "This trip shares progress live"), h("span", { class: "muted" }, "Places ticked on other phones appear on yours, and yours appear on theirs."))));
    if (pv.level && pv.level !== "full") card.appendChild(h("div", { class: "warnbox" }, "This link has " + (pv.level === "min" ? "names and map places only" : "shortened descriptions") + ". Ask for the full-detail link if you want the notes too."));
    card.appendChild(h("p", { class: "muted" }, pv.exists ? `You already have "${pv.mineName}" on this phone. Updating replaces its plan with this version and keeps your notes${pv.live ? " and your ticks" : " and ticks"}.` : "It will be added to this phone and works offline once it is added."));
    card.appendChild(h("div", { class: "row", style: { marginTop: "12px" } },
      h("button", { class: "btn gold", type: "button", onclick: () => {
        try {
          const r = link.importTrip(data);
          toast(r.updated ? "Trip updated" : "Trip added to this phone");
          go(`#/trip/${r.trip.id}/plan`, { replace: true });
          if (live.isLive(r.trip)) live.sync(r.trip);
        } catch (e) { toast(e.message, 6000); }
      } }, ic("check", 16, 2.4), pv.exists ? "Update this trip" : "Add to this phone"),
      h("button", { class: "btn glass", type: "button", onclick: () => go("#/", { replace: true }) }, "Not now")));
  })();
  return shell({ eyebrow: "Trip Pilot", title: "Shared trip", back: "#/", body });
}

/* the card on the welcome page */
function importButton(cls = "btn small glass") {
  const input = h("input", { type: "file", accept: ".json,application/json", style: { display: "none" },
    onchange: async e => {
      const f = (e.target.files || [])[0]; e.target.value = "";
      if (!f) return;
      try { const n = share.importFile(await f.text()); toast(`${n} trip(s) imported`); go("#/", { replace: true }); window.dispatchEvent(new CustomEvent("trip-refresh")); }
      catch (err) { toast(err.message || "Could not import that file.", 6000); }
    } });
  return h("label", { class: cls, style: { cursor: "pointer" } }, ic("filePlus", 15), "Import a trip file", input);
}
export function shareCard() {
  const paste = h("input", { type: "text", placeholder: "Got a trip link? Paste it here", "aria-label": "Paste a trip link" });
  return h("section", { class: "glass card" },
    h("span", { class: "eyebrow" }, "Share and sync"),
    h("h3", { style: { margin: "4px 0 6px" } }, "Send a trip to another phone"),
    h("p", { class: "muted" }, "Open a trip and tap the link button at the top. The whole plan goes inside the link, with no account. You can also turn on live progress so everyone sees each other's ticks."),
    h("div", { class: "row", style: { flexWrap: "nowrap", gap: "8px" } }, h("div", { class: "grow" }, paste),
      h("button", { class: "btn small gold", type: "button", onclick: () => {
        const v = paste.value.trim(); if (!v) return;
        const m = v.match(/#\/t\/([A-Za-z0-9_.\-]+)/);
        if (m) return go("#/t/" + m[1]);
        toast("That does not look like a trip link.");
      } }, "Open")),
    h("div", { class: "row", style: { marginTop: "10px", gap: "8px" } }, importButton()));
}
