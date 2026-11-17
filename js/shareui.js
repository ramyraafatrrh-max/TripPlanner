/* shareui.js - screens for sharing trips with another phone */
import { h, clip, download, fmtShort } from "./util.js";
import * as store from "./store.js";
import * as share from "./share.js";
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
  function draw() {
    wrap.innerHTML = "";
    const p = share.profile();
    wrap.appendChild(h("span", { class: "eyebrow" }, "Share and sync"));
    if (!p) {
      wrap.appendChild(h("h3", { style: { margin: "4px 0 6px" } }, "See your trips on another phone"));
      wrap.appendChild(h("p", { class: "muted" }, "Create a link once. Open it on any phone and all your trips appear there, and stay up to date."));
      wrap.appendChild(h("div", { class: "row", style: { gap: "8px" } },
        h("button", { class: "btn gold", type: "button", onclick: () => setupSheet(draw) }, ic("link", 16), "Create share link"), importButton()));
      const paste = h("input", { type: "text", placeholder: "Got a link? Paste it here", "aria-label": "Paste a share link" });
      wrap.appendChild(h("div", { class: "row", style: { marginTop: "12px", flexWrap: "nowrap", gap: "8px" } }, h("div", { class: "grow" }, paste),
        h("button", { class: "btn small glass", type: "button", onclick: () => { const l = share.parseLink(paste.value); if (!l) return toast("That does not look like a share link."); go(`#/join?o=${encodeURIComponent(l.o)}&r=${encodeURIComponent(l.r)}&id=${l.id}&k=${l.k}`); } }, "Open")));
      return;
    }
    if (p.role === "owner") {
      wrap.appendChild(h("h3", { style: { margin: "4px 0 6px" } }, "Your share link is live"));
      wrap.appendChild(stateLine());
      wrap.appendChild(linkRow(share.linkFor(p)));
      wrap.appendChild(h("div", { class: "row", style: { marginTop: "12px", gap: "8px" } },
        h("button", { class: "btn small green", type: "button", onclick: async () => { try { await share.pushNow(); toast("Synced"); } catch (e) { toast(e.message, 6000); } } }, ic("refresh", 15), "Sync now"),
        h("button", { class: "btn small glass", type: "button", onclick: () => download("trip-pilot-trips.json", share.exportFile(), "application/json") }, "Export file"),
        h("button", { class: "btn small glass", type: "button", onclick: () => confirmSheet("Stop sharing?", "The link stops working and the shared copy is deleted from your repository. Other phones keep the copies they already have.", "Stop sharing", async () => { await share.stopSharing(); draw(); toast("Sharing stopped"); }) }, "Stop sharing")));
      return;
    }
    wrap.appendChild(h("h3", { style: { margin: "4px 0 6px" } }, "Connected to a shared profile"));
    wrap.appendChild(stateLine());
    wrap.appendChild(h("p", { class: "muted" }, "These plans come from another phone and refresh whenever you open the app. Your ticks and notes stay on this phone. If the owner changes the plan, those changes replace edits you made to the shared trips here."));
    wrap.appendChild(h("div", { class: "row", style: { gap: "8px" } },
      h("button", { class: "btn small green", type: "button", onclick: async () => { const r = await share.pullIfViewer(true); if (r) toast(r.changed ? "Updated from the shared profile" : "Already up to date"); } }, ic("refresh", 15), "Refresh now"),
      h("button", { class: "btn small glass", type: "button", onclick: () => confirmSheet("Disconnect?", "Your copies of the trips stay on this phone but stop updating.", "Disconnect", () => { share.disconnectViewer(); draw(); toast("Disconnected"); }) }, "Disconnect")));
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
