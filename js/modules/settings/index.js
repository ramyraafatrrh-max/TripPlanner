/* settings module: the trip settings screen and the app settings screen. It only assembles "settings sections" that other
   modules registered, so adding a section never needs a change here. The app screen also lists every module, its version and
   state, and lets you switch one off without redeploying anything. */
import { h } from "../../core/dom.js";
import { ic } from "../../core/icons.js";
import * as store from "../../core/store.js";
import { reg, byOrder } from "../../core/registry.js";
import { go } from "../../core/router.js";
import { shell, notFound, confirmSheet, toast } from "../../core/ui.js";
import { bus } from "../../core/bus.js";
import { svc } from "../../core/registry.js";
import { fmtShort } from "../../core/util.js";

function safe(fn, label) { try { return fn(); } catch (e) { console.error("[settings]", label, e); return h("div", { class: "glass card" }, h("p", { class: "warntext" }, `The ${label} section could not load: ${e.message}`)); } }

function tripSettings({ id }) {
  const trip = store.getTrip(id); if (!trip) return notFound();
  const body = h("div"), name = h("input", { type: "text", value: trip.name, "aria-label": "Trip name" });
  name.addEventListener("change", () => { trip.name = name.value.trim() || trip.name; store.save(); toast("Name saved"); });
  body.append(h("div", { class: "glass card" }, h("span", { class: "eyebrow" }, "Trip"), h("h3", { style: { marginTop: "4px" } }, "Details"), h("label", { class: "field" }, "Trip name"), name,
    h("p", { class: "muted" }, `${trip.days.length} days \u00B7 ${fmtShort(trip.days[0] && trip.days[0].date)} to ${fmtShort(trip.days.length && trip.days[trip.days.length - 1].date)} \u00B7 ${store.progress(trip).total} places`),
    h("div", { class: "row", style: { gap: "8px" } }, reg.tripActions.slice().sort(byOrder).map(a => h("button", { class: "btn small glass", type: "button", onclick: () => a.run(trip) }, ic(a.icon, 15), a.label)))));
  reg.settings.filter(s => s.scope === "trip").sort(byOrder).forEach(s => body.append(safe(() => s.render(trip), s.id)));
  body.append(h("div", { class: "glass card" }, h("h3", null, "Danger zone"), h("button", { class: "btn danger", type: "button", onclick: () => confirmSheet("Delete this trip?", `Your progress and notes for "${trip.name}" will be removed from this device.`, "Delete trip", () => { store.removeTrip(trip.id); bus.emit("trip-removed", { id: trip.id }); go("#/", { replace: true }); toast("Trip deleted"); }) }, ic("trash", 16), "Delete this trip")));
  return shell({ eyebrow: trip.name, title: "Settings", back: `#/trip/${trip.id}/plan`, home: true, body });
}

function appSettings() {
  const body = h("div"), cfg = reg.config, disabled = store.settings().disabled || (store.settings().disabled = []);
  const mods = h("div");
  const row = id => {
    const s = reg.status[id] || { state: "off" }, off = disabled.includes(id), tog = h("input", { type: "checkbox", checked: !off, "aria-label": "Module " + id });
    tog.addEventListener("change", () => { const set = new Set(disabled); tog.checked ? set.delete(id) : set.add(id); store.settings().disabled = [...set]; store.save(true); toast("Saved. Reload the app to apply."); });
    return h("div", { class: "modrow" }, h("span", { class: "badge" }, ic(s.state === "ok" ? "puzzle" : s.state === "error" ? "x" : "info", 18)), h("div", { class: "grow" }, h("b", null, (s.title || id)), h("small", null, s.state === "error" ? "Failed to load: " + s.error : s.state === "off" ? "Switched off" : `${id} \u00B7 version ${s.version}${s.description ? " \u00B7 " + s.description : ""}`)), tog);
  };
  cfg.modules.forEach(id => mods.append(row(id)));
  body.append(h("div", { class: "glass card" }, h("span", { class: "eyebrow" }, "Modular app"), h("h3", { style: { marginTop: "4px" } }, "Modules"),
    h("p", { class: "muted" }, "Every feature is a separate module in js/modules/<name>/. To change one feature, replace just that folder on GitHub. If a module fails or is switched off, the rest of the app keeps working."), mods,
    h("div", { class: "row", style: { gap: "8px", marginTop: "10px" } }, h("button", { class: "btn small gold", type: "button", onclick: () => { if (navigator.serviceWorker) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.update())); location.reload(); } }, ic("refresh", 15), "Reload with latest files"))));
  reg.settings.filter(s => s.scope === "app").sort(byOrder).forEach(s => body.append(safe(() => s.render(), s.id)));
  return shell({ eyebrow: "Trip Pilot", title: "App settings", back: "#/", body });
}

export default { id: "settings", version: "2.0.0", title: "Settings and modules", description: "Trip settings, app settings and the module list.",
  init(ctx) { ctx.route("trip/:id/settings", tripSettings); ctx.route("app", appSettings); ctx.service("settings", {}); } };
