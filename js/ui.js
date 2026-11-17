/* ui.js - shared UI pieces: navigation stack, back button, page shell, sheets, toast, travel transitions */
import { h } from "./util.js";

export const $ = (s, r = document) => r.querySelector(s);

/* ---------- navigation with an explicit stack so "Back" works from anywhere ---------- */
export const nav = { stack: [], isBack: false };

export function navigate(hash) {
  if (location.hash === hash) window.dispatchEvent(new Event("hashchange"));
  else location.hash = hash;
}
export function goBack(parentHash) {
  nav.stack.pop();
  const prev = nav.stack[nav.stack.length - 1];
  if (prev && prev !== location.hash) { nav.isBack = true; location.hash = prev; }
  else navigate(parentHash || "#/");
}
export function backBtn(parentHash, label = "Back") {
  return h("button", { class: "iconbtn back", type: "button", "aria-label": label, onclick: () => goBack(parentHash) }, "\u2190 " + label);
}

/* ---------- toast ---------- */
let toastTimer;
export function toast(msg, ms = 4500) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

/* ---------- bottom sheet ---------- */
export function openSheet(title, content, buttons = []) {
  const host = $("#sheetHost");
  const close = () => { host.innerHTML = ""; document.body.style.overflow = ""; };
  const sheet = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title },
    h("h3", null, title), content,
    h("div", { class: "row", style: { marginTop: "14px" } },
      buttons.map(b => h("button", {
        class: "btn " + (b.cls || ""), type: "button",
        onclick: async () => { const r = b.onclick ? await b.onclick() : null; if (r !== false) close(); }
      }, b.label))));
  const back = h("div", { class: "backdrop", onclick: e => { if (e.target === back) close(); } }, sheet);
  host.innerHTML = "";
  host.appendChild(back);
  document.body.style.overflow = "hidden";
  return close;
}
export function confirmSheet(title, text, okLabel, onOk) {
  openSheet(title, h("p", null, text), [
    { label: "Cancel", cls: "ghost" },
    { label: okLabel, cls: "red", onclick: onOk }
  ]);
}

/* ---------- page shell: top bar, content, tab bar ---------- */
export function shell({ title, sub, back, actions, tripId, tab, body }) {
  const bar = h("div", { class: "topbar" },
    back ? backBtn(back) : null,
    h("div", { class: "ttl" }, title, sub ? h("span", { class: "sub" }, sub) : null),
    actions || null);
  const page = h("div", { class: "page" }, bar, body);
  const wrap = h("div", null, page);
  if (tripId && tab) {
    const tabs = [["plan", "\uD83D\uDDFA\uFE0F", "Plan"], ["hotels", "\uD83C\uDFE8", "Hotels"], ["flights", "\u2708\uFE0F", "Flights"]];
    wrap.appendChild(h("nav", { class: "tabbar", "aria-label": "Trip sections" },
      tabs.map(([id, ic, lb]) => h("a", { href: `#/trip/${tripId}/${id}`, class: tab === id ? "active" : "", "aria-current": tab === id ? "page" : null }, h("b", null, ic), lb))));
  }
  return wrap;
}

/* ---------- travel transitions: a plane crosses the sky and a cloud bank wipes the screen ---------- */
export function fly(dir) {
  const f = $("#flight"), w = $("#wipe");
  [f, w].forEach(el => { el.classList.remove("go", "rev"); void el.offsetWidth; el.classList.add("go"); if (dir === "left") el.classList.add("rev"); });
}
