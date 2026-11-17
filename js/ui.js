/* ui.js - shared UI pieces: navigation, back button, page shell, sheets, toast, travel transitions */
import { h } from "./util.js";
import { ic } from "./icons.js";

export const $ = (s, r = document) => r.querySelector(s);

/* navigate; replace=true swaps the current history entry so Back never loops between tabs */
export function go(hash, opts = {}) {
  if (location.hash === hash) { window.dispatchEvent(new Event("hashchange")); return; }
  if (opts.replace) location.replace(hash); else location.hash = hash;
}
export function refresh() { window.dispatchEvent(new CustomEvent("trip-refresh")); }

export function backBtn(parent, label = "Back") {
  return h("button", { class: "pillbtn back", type: "button", "aria-label": label, onclick: () => go(parent, { replace: true }) }, ic("back", 18, 2.2), h("span", null, label));
}
export function homeBtn() {
  return h("button", { class: "roundbtn", type: "button", "aria-label": "Home", title: "Home", onclick: () => go("#/", { replace: true }) }, ic("home", 19));
}
export function roundBtn(icon, label, onclick, href) {
  const props = { class: "roundbtn", "aria-label": label, title: label };
  if (href) { props.href = href; return h("a", props, ic(icon, 19)); }
  props.type = "button"; props.onclick = onclick;
  return h("button", props, ic(icon, 19));
}

let toastTimer;
export function toast(msg, ms = 4200) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

export function openSheet(title, content, buttons = [], opts = {}) {
  const host = $("#sheetHost");
  const close = () => { host.innerHTML = ""; document.body.style.overflow = ""; };
  const sheet = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title },
    h("div", { class: "grab" }),
    opts.eyebrow ? h("div", { class: "eyebrow" }, opts.eyebrow) : null,
    h("h3", null, title), content,
    buttons.length ? h("div", { class: "row end", style: { marginTop: "16px" } },
      buttons.map(b => h("button", { class: "btn " + (b.cls || "glass"), type: "button", onclick: async () => { const r = b.onclick ? await b.onclick() : null; if (r !== false) close(); } }, b.label))) : null);
  const back = h("div", { class: "backdrop", onclick: e => { if (e.target === back) close(); } }, sheet);
  host.innerHTML = "";
  host.appendChild(back);
  document.body.style.overflow = "hidden";
  return close;
}
export function confirmSheet(title, text, okLabel, onOk) {
  openSheet(title, h("p", { class: "muted" }, text), [{ label: "Cancel", cls: "glass" }, { label: okLabel, cls: "danger", onclick: onOk }]);
}

export function shell({ title, sub, eyebrow, back, home, actions, tripId, tab, body }) {
  const bar = h("header", { class: "topbar" },
    back ? backBtn(back) : null,
    h("div", { class: "ttl" }, eyebrow ? h("span", { class: "eyebrow" }, eyebrow) : null, h("span", { class: "name" }, title), sub ? h("span", { class: "sub" }, sub) : null),
    h("div", { class: "acts" }, home ? homeBtn() : null, actions || null));
  const wrap = h("div", { class: "screen" }, h("div", { class: "page" }, bar, body));
  if (tripId && tab) {
    const tabs = [["plan", "map", "Plan"], ["hotels", "hotel", "Hotels"], ["flights", "plane", "Flights"]];
    wrap.appendChild(h("nav", { class: "dock", "aria-label": "Trip sections" },
      tabs.map(([id, icon, lb]) => h("a", {
        href: `#/trip/${tripId}/${id}`, class: tab === id ? "active" : "", "aria-current": tab === id ? "page" : null,
        onclick: e => { e.preventDefault(); go(`#/trip/${tripId}/${id}`, { replace: true }); }
      }, ic(icon, 22, 1.7), h("span", null, lb)))));
  }
  return wrap;
}

export function fly(dir) {
  const f = $("#flight"), w = $("#wipe");
  [f, w].forEach(el => { el.classList.remove("go", "rev"); void el.offsetWidth; el.classList.add("go"); if (dir === "left") el.classList.add("rev"); });
}

/* background photo with a soft cross-fade */
let bgIdx = 0, bgCurrent = "";
export function setBackground(url) {
  if (url === bgCurrent) return;
  bgCurrent = url;
  const layers = document.querySelectorAll("#scene .bg");
  bgIdx = 1 - bgIdx;
  const next = layers[bgIdx], prev = layers[1 - bgIdx];
  next.style.backgroundImage = `url("${url}")`;
  next.classList.add("on");
  prev.classList.remove("on");
}
