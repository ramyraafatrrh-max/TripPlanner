// Sends the morning alert of each trip day once the day's local time has reached the chosen alert time.
import fs from "node:fs";
const DIR = "data/alerts", STATE = "data/state/sent.json";
const sent = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = iso => { const d = new Date(iso + "T00:00:00Z"); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
function local(tz) {
  const o = {}; new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).forEach(p => { o[p.type] = p.value; });
  return { date: `${o.year}-${o.month}-${o.day}`, hm: `${o.hour}:${o.minute}` };
}
let count = 0;
for (const file of fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => f.endsWith(".json")) : []) {
  let trip; try { trip = JSON.parse(fs.readFileSync(`${DIR}/${file}`, "utf8")); } catch (e) { console.log("skip", file); continue; }
  for (const day of trip.days || []) {
    let now; try { now = local(day.tz || "UTC"); } catch (e) { continue; }
    const key = `${trip.id}:${day.date}`;
    if (now.date !== day.date || now.hm < (trip.notifyTime || "07:30") || sent[key]) continue;
    const res = await fetch(`https://ntfy.sh/${trip.topic}`, { method: "POST", body: trip.includeNames && day.title ? day.title : "Tap to open today's plan",
      headers: { Title: `Day ${day.n}: ${label(day.date)}`, Click: `${trip.appUrl}#/trip/${trip.id}/plan/${day.date}`, Tags: "airplane" } });
    if (res.ok) { sent[key] = Date.now(); count++; console.log("sent", key); } else console.log("failed", key, res.status);
  }
}
for (const k of Object.keys(sent)) if (Date.now() - sent[k] > 40 * 86400000) delete sent[k];
fs.mkdirSync("data/state", { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(sent, null, 1));
console.log(`${count} alert(s) sent`);
