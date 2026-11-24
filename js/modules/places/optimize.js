/* optimize.js - finds the order of a day's stops with the least travelling (shortest total straight-line distance).
   Pure functions, no UI. Stops that are "fixed" (locked by the user, or without a location yet) keep their relative order;
   every other stop may move anywhere. Used both for "reorder the whole day" and "insert the new place where it adds least". */
import { haversine } from "../../core/util.js";

export function pathLength(order, byId, start) {
  let km = 0, prev = start || null;
  for (const id of order) { const p = byId.get(id).p; if (!p) continue; if (prev) km += haversine(prev, p); prev = p; }
  return km;
}
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/* items: [{ id, p:{lat,lng}|null, fixed:boolean }]  in their current order.  start: {lat,lng}|null (for example the hotel) */
export function optimize(items, { start = null, restarts = 24 } = {}) {
  const byId = new Map(items.map(i => [i.id, i]));
  const orig = items.map(i => i.id);
  const isFixed = id => { const i = byId.get(id); return i.fixed || !i.p; };
  const fixedSeq = orig.filter(isFixed);
  const firstId = items[0].fixed && items[0].p ? items[0].id : null, lastId = items[items.length - 1].fixed && items[items.length - 1].p && items.length > 1 ? items[items.length - 1].id : null;
  const valid = ord => {
    if (firstId && ord[0] !== firstId) return false;            // a pinned opener stays first, a pinned closer stays last
    if (lastId && ord[ord.length - 1] !== lastId) return false;
    let k = 0; for (const id of ord) if (isFixed(id)) { if (fixedSeq[k++] !== id) return false; } return k === fixedSeq.length;
  };
  const cost = ord => pathLength(ord, byId, start);
  const before = cost(orig);
  const free = orig.filter(id => !isFixed(id));
  if (free.length === 0 || orig.length < 2) return { order: orig, before, after: before, moved: 0 };

  const ok = ord => (!firstId || ord[0] === firstId) && (!lastId || ord[ord.length - 1] === lastId);   // fixed items are inserted one by one, so only the ends are checked
  const insertCheapest = (skeleton, id) => {
    let bestPos = skeleton.length, bestCost = Infinity;
    for (let pos = 0; pos <= skeleton.length; pos++) { const cand = skeleton.slice(0, pos).concat(id, skeleton.slice(pos)); if (!ok(cand)) continue; const c = cost(cand); if (c < bestCost - 1e-9) { bestCost = c; bestPos = pos; } }
    return skeleton.slice(0, bestPos).concat(id, skeleton.slice(bestPos));
  };
  const improve = ord => {
    let best = ord, bc = cost(ord), again = true, guard = 0;
    while (again && guard++ < 80) {
      again = false;
      for (let i = 0; i < best.length; i++) {                       // move one free stop somewhere else
        if (isFixed(best[i])) continue;
        for (let j = 0; j < best.length; j++) {
          if (j === i) continue;
          const cand = best.slice(); const [x] = cand.splice(i, 1); cand.splice(j, 0, x);
          if (!valid(cand)) continue; const c = cost(cand); if (c < bc - 1e-9) { best = cand; bc = c; again = true; }
        }
      }
      for (let i = 0; i < best.length; i++) for (let j = i + 1; j < best.length; j++) {   // swap two free stops
        if (isFixed(best[i]) || isFixed(best[j])) continue;
        const cand = best.slice(); [cand[i], cand[j]] = [cand[j], cand[i]]; const c = cost(cand); if (c < bc - 1e-9) { best = cand; bc = c; again = true; }
      }
      for (let i = 0; i < best.length - 1; i++) for (let j = i + 1; j < best.length; j++) {   // reverse a stretch
        const cand = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
        if (!valid(cand)) continue; const c = cost(cand); if (c < bc - 1e-9) { best = cand; bc = c; again = true; }
      }
    }
    return { order: best, cost: bc };
  };

  let top = { order: orig, cost: before };
  const consider = r => { if (r.cost < top.cost - 0.001) top = r; };       // only change the day for a real saving
  consider(improve(orig));
  let sk = fixedSeq.slice(); free.forEach(id => { sk = insertCheapest(sk, id); }); consider(improve(sk));
  if (!fixedSeq.length && orig.length <= 8) {                                    // small day: try every order
    const perm = (rest, cur) => { if (!rest.length) { const c = cost(cur); if (c < top.cost - 0.001) top = { order: cur, cost: c }; return; } rest.forEach((x, i) => perm(rest.filter((_, k) => k !== i), cur.concat(x))); };
    perm(orig, []);
  } else {
    const rnd = lcg(12345);
    for (let r = 0; r < restarts; r++) {
      let cand = fixedSeq.slice(); const pool = free.slice();
      while (pool.length) { const id = pool.splice(Math.floor(rnd() * pool.length), 1)[0]; const pos = Math.floor(rnd() * (cand.length + 1)); const next = cand.slice(0, pos).concat(id, cand.slice(pos)); cand = ok(next) ? next : cand.concat(id).filter((x, i, a) => !(lastId && x === lastId)).concat(lastId && cand.includes(lastId) ? [lastId] : []); }
      if (valid(cand)) consider(improve(cand));
    }
  }
  const moved = top.order.filter((id, i) => id !== orig[i]).length;
  return { order: top.order, before, after: top.cost, moved };
}

/* how much extra travel does adding point p to a day cost (best position)?  null if the day has no located stops */
export function insertionCost(points, p, start = null) {
  const seq = points.filter(Boolean); if (!seq.length) return null;
  const len = arr => { let km = 0, prev = start; for (const q of arr) { if (prev) km += haversine(prev, q); prev = q; } return km; };
  const base = len(seq); let best = Infinity;
  for (let i = 0; i <= seq.length; i++) best = Math.min(best, len(seq.slice(0, i).concat([p], seq.slice(i))) - base);
  return Math.max(0, best);
}
