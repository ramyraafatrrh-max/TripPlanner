/* router.js - hash routes like #/trip/abc/plan/2026-12-18. Modules register patterns through the registry. */
import { reg } from "./registry.js";
let root = null, token = 0, wipeEl = null;

const reduceMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
export function go(hash, opts = {}) { if (opts.replace) location.replace(hash); else if (location.hash === hash) render(); else location.hash = hash; }
export function route(pattern, handler) { reg.routes.push({ pattern, handler, segs: pattern.split("/").filter(Boolean) }); }

function parse() {
  const raw = location.hash.replace(/^#\/?/, ""), [path, qs] = raw.split("?");
  return { segs: path.split("/").filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } }), query: new URLSearchParams(qs || "") };
}
function match(segs) {
  for (const r of reg.routes) {
    if (r.segs.length !== segs.length) continue;
    const params = {}; let ok = true;
    r.segs.forEach((p, i) => { if (!ok) return; if (p[0] === ":") params[p.slice(1)] = segs[i]; else if (p !== segs[i]) ok = false; });
    if (ok) return { route: r, params };
  }
  return null;
}
function wipe() { if (reduceMotion() || !wipeEl) return; wipeEl.classList.remove("go"); void wipeEl.offsetWidth; wipeEl.classList.add("go"); }
export async function render() {
  const my = ++token, { segs, query } = parse(), m = match(segs);
  let view;
  try { view = m ? await m.route.handler(m.params, query) : fallback("This page was not found.", "Go to my trips"); }
  catch (e) { console.error("[route]", location.hash, e); view = fallback("Something went wrong on this screen: " + (e && e.message ? e.message : e) + ". The module behind it may be switched off or need an update.", "Go to my trips"); }
  if (my !== token || !root) return;
  wipe(); root.replaceChildren(view); view.classList.add("enter");
}
/* every screen has the same structure: .view > header.topbar + .scroll(.content) [+ nav.dock] */
function fallback(msg, label) {
  const d = document.createElement("div"); d.className = "view";
  d.innerHTML = `<div class="scroll"><main class="content"><div class="glass card empty"><p></p><a class="btn gold" href="#/"></a></div></main></div>`;
  d.querySelector("p").textContent = msg; d.querySelector("a").textContent = label; return d;
}
export function start(el) { root = el; wipeEl = document.getElementById("wipe"); window.addEventListener("hashchange", render); render(); }
export const refresh = () => render();
