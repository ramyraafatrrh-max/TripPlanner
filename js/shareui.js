/* shareui.js - screens for sharing trips with another phone */
import { h, clip, download, fmtShort } from "./util.js";
import * as store from "./store.js";
import * as share from "./share.js";
import * as link from "./link.js";
import { shell, openSheet, toast, confirmSheet, go } from "./ui.js";
import { ic } from "./icons.js";

function copyText(text) {
  const done = () => toast("Link copied");
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => toast("Press and hold the link to copy it."));
  else toast("Press and hold the link to copy it.");
}
async function shareLink(link, title) {
  if (navigator.share) { try { await navigator.share({ title, text: "My trip plans", url: link }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
  copyText(link);
}
function linkRow(link) {
  const input = h("input", { type: "text", value: link, readonly: true, "aria-label": "Share link", onclick: e => e.target.select() });
  return h("div", null,
    h("div", { class: "linkrow" }, input),
    h("div", { class: "row", style: { marginTop: "10px", gap: "8px" } },
      h("button", { class: "btn small gold", type: "button", onclick: () => copyText(link) }, ic("link", 15), "Copy link"),
      h("button", { class: "btn small glass", type: "button", onclick: () => shareLink(link, "Trip Pilot") }, ic("ext", 15), "Share\u2026")));
}

/* first-time setup: needs a GitHub token once, on the phone that creates the link */
export function setupSheet(onDone) {
  const g = store.settings();
  const guess = share.repoGuess();
  const tok = h("input", { type: "password", value: g.ghToken || "", placeholder: "github_pat_\u2026", autocomplete: "off", "aria-label": "GitHub token" });
  const own = h("input", { type: "text", value: guess.owner, placeholder: "your GitHub username", "aria-label": "GitHub username" });
  const rep = h("input", { type: "text", value: guess.repo, placeholder: "repository name, e.g. trip-pilot", "aria-label": "Repository" });
  const err = h("div", { class: "warnbox", hidden: true });
  const content = h("div", null,
    h("p", { class: "muted" }, "Your trips are encrypted on this phone before they are stored in your GitHub repository, and the key is only inside the link. Nobody browsing the repository can read your plans."),
    h("ol", null,
      h("li", null, "On github.com open ", h("b", null, "Settings > Developer settings > Fine-grained tokens"), " and create a token for ", h("b", null, "only this repository"), " with ", h("b", null, "Contents: Read and write"), "."),
      h("li", null, "Paste it below. It stays on this phone."),
      h("li", null, "Tap Create link and send the link to your other phone.")),
    h("label", { class: "field" }, "GitHub token"), tok, h("label", { class: "field" }, "GitHub username"), own, h("label", { class: "field" }, "Repository"), rep, err);
  openSheet("Create your share link", content, [
    { label: "Cancel", cls: "glass" },
    { label: "Create link", cls: "gold", onclick: async () => {
      err.hidden = true;
      try { const link = await share.createProfile({ token: tok.value, owner: own.value, repo: rep.value }); toast("Share link ready"); onDone && onDone(); linkSheet(link); return false; }
      catch (e) { err.textContent = e.message || String(e); err.hidden = false; return false; }
    } }], { eyebrow: "Share and sync" });
}
export function linkSheet(link) {
  openSheet("Your share link", h("div", null,
    h("p", { class: "muted" }, "Open this link on your other phone to see all your trips there. Anything you change on this phone is synced automatically."),
    linkRow(link),
    h("p", { class: "muted", style: { marginTop: "12px" } }, "Anyone with the link can read your plans, so send it only to people you trust.")), [{ label: "Done", cls: "gold" }], { eyebrow: "Share and sync" });
}

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


/* ---------- share one trip as a link (no GitHub, no token) ---------- */
export function tripLinkSheet(trip) {
  const body = h("div");
  const refs = h("input", { type: "checkbox" });
  let options = [], chosen = "full", closeSheet = () => {};
  const out = h("div");

  async function build() {
    out.innerHTML = "";
    out.appendChild(h("p", { class: "muted" }, h("span", { class: "spinner" }), "Building the link\u2026"));
    options = await link.buildOptions(trip, { refs: refs.checked });
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
    if (cur.length > link.SOFT_LIMIT) out.appendChild(h("div", { class: "warnbox" }, "This link is very long. Some chat apps cut long links, so the other phone may say the link is incomplete. Try a shorter option, or send the trip file instead."));
    out.appendChild(h("div", { class: "linkrow", style: { marginTop: "10px" } }, h("input", { type: "text", value: cur.url, readonly: true, "aria-label": "Trip link", onclick: e => e.target.select() })));
    out.appendChild(h("div", { class: "row", style: { marginTop: "10px", gap: "8px" } },
      h("button", { class: "btn small gold", type: "button", onclick: () => copyText(cur.url) }, ic("link", 15), "Copy link"),
      h("button", { class: "btn small glass", type: "button", onclick: () => shareLink(cur.url, trip.name) }, ic("ext", 15), "Share\u2026"),
      h("button", { class: "btn small glass", type: "button", onclick: () => download(`${trip.name.replace(/[^\w]+/g, "_")}.json`, share.exportFile(trip.id), "application/json") }, "Save as file")));
  }
  body.appendChild(h("p", { class: "muted" }, "The whole plan is inside this link, so the other phone needs nothing else: no account, no GitHub. Open the link there and tap Add to this phone."));
  body.appendChild(h("label", { class: "pickrow" }, refs, h("span", null, "Include hotel confirmation numbers and flight booking references")));
  body.appendChild(out);
  body.appendChild(h("p", { class: "muted", style: { marginTop: "12px" } }, "Your Visited ticks, notes and alert settings are not included. The link is a copy from now: if you change the plan, copy a new link and open it on the other phone, and it updates the same trip there without losing that phone's ticks."));
  refs.addEventListener("change", build);
  closeSheet = openSheet("Share " + (trip.name.length > 26 ? "this trip" : trip.name), body, [{ label: "Done", cls: "gold" }], { eyebrow: "Share" });
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
      h("span", { class: "pill" }, ic("hotel", 13), String(pv.hotels)), h("span", { class: "pill" }, ic("plane", 13), String(pv.flights))));
    if (pv.level && pv.level !== "full") card.appendChild(h("div", { class: "warnbox" }, "This link has " + (pv.level === "min" ? "names and map places only" : "shortened descriptions") + ". Ask for the full-detail link if you want the notes too."));
    card.appendChild(h("p", { class: "muted" }, pv.exists ? `You already have "${pv.mineName}" on this phone. Updating replaces its plan with this version and keeps your Visited ticks and notes.` : "It will be added to this phone and works offline once it is added."));
    card.appendChild(h("div", { class: "row", style: { marginTop: "12px" } },
      h("button", { class: "btn gold", type: "button", onclick: () => { try { const r = link.importTrip(data); toast(r.updated ? "Trip updated" : "Trip added to this phone"); go(`#/trip/${r.trip.id}/plan`, { replace: true }); } catch (e) { toast(e.message, 6000); } } }, ic("check", 16, 2.4), pv.exists ? "Update this trip" : "Add to this phone"),
      h("button", { class: "btn glass", type: "button", onclick: () => go("#/", { replace: true }) }, "Not now")));
  })();
  return shell({ eyebrow: "Trip Pilot", title: "Shared trip", back: "#/", body });
}

/* the card shown on the welcome page and in trip settings */
export function shareCard() {
  const wrap = h("section", { class: "glass card" });
  function stateLine() {
    const p = share.profile();
    const st = share.status;
    let txt = "", cls = "";
    if (st.state === "syncing") txt = st.msg;
    else if (st.state === "pending") { txt = st.msg; cls = "warn"; }
    else if (st.state === "error") { txt = st.msg; cls = "warn"; }
    else if (p && p.role === "owner") txt = "Synced " + share.ago(p.lastPush);
    else if (p) txt = "Checked " + share.ago(p.lastPull);
    return h("div", { class: "meta-line" }, h("span", { class: "pill " + (cls || "green") }, ic(st.state === "error" ? "x" : "check", 13, 2.4), txt || "Ready"));
  }
  function advanced() {
    const p = share.profile();
    const box = h("div", { style: { marginTop: "4px" } });
    if (!p) {
      box.appendChild(h("p", { class: "muted" }, "Want every trip to appear on your other phone automatically and stay up to date? Live sync stores an encrypted copy in your own GitHub repository. It needs a GitHub token, which is why it is optional."));
      box.appendChild(h("button", { class: "btn small glass", type: "button", onclick: () => setupSheet(draw) }, ic("link", 15), "Set up live sync"));
      return box;
    }
    if (p.role === "owner") {
      box.appendChild(stateLine());
      box.appendChild(linkRow(share.linkFor(p)));
      box.appendChild(h("div", { class: "row", style: { marginTop: "12px", gap: "8px" } },
        h("button", { class: "btn small green", type: "button", onclick: async () => { try { await share.pushNow(); toast("Synced"); } catch (e) { toast(e.message, 6000); } } }, ic("refresh", 15), "Sync now"),
        h("button", { class: "btn small glass", type: "button", onclick: () => confirmSheet("Stop live sync?", "The live link stops working and the stored copy is deleted from your repository. Other phones keep the copies they already have.", "Stop", async () => { await share.stopSharing(); draw(); toast("Live sync stopped"); }) }, "Stop live sync")));
      return box;
    }
    box.appendChild(stateLine());
    box.appendChild(h("p", { class: "muted" }, "These trips come from another phone and refresh whenever you open the app. Your ticks and notes stay on this phone."));
    box.appendChild(h("div", { class: "row", style: { gap: "8px" } },
      h("button", { class: "btn small green", type: "button", onclick: async () => { const r = await share.pullIfViewer(true); if (r) toast(r.changed ? "Updated" : "Already up to date"); } }, ic("refresh", 15), "Refresh now"),
      h("button", { class: "btn small glass", type: "button", onclick: () => confirmSheet("Disconnect?", "Your copies of the trips stay on this phone but stop updating.", "Disconnect", () => { share.disconnectViewer(); draw(); toast("Disconnected"); }) }, "Disconnect")));
    return box;
  }
  function draw() {
    wrap.innerHTML = "";
    wrap.appendChild(h("span", { class: "eyebrow" }, "Share and sync"));
    wrap.appendChild(h("h3", { style: { margin: "4px 0 6px" } }, "Send a trip to another phone"));
    wrap.appendChild(h("p", { class: "muted" }, "Open a trip and tap the link button at the top. The whole plan goes inside the link: no account and no token."));
    const paste = h("input", { type: "text", placeholder: "Got a trip link? Paste it here", "aria-label": "Paste a trip link" });
    wrap.appendChild(h("div", { class: "row", style: { flexWrap: "nowrap", gap: "8px" } }, h("div", { class: "grow" }, paste),
      h("button", { class: "btn small gold", type: "button", onclick: () => {
        const v = paste.value.trim(); if (!v) return;
        const m = v.match(/#\/t\/([A-Za-z0-9_.\-]+)/);
        if (m) return go("#/t/" + m[1]);
        const l = share.parseLink(v);
        if (l) return go(`#/join?o=${encodeURIComponent(l.o)}&r=${encodeURIComponent(l.r)}&id=${l.id}&k=${l.k}`);
        toast("That does not look like a trip link.");
      } }, "Open")));
    wrap.appendChild(h("div", { class: "row", style: { marginTop: "10px", gap: "8px" } }, importButton()));
    const d = h("details", { style: { marginTop: "14px" } }, h("summary", null, "Advanced: live sync across my own phones"), advanced());
    if (share.profile()) d.open = true;
    wrap.appendChild(d);
  }
  const onStatus = () => { if (!wrap.isConnected) { window.removeEventListener("share-status", onStatus); return; } draw(); };
  window.addEventListener("share-status", onStatus);
  draw();
  return wrap;
}

/* page opened from a share link */
export function joinView(route) {
  const link = route.link;
  const card = h("div", { class: "glass card" });
  const body = h("div", null, card);
  const note = (msg, extra) => { card.innerHTML = ""; card.appendChild(h("span", { class: "eyebrow" }, "Shared trips")); card.appendChild(h("p", null, msg)); if (extra) card.appendChild(extra); };
  const homeBtn = h("button", { class: "btn gold", type: "button", onclick: () => go("#/", { replace: true }) }, "Go to my trips");
  async function load() {
    card.innerHTML = "";
    card.appendChild(h("p", { class: "muted" }, h("span", { class: "spinner" }), "Opening the shared trips\u2026"));
    if (!link) return note("This link is not complete. Ask for it again and open the whole link.", homeBtn);
    const cur = share.profile();
    if (cur && cur.id === link.id && cur.role === "owner") return note("This is your own share link, and these trips are already on this phone.", homeBtn);
    let data;
    try { data = await share.fetchShared(link); }
    catch (e) { return note(e.message || "Could not open the shared trips.", h("div", { class: "row" }, h("button", { class: "btn gold", type: "button", onclick: load }, ic("refresh", 15), "Try again"), h("button", { class: "btn glass", type: "button", onclick: () => go("#/", { replace: true }) }, "Not now"))); }
    card.innerHTML = "";
    card.appendChild(h("span", { class: "eyebrow" }, "Shared with you"));
    card.appendChild(h("h2", { class: "serif", style: { marginTop: "4px" } }, `${data.trips.length} trip${data.trips.length === 1 ? "" : "s"}`));
    data.trips.forEach(t => {
      const first = t.days[0] && t.days[0].date, last = t.days[t.days.length - 1] && t.days[t.days.length - 1].date;
      card.appendChild(h("div", { class: "docrow" }, h("span", { class: "badge" }, ic("map", 22)), h("div", { class: "grow" }, h("b", null, clip(t.name, 40)), h("small", null, `${fmtShort(first)} \u2013 ${fmtShort(last)} \u00B7 ${t.days.length} days`))));
    });
    if (cur && cur.id !== link.id) card.appendChild(h("div", { class: "warnbox" }, "This phone is already connected to another shared profile. Adding this one disconnects the old one, and your existing trips stay."));
    card.appendChild(h("p", { class: "muted" }, "They will be added to this phone and refreshed each time you open the app."));
    card.appendChild(h("div", { class: "row", style: { marginTop: "12px" } },
      h("button", { class: "btn gold", type: "button", onclick: () => { const r = share.joinProfile(link, data); toast(`${r.added + r.updated} trip(s) added to this phone`); go("#/", { replace: true }); } }, ic("check", 16, 2.4), "Add to this phone"),
      h("button", { class: "btn glass", type: "button", onclick: () => go("#/", { replace: true }) }, "Not now")));
  }
  load();
  return shell({ eyebrow: "Trip Pilot", title: "Shared trips", back: "#/", body });
}
