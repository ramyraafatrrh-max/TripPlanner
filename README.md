# Trip Pilot (modular)

A phone web app for any trip. Upload your itinerary, hotel bookings and flights (PDF), get a day-by-day route on Google Maps, tick places as you visit them, add new places (the app reorders the day for the least travel), and get a morning alert with a link to the day's plan. Everything is read on the phone; nothing is uploaded.

---

## 1. Put it online (GitHub Pages)

1. Create a **public** GitHub repository and drag the **contents** of this folder into it (keep the folders). Make sure the hidden items uploaded: `.nojekyll` and `.github/workflows/daily-alerts.yml`.
2. **Settings > Pages > Deploy from branch > main / root**.
3. Open `https://YOUR-USERNAME.github.io/REPO/` on your phone. Add it to the Home Screen (iPhone: Share > Add to Home Screen; Android: menu > Install app).

## 2. What is modular now

Every feature is its own folder in `js/modules/<name>/`. The app loads them one by one from the list in **`js/config.js`**. A module that fails or is switched off is skipped; the rest keeps working (see **Home > gear icon > Modules**, which shows each module's version and state and lets you switch one off).

**To change one feature, replace only that module's files on GitHub.** You never re-upload the whole app, and `sw.js` needs no change: it fetches app files fresh whenever you are online, and keeps a copy for offline.

| You want to change... | Edit only |
|---|---|
| How **hotel PDFs** are read | `js/modules/parsers/hotel.js` |
| How **flight PDFs** are read | `js/modules/parsers/flight.js` |
| How the **itinerary PDF** is read into days and places | `js/modules/parsers/itinerary.js` |
| The **Add places** sheet, edit sheet, route reordering | `js/modules/places/` (`add.js`, `edit.js`, `optimize.js` = the shortest-route maths, `geo.js` = finding coordinates) |
| The **Plan** tab (days, ticks, route buttons) | `js/modules/plan/index.js` |
| The **Hotels** tab / **Flights** tab | `js/modules/hotels/index.js` / `js/modules/flights/index.js` |
| Google Maps links and directions | `js/modules/maps/index.js` |
| Uploading documents, naming a trip, re-uploading later | `js/modules/intake/index.js` |
| The home screen and Confirmed trips | `js/modules/welcome/index.js` |
| City photo banners | `js/modules/photos/index.js` |
| Morning alerts | `js/modules/alerts/index.js` (+ `scripts/send-alerts.mjs`, `.github/workflows/daily-alerts.yml`) |
| Sharing a trip by link / file | `js/modules/share/` |
| Live progress | `js/modules/live/index.js` |
| Colours, fonts, layout | `css/base.css` |
| Turn a module off or add one | `js/config.js` |

Rules that keep modules independent: a module talks to others only through **services** (`svc("maps")`, `svc("places")`, ...) and the **event bus**, never by importing another module. Shared tools live in `js/core/` (router, store, UI, DOM helpers) and rarely change. To add a feature, create `js/modules/mything/index.js` that exports `default { id, version, title, init(ctx) }`, register routes/tabs/settings in `init`, and add `"mything"` to `config.js`.

## 3. Add places and the least-travel reorder

On a day tap **Add place** (or the **+** at the top of any trip):

- type a **name**, and/or paste a **Google Maps link** (the place opens from your link whenever you tap its name or "My link"). Long links are read for name and exact coordinates. Short `maps.app.goo.gl` links cannot be read by a web page, so type the name too; the link still opens in Google Maps.
- add **several places** at once ("Add another place", or **Paste a list**, one per line, "name | link").
- pick the day, or tap **Suggest the best day** (it compares extra travel for every day; the first time it looks up each place, about a second each).
- choose **Reorder the whole day for the least travel** (default), **Keep my order and insert where it adds the least travel**, or **Add at the end**.

The route length is straight-line distance between places, starting from your hotel when its location is known. It is not travel time, so a chosen order is a very good start, not a timetable. **Pin** a stop (rearrange mode) to keep it in its slot; a pinned first or last stop stays first or last. Reordering clears the clock time of stops that moved, and **Undo** is offered straight afterwards. The **Shortest route** button does the same for an existing day.

Place coordinates come from your link, a booking's GPS, or a free OpenStreetMap search by name (remembered on the phone). Places without a location stay where they are; tap **Edit** and paste a link or type `35.6586, 139.7454` to fix one.

## 4. Hotel PDFs

The hotel reader was written against real Booking.com confirmations. It reads: name (even Japanese-only), address, phone, **GPS** (converted to exact map coordinates for Directions), check-in and check-out dates (the **year is worked out from the weekday**, since these PDFs print none), check-in window, nights, confirmation number, PIN code, room, guests, total price, free-cancellation deadline and special requests. Hotels from other sites use a simpler fallback. If something cannot be read, the app asks you to confirm or fill it in (the empty field is outlined). Re-adding a hotel updates it instead of duplicating it. Scanned PDFs and photos cannot be read.

## 5. Morning alerts

The free **ntfy** app delivers them (a web page cannot wake a phone by itself). In the app: Trip settings > Morning alerts. Subscribe to the topic in ntfy, tap Send test, then either **sync to GitHub** (best: the included Action sends each day's alert at your time even with the app closed; needs a fine-grained token with *Contents: Read and write* on this repository only), **queue the next 3 days**, or download the **calendar file**. If your repository is public, leave "Include place names" off: the alerts file is readable by anyone.

## 6. Sharing a trip

Open a trip > the **link** button. The whole plan is inside the link (no account). A link is a copy from that moment; copy a new one after changes. Hotel confirmation numbers, PIN codes and flight references are left out unless you tick the box. **Live progress** (Visited ticks shared between phones) uses a private encrypted room per trip: your own Cloudflare Worker if you set one up (`worker/worker.js`, steps at the top of the file; paste its address into `js/config.js` as `live.endpoint`), otherwise two free public services. Always run **Test connection** first.

## 7. Limits

- Trips live in the browser of one phone unless you share them. Clearing browser data deletes them.
- Not tested here: real phones, real GitHub Pages, real Google Maps, and the free public sync services.
- The itinerary reader is tuned to table layouts (a header row such as Date | How to get there | Stops | Eat | Baby, one row per day or per stop). Other layouts fall back to splitting at date headings, so check the places.
- The Google Maps preview and route links need an internet connection.

## Files

```
index.html  manifest.webmanifest  sw.js
css/base.css
js/config.js   js/boot.js
js/core/       registry, bus, dom, icons, util, store, router, ui, kernel
js/modules/    maps  places  photos  parsers  intake  welcome  plan  hotels  flights  alerts  share  live  settings
lib/           pdf.js (PDF reader engine)
img/           travel pictures and icons
scripts/send-alerts.mjs   .github/workflows/daily-alerts.yml   data/alerts   data/state
worker/worker.js          (optional sync server)
```
