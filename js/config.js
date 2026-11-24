/* config.js - the only place that decides which modules the app loads.
   - Each name below is a folder in js/modules/<name>/index.js. Remove a name (or switch it off in the app under
     Home > gear icon > Modules) and that feature disappears without touching any other file.
   - To change one feature, replace just that module's files. Nothing else needs to be re-uploaded. */
export default {
  appName: "Trip Pilot",
  // load order matters only for services: a module can use the services of modules listed before it
  modules: ["maps", "places", "photos", "parsers", "intake", "welcome", "plan", "hotels", "flights", "alerts", "share", "live", "settings"],

  // Live progress: your own free Cloudflare Worker is the dependable option (see worker/worker.js and the README).
  live: { endpoint: "" },

  // Place search used to find coordinates when you add a place by name (OpenStreetMap services, no key needed).
  geocoder: { nominatim: "https://nominatim.openstreetmap.org/search", photon: "https://photon.komoot.io/api/" }
};
