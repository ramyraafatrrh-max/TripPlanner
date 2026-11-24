/* registry.js - the shared "socket board" every module plugs into. Nothing in here knows about any feature. */
export const reg = {
  routes: [],        // { pattern, handler }
  tabs: [],          // { id, label, icon, order }
  tripActions: [],   // { id, icon, label, order, run(trip) }   buttons at the top of every trip screen
  homeSections: [],  // { id, order, render() }
  settings: [],      // { id, scope: "trip"|"app", order, render(trip) }
  services: {},      // name -> object other modules may call (always through svc(), because the module may be off)
  status: {},        // module id -> { state, version, title, description, error }
  config: {}
};
export const svc = name => reg.services[name];
export const byOrder = (a, b) => (a.order ?? 50) - (b.order ?? 50);
