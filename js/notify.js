/* notify.js - morning alerts. Three layers, so something always works:
   1) ntfy.sh push to the phone, scheduled by a GitHub Action (works with the app closed)
   2) ntfy.sh push scheduled directly from this device for the next 3 days
   3) a calendar (.ics) file with morning reminders
   plus a local notification when the app is opened. */
import { settings, save, dayTitle } from "./store.js";
import { zonedToUtc, fmtDate, shortStopName, pad } from "./util.js";

const NTFY = "https://ntfy.sh/";
export function appBase() { return location.origin + location.pathname.replace(/index\.html$/, ""); }
export function dayLink(trip, date) { return `${appBase()}#/trip/${trip.id}/plan/${date}`; }
export function dayMessage(trip, day, n) {
  const lines = day.stops.slice(0, 6).map((s, i) => `${i + 1}. ${shortStopName(s.name)}`);
  if (day.stops.length > 6) lines.push(`+ ${day.stops.length - 6} more`);
  return { title: `Day ${n}: ${fmtDate(day.date)} - ${dayTitle(day)}`.slice(0, 120), message: (lines.length ? lines.join("\n") : "Free day") + "\n\nTap to open today's plan." };
}
export async function publish(body) {
  const res = await fetch(NTFY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("ntfy replied " + res.status);
  return res.json().catch(() => ({}));
}
export function topicUrls(trip) { const t = trip.settings.topic; return { web: `https://ntfy.sh/${t}`, app: `ntfy://ntfy.sh/${t}` }; }
export async function sendTest(trip) {
  const day = trip.days[0];
  return publish({ topic: trip.settings.topic, title: `Test: ${trip.name}`, message: "Phone alerts are working. Tap to open your plan.", click: day ? dayLink(trip, day.date) : appBase(), tags: ["airplane"] });
}
export async function scheduleUpcoming(trip) {
  const now = Date.now();
  let count = 0;
  for (let i = 0; i < trip.days.length; i++) {
    const d = trip.days[i];
    const at = zonedToUtc(d.date, trip.settings.notifyTime, d.tz);
    if (at < now + 15000 || at > now + 71 * 3600000) continue;
    const key = `${d.date}@${trip.settings.notifyTime}`;
    if (trip.settings.scheduled[key]) continue;
    const m = dayMessage(trip, d, i + 1);
    await publish({ topic: trip.settings.topic, title: m.title, message: m.message, click: dayLink(trip, d.date), tags: ["sunrise"], delay: String(Math.floor(at / 1000)) });
    trip.settings.scheduled[key] = at;
    count++;
  }
  save();
  return count;
}
export function localMorningNotice(trip, todayDay, n) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const key = "shown-" + trip.id + "-" + todayDay.date;
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, "1");
  const m = dayMessage(trip, todayDay, n);
  navigator.serviceWorker?.ready.then(reg => reg.showNotification(m.title, { body: m.message, data: { url: dayLink(trip, todayDay.date) }, icon: "icons/icon-192.png" }))
    .catch(() => new Notification(m.title, { body: m.message }));
}
export function alertsJson(trip) {
  const names = !!trip.settings.includeNames;
  return JSON.stringify({
    version: 1, tripId: trip.id, tripName: names ? trip.name : "trip", topic: trip.settings.topic, notifyTime: trip.settings.notifyTime, base: appBase(),
    days: trip.days.map((d, i) => {
      const m = dayMessage(trip, d, i + 1);
      return { date: d.date, tz: d.tz, title: names ? m.title : `Day ${i + 1}: ${fmtDate(d.date)}`, message: names ? m.message : "Good morning! Tap to open today's plan.", click: dayLink(trip, d.date) };
    })
  }, null, 2);
}
function b64(str) { return btoa(unescape(encodeURIComponent(str))); }
export function repoInfo() {
  const s = settings();
  let owner = s.ghOwner, repo = s.ghRepo;
  if ((!owner || !repo) && location.hostname.endsWith(".github.io")) { owner = owner || location.hostname.split(".")[0]; repo = repo || location.pathname.split("/").filter(Boolean)[0] || ""; }
  return { owner, repo };
}
async function gh(path, token, opts = {}) {
  return fetch("https://api.github.com" + path, Object.assign({ headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } }, opts));
}
export async function syncToGithub(trip) {
  const s = settings();
  const { owner, repo } = repoInfo();
  if (!s.ghToken) throw new Error("Add a GitHub token in Settings first.");
  if (!owner || !repo) throw new Error("Tell me your GitHub owner and repository name in Settings.");
  const path = `/repos/${owner}/${repo}/contents/data/alerts/${trip.id}.json`;
  let sha;
  const cur = await gh(path, s.ghToken);
  if (cur.ok) sha = (await cur.json()).sha;
  else if (cur.status !== 404) throw new Error("GitHub said " + cur.status + " (check the token and repository name).");
  const body = { message: `Update alerts for ${trip.name}`, content: b64(alertsJson(trip)) };
  if (sha) body.sha = sha;
  const put = await gh(path, s.ghToken, { method: "PUT", body: JSON.stringify(body) });
  if (!put.ok) throw new Error("GitHub said " + put.status + ": " + (await put.text()).slice(0, 160));
  return true;
}
export async function removeFromGithub(trip) {
  const s = settings();
  const { owner, repo } = repoInfo();
  if (!s.ghToken || !owner || !repo) return false;
  const path = `/repos/${owner}/${repo}/contents/data/alerts/${trip.id}.json`;
  const cur = await gh(path, s.ghToken);
  if (!cur.ok) return false;
  const sha = (await cur.json()).sha;
  const del = await gh(path, s.ghToken, { method: "DELETE", body: JSON.stringify({ message: `Remove alerts for ${trip.name}`, sha }) });
  return del.ok;
}
const esc = s => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
function fold(line) { const out = []; while (line.length > 73) { out.push(line.slice(0, 73)); line = " " + line.slice(73); } out.push(line); return out.join("\r\n"); }
const stamp = ms => { const d = new Date(ms); return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + "00Z"; };
export function buildICS(trip) {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Trip Pilot//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", fold("X-WR-CALNAME:" + esc(trip.name))];
  trip.days.forEach((d, i) => {
    const at = zonedToUtc(d.date, trip.settings.notifyTime, d.tz);
    const m = dayMessage(trip, d, i + 1);
    L.push("BEGIN:VEVENT", `UID:${trip.id}-${d.date}@trippilot`, "DTSTAMP:" + stamp(Date.now()), "DTSTART:" + stamp(at), "DTEND:" + stamp(at + 15 * 60000));
    L.push(fold("SUMMARY:" + esc(m.title)), fold("DESCRIPTION:" + esc(m.message + "\n" + dayLink(trip, d.date))), fold("URL:" + dayLink(trip, d.date)));
    L.push("BEGIN:VALARM", "ACTION:DISPLAY", fold("DESCRIPTION:" + esc(m.title)), "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
  });
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}
