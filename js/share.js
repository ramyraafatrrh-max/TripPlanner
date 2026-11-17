/* share.js - trip files: save a trip (or all trips) as a file and import it on another phone. */
import * as store from "./store.js";
import { uid, randomTopic } from "./util.js";

export class ShareError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

export function exportFile(onlyId) {
  const list = store.trips().filter(t => !onlyId || t.id === onlyId).map(t => {
    const c = JSON.parse(JSON.stringify(t));
    delete c.viaShare;
    if (c.settings) { c.settings.scheduled = {}; delete c.settings.topic; }
    return c;
  });
  return JSON.stringify({ app: "trip-pilot", v: 1, exported: Date.now(), trips: list }, null, 2);
}
export function importFile(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new ShareError("file", "That file is not a Trip Pilot export."); }
  if (!data || data.app !== "trip-pilot" || !Array.isArray(data.trips)) throw new ShareError("file", "That file is not a Trip Pilot export.");
  let n = 0;
  data.trips.forEach(t => {
    if (!t || !Array.isArray(t.days)) return;
    if (store.getTrip(t.id)) { t.id = uid("trip"); t.name = t.name + " (copy)"; }
    delete t.viaShare;
    t.settings = Object.assign({ notifyTime: "07:30", includeNames: false, tz: "auto", scheduled: {} }, t.settings, { topic: randomTopic() });
    store.trips().push(t); n++;
  });
  store.save();
  return n;
}
