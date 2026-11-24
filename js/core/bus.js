/* bus.js - tiny event bus so modules can talk without importing each other. */
const map = new Map();
export const bus = {
  on(evt, fn) { (map.get(evt) || map.set(evt, new Set()).get(evt)).add(fn); return () => map.get(evt)?.delete(fn); },
  emit(evt, data) { (map.get(evt) || []).forEach(fn => { try { fn(data); } catch (e) { console.error("[bus]", evt, e); } }); }
};
/* events used across the app:
   trip-changed {id}   the plan/hotels/flights of a trip were edited      trip-created {id}   trip-removed {id}
   progress-changed {id, stopId}   a stop was ticked                       route-refresh   re-draw the current screen */
