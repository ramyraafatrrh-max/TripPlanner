/* ui.js - the phone shell, bottom sheets and toasts. Used by every module; it has no feature logic of its own.
   Every screen is: a fixed top bar, a scrolling middle (.scroll), and (inside a trip) a bottom tab bar that is part of the
   layout, so it is always on screen and never moves when you scroll. */
import { h } from "./dom.js";
import { ic } from "./icons.js";
import { reg, byOrder } from "./registry.js";
import { go } from "./router.js";
import * as store from "./store.js";

export function roundBtn(icon, label, onclick, href) {
  const attrs = { class: "round", "aria-label": label, title: label };
  if (href) return h("a", Object.assign(attrs, { href, onclick: onclick ? e => { e.preventDefault(); onclick(e); } : undefined }), ic(icon, 19));
  return h("button", Object.assign(attrs, { type: "button", onclick }), ic(icon, 19));
}
export function shell({ eyebrow, title, sub, back, home, actions = [], tripId, tab, body }) {
  const view = h("div", { class: "view" });
  const top = h("header", { class: "topbar glass" },
    back ? h("a", { class: "round back", href: back, "aria-label": "Back", onclick: e => { e.preventDefault(); go(back, { replace: true }); } }, ic("left", 20)) : null,
    h("div", { class: "titles" }, eyebrow ? h("span", { class: "eyebrow" }, eyebrow) : null, h("h1", { class: "name serif" }, title), sub ? h("span", { class: "sub" }, sub) : null),
    h("div", { class: "actions" }, home ? roundBtn("home", "Home", null, "#/") : null, ...actions));
  view.append(top, h("div", { class: "scroll" }, h("main", { class: "content" }, body)));
  if (tripId) {
    const tabs = reg.tabs.slice().sort(byOrder);
    view.append(h("nav", { class: "dock glass", "aria-label": "Trip sections" }, tabs.map(t =>
      h("a", { class: "dock-item" + (t.id === tab ? " on" : ""), href: `#/trip/${tripId}/${t.id}`, "aria-current": t.id === tab ? "page" : null, onclick: e => { e.preventDefault(); if (t.id !== tab) go(`#/trip/${tripId}/${t.id}`, { replace: true }); } }, ic(t.icon, 22), h("span", null, t.label)))));
  }
  return view;
}
/* the common frame for the Plan, Hotels and Flights tabs: Back always goes to the main page */
export function tripShell(trip, tab, body) {
  const p = store.progress(trip);
  const actions = reg.tripActions.slice().sort(byOrder).map(a => roundBtn(a.icon, a.label, () => a.run(trip)));
  actions.push(roundBtn("sliders", "Trip settings", null, `#/trip/${trip.id}/settings`));
  return shell({ eyebrow: "Trip Pilot", title: trip.name, sub: `${p.done} of ${p.total} places visited`, back: "#/", actions, tripId: trip.id, tab, body });
}
export function notFound(msg = "This trip is not on this device any more.") {
  return shell({ title: "Not found", back: "#/", body: h("div", { class: "glass card empty" }, ic("map", 30), h("p", null, msg), h("a", { class: "btn gold", href: "#/" }, "Go to my trips")) });
}
/* the scrolling area of a screen (used by modules that need to keep the scroll position when they redraw) */
export const scroller = view => (view && view.querySelector(".scroll")) || null;

export function openSheet(title, content, buttons = [], { eyebrow } = {}) {
  const prev = document.activeElement, back = h("div", { class: "sheet-back" });
  const close = () => { back.classList.add("out"); setTimeout(() => back.remove(), 220); document.removeEventListener("keydown", onKey); prev && prev.focus && prev.focus(); };
  const onKey = e => { if (e.key === "Escape") close(); };
  back.addEventListener("click", e => { if (e.target === back) close(); }); document.addEventListener("keydown", onKey);
  const sheet = h("div", { class: "sheet glass", role: "dialog", "aria-modal": "true", "aria-label": title }, h("div", { class: "grab" }), eyebrow ? h("span", { class: "eyebrow" }, eyebrow) : null, h("h2", { class: "serif" }, title), h("div", { class: "sheet-body" }, content),
    buttons.length ? h("div", { class: "sheet-actions" }, buttons.map(b => h("button", { class: "btn " + (b.cls || "glass"), type: "button", onclick: async e => { const r = b.onclick ? await b.onclick(e, close) : undefined; if (r !== false) close(); } }, b.label))) : null);
  back.append(sheet); document.body.append(back); requestAnimationFrame(() => back.classList.add("in")); return close;
}
export function confirmSheet(title, text, label, onYes) { openSheet(title, h("p", { class: "muted" }, text), [{ label: "Cancel", cls: "glass" }, { label, cls: "danger", onclick: onYes }], { eyebrow: "Please confirm" }); }
export function toast(msg, ms = 2800) {
  const box = document.getElementById("toasts"); if (!box) return;
  const t = h("div", { class: "toast glass", role: "status" }, msg); box.append(t); requestAnimationFrame(() => t.classList.add("in")); setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 300); }, ms);
}
export function setBackground(url) { const bg = document.getElementById("bg"); if (!bg || bg.dataset.url === url) return; bg.dataset.url = url; const img = new Image(); img.onload = () => { bg.style.backgroundImage = `url("${url}")`; bg.classList.add("on"); }; img.src = url; }
