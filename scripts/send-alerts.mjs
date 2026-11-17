// Runs on a GitHub schedule. Reads data/alerts/*.json (saved by the app) and sends each day's
// morning notification through ntfy.sh once the local alert time has passed.
// Sent notifications are remembered in data/state/sent.json so nothing is sent twice.
import fs from "node:fs";
import path from "node:path";

const ALERT_DIR = "data/alerts";
const STATE_FILE = "data/state/sent.json";
const DRY = process.env.DRY_RUN === "1";
const NOW = process.env.NOW_ISO ? Date.parse(process.env.NOW_ISO) : Date.now();
const WINDOW_MS = 12 * 3600 * 1000; // still send if the schedule ran late, up to 12 hours

function tzOffsetMinutes(tz, utcMs) {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const o = {};
  dtf.formatToParts(new Date(utcMs)).forEach(p => (o[p.type] = p.value));
  return (Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second) - utcMs) / 60000;
}
function zonedToUtc(dateISO, timeHM, tz) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = timeHM.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const utc = guess - tzOffsetMinutes(tz, guess) * 60000;
  return guess - tzOffsetMinutes(tz, utc) * 60000;
}

async function publish(body) {
  if (DRY) { console.log("DRY RUN, would send:", JSON.stringify(body)); return; }
  const res = await fetch("https://ntfy.sh/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`ntfy replied ${res.status}`);
}

if (!fs.existsSync(ALERT_DIR)) { console.log("No alerts folder yet. Nothing to do."); process.exit(0); }
const files = fs.readdirSync(ALERT_DIR).filter(f => f.endsWith(".json"));
if (!files.length) { console.log("No alert files yet. Open the app, go to Settings and tap 'Sync alerts to GitHub'."); process.exit(0); }

fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
const sent = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
let changed = false, sentCount = 0;

for (const f of files) {
  let alert;
  try { alert = JSON.parse(fs.readFileSync(path.join(ALERT_DIR, f), "utf8")); } catch (e) { console.warn("Skipping unreadable file", f); continue; }
  for (const day of alert.days || []) {
    const key = `${alert.tripId}|${day.date}|${alert.notifyTime}`;
    const at = zonedToUtc(day.date, alert.notifyTime || "07:30", day.tz || "UTC");
    if (NOW >= at && NOW < at + WINDOW_MS && !sent[key]) {
      try {
        await publish({ topic: alert.topic, title: day.title, message: day.message, click: day.click, tags: ["sunrise"] });
        sent[key] = new Date(NOW).toISOString();
        changed = true; sentCount++;
        console.log("Sent:", alert.tripName, day.date);
      } catch (e) { console.error("Could not send", key, e.message); }
    }
  }
}
// forget entries older than 90 days
for (const k of Object.keys(sent)) if (NOW - Date.parse(sent[k]) > 90 * 86400000) { delete sent[k]; changed = true; }
if (changed && !DRY) fs.writeFileSync(STATE_FILE, JSON.stringify(sent, null, 2) + "\n");
console.log(`Done. ${sentCount} notification(s) sent.`);
