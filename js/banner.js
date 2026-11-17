/* banner.js - the trip header: a slideshow of photos of the cities in the trip */
import { h } from "./util.js";
import * as store from "./store.js";
import * as photos from "./photos.js";
import { setBackground } from "./ui.js";

const reduceMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

export function coverSection(trip, day, inner) {
  const generic = store.coverUrl(store.coverKey(trip));
  const layers = h("div", { class: "layers" });
  const chips = h("div", { class: "citychips" });
  const credit = h("a", { class: "credit", target: "_blank", rel: "noopener", hidden: true });
  const sec = h("section", { class: "cover" }, layers, chips, credit, inner);
  let list = [], idx = 0, timer = null;

  const order = all => {
    const first = photos.photoForDay(all, day);
    return first ? [first, ...all.filter(p => p !== first)] : all;
  };
  function paintLayers(urls) {
    layers.innerHTML = "";
    urls.forEach((u, i) => layers.appendChild(h("div", { class: "photo" + (i === 0 ? " on" : ""), style: { backgroundImage: `url("${u}")` } })));
  }
  function show(i) {
    idx = i;
    Array.from(layers.children).forEach((el, k) => el.classList.toggle("on", k === i));
    Array.from(chips.children).forEach((el, k) => el.classList.toggle("on", k === i));
    const p = list[i];
    if (p) { credit.hidden = false; credit.textContent = photos.creditText(p); credit.href = p.page || p.article || "#"; credit.title = "Photo of " + p.city + ". Tap for the author and licence."; }
  }
  function start(all) {
    clearInterval(timer);
    list = order(all);
    paintLayers(list.map(p => p.url));
    chips.innerHTML = "";
    list.forEach((p, i) => chips.appendChild(h("button", { type: "button", class: "citychip" + (i === 0 ? " on" : ""), "aria-label": "Show " + p.city, onclick: () => { clearInterval(timer); show(i); } }, p.city)));
    show(0);
    setBackground(list[0].url);
    if (list.length > 1 && !reduceMotion()) timer = setInterval(() => { if (!sec.isConnected) { clearInterval(timer); return; } show((idx + 1) % list.length); }, 7000);
  }

  if (trip.cover) { paintLayers([generic]); return sec; }   // the user chose a fixed picture
  const cached = photos.cachedPhotos(trip);
  if (cached.length) start(cached); else paintLayers([generic]);
  photos.tripPhotos(trip).then(all => {
    if (!sec.isConnected || !all.length) return;
    if (all.map(p => p.url).join("|") !== list.map(p => p.url).join("|")) start(all);
  });
  return sec;
}
