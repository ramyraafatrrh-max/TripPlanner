/* icons.js - line icons (24x24) drawn as inline SVG so they look the same on every phone. */
const P = {
  map: "M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7zM9 4v13M15 7v13",
  pin: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  check: "M5 12.5 10 17.5 19 7", plus: "M12 5v14M5 12h14", x: "M6 6l12 12M18 6 6 18",
  up: "M6 14l6-6 6 6", down: "M6 10l6 6 6-6", left: "M15 5l-7 7 7 7", right: "M9 5l7 7-7 7",
  move: "M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  hotel: "M3 20V6M3 12h18v8M21 12V9a2 2 0 0 0-2-2h-8v5M7 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  plane: "M2.5 13.5 21 4l-5 16-4.5-6.5zM11.5 13.5 21 4",
  star: "M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z",
  nav: "M4 11 20 4l-7 16-2-7z", ext: "M14 4h6v6M20 4 10 14M18 14v5H5V6h5",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  file: "M6 3h8l5 5v13H6zM14 3v5h5", filePlus: "M6 3h8l5 5v13H6zM14 3v5h5M12 11v6M9 14h6",
  sliders: "M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6",
  bell: "M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21a2 2 0 0 0 4 0",
  refresh: "M20 6v5h-5M4 18v-5h5M18.5 9A7 7 0 0 0 6 7.5M5.5 15A7 7 0 0 0 18 16.5",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4", clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4.5l3 1.5",
  utensils: "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-2.5 5-2.5 8h2.5v10M17 3v8",
  baby: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM5 21a7 7 0 0 1 14 0M10 8h.01M14 8h.01M10.5 10.5q1.5 1 3 0",
  route: "M6 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 16l8-6M8 16c4 4 10 2 10-2", arrowR: "M5 12h14M13 6l6 6-6 6",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3", unlock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.5-1.8",
  home: "M4 11 12 4l8 7v9h-5v-6H9v6H4z", sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16", shuffle: "M4 7h4l8 10h4M4 17h4l3-4M13 11l3-4h4M18 5l2 2-2 2M18 15l2 2-2 2",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12l2-1-1.5-3-2.2.5-1.3-1.3L16.5 5 13.5 3.5l-1 2h-1.8l-1-2L6.5 5l.5 2.2-1.3 1.3L3.5 8 2 11l2 1v1.8l-2 1L3.5 18l2.2-.5 1.3 1.3L6.5 21l3 1.5 1-2h1.8l1 2 3-1.5-.5-2.2 1.3-1.3 2.2.5 1.5-3-2-1z",
  puzzle: "M10 4h4v3a2 2 0 1 1 0 4v3h-3a2 2 0 1 0-4 0H4V8h3a2 2 0 1 0 3-4z", info: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 11v5M12 8h.01"
};
export function ic(name, size = 18, sw = 2) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", size); s.setAttribute("height", size);
  s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", sw);
  s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "ico");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", P[name] || P.pin); s.appendChild(p);
  return s;
}
export function ring(pct, size = 56) {
  const r = size / 2 - 5, c = 2 * Math.PI * r, NS = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", `0 0 ${size} ${size}`); s.setAttribute("width", size); s.setAttribute("height", size); s.setAttribute("class", "ring"); s.setAttribute("role", "img"); s.setAttribute("aria-label", `${pct}% visited`);
  const mk = (cls, extra) => { const e = document.createElementNS(NS, "circle"); e.setAttribute("cx", size / 2); e.setAttribute("cy", size / 2); e.setAttribute("r", r); e.setAttribute("class", cls); Object.entries(extra || {}).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
  s.append(mk("trk"), mk("val", { "stroke-dasharray": c, "stroke-dashoffset": c * (1 - pct / 100), transform: `rotate(-90 ${size / 2} ${size / 2})` }));
  const t = document.createElementNS(NS, "text"); t.setAttribute("x", size / 2); t.setAttribute("y", size / 2 + 4); t.setAttribute("text-anchor", "middle"); t.textContent = pct + "%"; s.append(t);
  return s;
}
