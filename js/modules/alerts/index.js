/* alerts module: a morning notification with a link to that day's plan.
   A web page cannot wake a phone by itself, so delivery uses the free "ntfy" app. Three ways to schedule:
   A) a GitHub Action sends each day's alert at your chosen time (works with the app closed)   B) queue the next 3 days from this phone
   C) a calendar file (.ics) with a reminder on every day. */
import { h } from "../../core/dom.js";
import { ic } from "../../core/icons.js";
import * as store from "../../core/store.js";
import { toast } from "../../core/ui.js";
import { download, fmtDate, todayIn, COMMON_TZ, uid } from "../../core/util.js";

const NTFY = "https://ntfy.sh";
export const appBase = () => location.origin + location.pathname.replace(/index\.html$/, "");
const urlFor = (trip, day) => `${appBase()}#/trip/${trip.id}/plan/${day.date}`;
function message(trip, day, n) {
  const names = day.stops.slice(0, 3).map(s => s.name.replace(/\s*\(.*$/, "")).join(", ");
  return { title: `Day ${n}: ${fmtDate(day.date)}`, body: trip.settings.includeNames ? `${store.dayTitle(day)}${names ? " \u2014 " + names : ""}` : "Tap to open today's plan", click: urlFor(trip, day) };
}
async function publish(trip, m, delay) {
  const headers = { Title: m.title, Click: m.click, Tags: "airplane" }; if (delay) headers.Delay = delay;
  const r = await fetch(`${NTFY}/${trip.settings.topic}`, { method: "POST", body: m.body, headers });
  if (!r.ok) throw new Error("ntfy replied " + r.status);
}
function offsetMin(tz, date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(date).reduce((o, p) => { o[p.type] = +p.value; return o; }, {});
  return (Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second) - date.getTime()) / 60000;
}
function localToUtc(iso, hm, tz) {
  const [y, mo, d] = iso.split("-").map(Number), [hh, mm] = hm.split(":").map(Number), guess = new Date(Date.UTC(y, mo - 1, d, hh, mm));
  try { return new Date(guess.getTime() - offsetMin(tz, new Date(guess.getTime() - offsetMin(tz, guess) * 60000)) * 60000); } catch (e) { return guess; }
}
export function alertsJson(trip) {
  return JSON.stringify({ id: trip.id, name: trip.name, topic: trip.settings.topic, notifyTime: trip.settings.notifyTime, appUrl: appBase(), includeNames: !!trip.settings.includeNames,
    days: trip.days.map((d, i) => ({ date: d.date, tz: d.tz || "UTC", n: i + 1, title: trip.settings.includeNames ? store.dayTitle(d) : "" })) }, null, 1);
}
function buildICS(trip) {
  const pad = n => String(n).padStart(2, "0"), fmt = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  const esc = s => String(s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n"), lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Trip Pilot//EN", "CALSCALE:GREGORIAN"];
  trip.days.forEach((d, i) => {
    const m = message(trip, d, i + 1), start = localToUtc(d.date, trip.settings.notifyTime || "07:30", d.tz || "UTC");
    lines.push("BEGIN:VEVENT", `UID:${trip.id}-${d.date}@trippilot`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(new Date(start.getTime() + 1800000))}`, `SUMMARY:${esc(m.title + " \u00B7 " + trip.name)}`, `DESCRIPTION:${esc(m.body + "\n" + m.click)}`, `URL:${m.click}`, "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(m.title)}`, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
  });
  lines.push("END:VCALENDAR"); return lines.join("\r\n");
}
async function syncToGithub(trip) {
  const s = store.settings(), o = s.ghOwner, r = s.ghRepo, t = s.ghToken;
  if (!o || !r || !t) throw new Error("Fill in the GitHub username, repository and token first.");
  const url = `https://api.github.com/repos/${o}/${r}/contents/data/alerts/${trip.id}.json`, H = { Authorization: "Bearer " + t, Accept: "application/vnd.github+json" };
  let sha; const cur = await fetch(url, { headers: H }); if (cur.ok) sha = (await cur.json()).sha; else if (cur.status !== 404) throw new Error(cur.status === 401 ? "GitHub did not accept the token." : "GitHub replied " + cur.status);
  const body = { message: "Update alerts for " + trip.name, content: btoa(unescape(encodeURIComponent(alertsJson(trip)))) }; if (sha) body.sha = sha;
  const put = await fetch(url, { method: "PUT", headers: H, body: JSON.stringify(body) }); if (!put.ok) throw new Error("GitHub replied " + put.status + ". Check the token has Contents: Read and write on this repository.");
}
async function queueNext(trip) {
  let n = 0; const now = Date.now();
  for (const [i, d] of trip.days.entries()) {
    const at = localToUtc(d.date, trip.settings.notifyTime || "07:30", d.tz || "UTC").getTime(), key = d.date;
    if (at <= now + 30000 || at > now + 71 * 3600000 || trip.settings.scheduled[key] === at) continue;
    await publish(trip, message(trip, d, i + 1), String(Math.floor(at / 1000))); trip.settings.scheduled[key] = at; n++;
  }
  store.save(true); return n;
}

function card(trip) {
  const t = trip.settings, g = store.settings(), status = h("p", { class: "muted", "aria-live": "polite" });
  const run = (label, fn) => async () => { status.textContent = label + "\u2026"; try { status.textContent = (await fn()) || "Done."; } catch (e) { status.textContent = "Problem: " + e.message; } };
  const time = h("input", { type: "time", value: t.notifyTime, "aria-label": "Alert time" }); time.addEventListener("change", () => { t.notifyTime = time.value || "07:30"; t.scheduled = {}; store.save(); toast("Alert time saved. Sync again to update the schedule."); });
  const field = (k, ph, type = "text") => { const i = h("input", { type, value: g[k] || "", placeholder: ph, autocomplete: "off", "aria-label": ph }); i.addEventListener("change", () => { g[k] = i.value.trim(); store.save(true); toast("Saved"); }); return i; };
  const names = h("input", { type: "checkbox", checked: !!t.includeNames, onchange: e => { t.includeNames = e.target.checked; store.save(); } });
  const tz = h("select", { "aria-label": "Time zone" }, h("option", { value: "auto", selected: (t.tz || "auto") === "auto" }, "Follow the city of each day"), COMMON_TZ.map(z => h("option", { value: z, selected: t.tz === z }, z)));
  tz.addEventListener("change", () => { t.tz = tz.value; store.applyTz(trip); t.scheduled = {}; store.save(); toast("Time zone saved"); });
  return h("div", { class: "glass card" }, h("span", { class: "eyebrow" }, "Alerts"), h("h3", { style: { marginTop: "4px" } }, "Morning alerts on your phone"),
    h("p", { class: "muted" }, "Each morning you get a notification with a link to that day's plan, sent through the free ntfy service."),
    h("ol", null, h("li", null, "Install the free ", h("b", null, "ntfy"), " app."), h("li", null, "Subscribe to this topic: ", h("kbd", null, t.topic)), h("li", null, "Tap Send test, then choose how alerts are scheduled.")),
    h("label", { class: "field" }, "Send alerts at (local time of each day)"), time, h("label", { class: "field" }, "Time zone"), tz,
    h("div", { class: "row", style: { marginTop: "12px", gap: "8px" } }, h("a", { class: "btn small glass", href: `ntfy://subscribe/${t.topic}` }, "Open ntfy app"), h("a", { class: "btn small glass", href: `${NTFY}/${t.topic}`, target: "_blank", rel: "noopener" }, "ntfy web"),
      h("button", { class: "btn small glass", type: "button", onclick: () => { if (navigator.clipboard) navigator.clipboard.writeText(t.topic); toast("Topic copied"); } }, "Copy topic"),
      h("button", { class: "btn small gold", type: "button", onclick: run("Sending test", async () => { const d = trip.days.find(x => x.date >= todayIn(x.tz)) || trip.days[0]; await publish(trip, message(trip, d, trip.days.indexOf(d) + 1)); return "Test sent. Check your phone."; }) }, ic("bell", 15), "Send test")),
    h("hr", { class: "soft" }), h("span", { class: "eyebrow" }, "Option A \u00B7 best"), h("p", { style: { margin: "4px 0" } }, "GitHub schedule: works with the app closed."),
    h("label", { class: "pickrow" }, names, h("span", null, "Include place names in the alerts file")), h("p", { class: "muted small" }, "Leave this off if your repository is public: anyone could read the file."),
    h("label", { class: "field" }, "GitHub username"), field("ghOwner", "your GitHub username"), h("label", { class: "field" }, "Repository"), field("ghRepo", "repository name"), h("label", { class: "field" }, "Token (Contents: Read and write, this repository only)"), field("ghToken", "github_pat_\u2026", "password"),
    h("div", { class: "row", style: { gap: "8px", marginTop: "10px" } }, h("button", { class: "btn small green", type: "button", onclick: run("Saving to GitHub", async () => { await syncToGithub(trip); return "Saved. The Action sends the alerts at your chosen time each day."; }) }, "Sync alerts to GitHub"), h("button", { class: "btn small glass", type: "button", onclick: () => download(`${trip.id}.json`, alertsJson(trip), "application/json") }, "Download file")),
    h("hr", { class: "soft" }), h("span", { class: "eyebrow" }, "Option B"), h("p", { style: { margin: "4px 0" } }, "Queue the next 3 days from this phone."), h("button", { class: "btn small glass", type: "button", onclick: run("Scheduling", async () => { const n = await queueNext(trip); return n ? `${n} alert(s) queued.` : "Nothing new to queue in the next 3 days."; }) }, "Queue next 3 days"),
    h("hr", { class: "soft" }), h("span", { class: "eyebrow" }, "Option C"), h("p", { style: { margin: "4px 0" } }, "Calendar reminders."), h("button", { class: "btn small glass", type: "button", onclick: () => download(`${trip.name.replace(/[^\w]+/g, "_")}_reminders.ics`, buildICS(trip), "text/calendar") }, "Download calendar (.ics)"), status);
}
export default { id: "alerts", version: "2.0.0", title: "Morning alerts", description: "ntfy notifications with a link to each day's plan, GitHub schedule, and calendar file.",
  init(ctx) { ctx.settingsSection({ id: "alerts", scope: "trip", order: 40, render: card }); } };
