/* kernel.js - loads each module on its own. A module that fails to load (or is switched off) is skipped and the
   rest of the app keeps working. This is what lets you update or disable one feature at a time. */
import { reg } from "./registry.js";
import { bus } from "./bus.js";
import * as store from "./store.js";
import * as router from "./router.js";
import * as ui from "./ui.js";
import { h } from "./dom.js";

function makeCtx() {
  return {
    config: reg.config, bus, store, ui, h,
    route: router.route,
    tab: t => reg.tabs.push(t),
    tripAction: a => reg.tripActions.push(a),
    homeSection: s => reg.homeSections.push(s),
    settingsSection: s => reg.settings.push(s),
    service: (name, obj) => { reg.services[name] = obj; }
  };
}
export async function start(config) {
  reg.config = config;
  const disabled = store.settings().disabled || [];
  const ctx = makeCtx();
  for (const id of config.modules) {
    if (disabled.includes(id)) { reg.status[id] = { state: "off" }; continue; }
    try {
      const mod = (await import(`../modules/${id}/index.js`)).default;
      await mod.init(ctx);
      reg.status[id] = { state: "ok", version: mod.version || "", title: mod.title || id, description: mod.description || "" };
    } catch (e) {
      console.error(`[module ${id}]`, e);
      reg.status[id] = { state: "error", error: (e && e.message) || String(e), title: id };
    }
  }
  router.start(document.getElementById("app"));
  bus.on("route-refresh", () => router.refresh());
  bus.emit("ready");
}
