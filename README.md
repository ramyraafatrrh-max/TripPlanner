# Trip Pilot

A phone-friendly web app that turns your travel PDFs into a living trip:

- **Upload** your itinerary PDF (plus optional hotel and flight PDFs) on the welcome page.
- The app **reads the PDF on your phone** (nothing is uploaded), builds the days and stops, then asks you to **name the trip**.
- Every trip appears under **Confirmed trips** on the welcome page.
- Inside a trip there are **3 tabs: Plan, Hotels, Flights**, with a travel transition between screens and a **Back** button on every page.
- **Plan tab**: pick a day, see the stops, tick **Visited** (progress bars update), open the **day route in Google Maps**, open a **place page** with your own notes from the PDF, summaries from Wikipedia/Wikivoyage, and one-tap links to TripAdvisor and other travel sites.
- **Rearrange**: select stops from any day, move them to another day or position, bring stops in from earlier or later days, move up or down, add or delete stops.
- **Morning alerts** on your phone with a link to that day's plan.

Everything is stored in your phone's browser (localStorage). There is no server and no account.

---

## 1. Put it online (GitHub Pages) - about 5 minutes

1. On github.com click **New repository**. Name it, for example, `trip-pilot`. Choose **Public** (GitHub Pages is free for public repositories). Create it.
2. Upload the files. Easiest: unzip this project on your computer, open the new repository, click **Add file > Upload files**, and **drag the contents of the unzipped folder** into the page (keep the folders `css`, `js`, `lib`, `icons`, `scripts`, `data`). Click **Commit changes**.
   - Hidden folders (those starting with a dot) can be skipped by some computers. After uploading, check that `.github/workflows/daily-alerts.yml` is in the repository. If it is missing, click **Add file > Create new file**, type `.github/workflows/daily-alerts.yml` as the name, paste the contents of the file from this project, and commit. Do the same for `.nojekyll` (an empty file) if it is missing.
3. Go to **Settings > Pages**. Under **Build and deployment** choose **Deploy from a branch**, branch **main**, folder **/(root)**, then **Save**.
4. Wait a minute. Your app is at `https://YOUR-USERNAME.github.io/trip-pilot/`.
5. Open that address **on your phone**. To install it: iPhone Safari **Share > Add to Home Screen**; Android Chrome **menu > Install app**.

> The app must be opened over `https://` (GitHub Pages does this). Opening `index.html` directly from a folder will not work because browsers block the PDF reader there.

## 2. Use it

1. On the welcome page choose your itinerary PDF (required) and any hotel or flight PDFs, then tap **Process my documents**.
2. Check the summary, change the trip name or start year if needed, tap **Create trip**.
3. **Plan** tab: choose a day chip. Tick **Visited** as you go. **Show route map** previews the route, **Open full route** opens it in Google Maps (long days are split in parts because Google allows 9 stops per link). **Next** opens directions to the next unvisited stop.
4. **Details & info** on a stop shows your PDF's notes, a map, web information and links. If the web summary is about the wrong place, edit the search term and tap Search.
5. **Hotels** and **Flights** tabs: read from your PDFs (best effort), always **editable**. The Plan tab shows which hotel and flights belong to each day.

### About the PDF you upload
- The reader is tuned for the itinerary format produced in this project (the Tokyo / Osaka / Hong Kong tables). It also reads the **Google Maps links inside the PDF**, so every stop lands on the exact place.
- Other PDFs are split by date headings as a fallback. Check the days after creating the trip.
- Scanned images or photos of documents cannot be read (there is no OCR). Use text PDFs, or add hotels and flights by hand.

### Google Maps
- Works with **no key**: route links, an embedded preview and place maps.
- For **numbered pins** on every stop, create a Google Maps API key (enable *Maps JavaScript API*, *Geocoding API* and *Maps Embed API*, restrict it to your site address) and paste it in **Trip settings > Google Maps**. This may cost money after Google's free monthly credit.

---

## 3. Morning alerts on your phone

Phones will not let a plain web page wake up and notify you with the app closed, so this app uses the free **ntfy** service plus an optional GitHub schedule.

1. Install the free **ntfy** app (App Store / Google Play).
2. In the app open **Trip settings** and copy the **topic** (a long random name). In ntfy tap **+** and subscribe to that topic. Treat the topic like a password.
3. Tap **Send test** in the app. Your phone should buzz. Tapping the notification opens that day's plan.

Then pick one way to send the daily alerts:

### Option A: GitHub schedule (recommended, works with the app closed)
1. On github.com open **Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token**. Choose **only this repository** and give **Contents: Read and write**. Copy the token.
2. In the app: **Trip settings > GitHub**: paste the token (your username and repository are detected automatically; fill them in if not). The token stays on your phone.
3. Tap **Sync alerts to GitHub**. This saves `data/alerts/<trip>.json` in your repository.
4. In the repository open the **Actions** tab and enable workflows if GitHub asks. The workflow **Daily trip alerts** runs every 15 minutes and sends each day's alert once, after your chosen time (default 07:30, in the local time of the place you are that day: Tokyo, Hong Kong and so on).
5. Re-sync after you rearrange days or change the alert time.
6. In **Settings > Actions > General > Workflow permissions** choose *Read and write permissions* if the "Remember what was sent" step fails.

**Privacy:** if your repository is public, anyone can read the alerts file. By default it contains **no place names**, only "Day 3: Sat 19 Dec, tap to open today's plan". The topic is in the file, so someone who finds it could send you spam messages. For real privacy use a private repository (GitHub Pages on private repositories needs a paid plan) or use Option B.

### Option B: queue from your phone (next 3 days)
ntfy can hold a message for up to 3 days. Open the app every few days and tap **Queue next 3 days**. Do not combine A and B or you will get two alerts.

### Option C: calendar reminders
**Download calendar (.ics)**, open it on your phone and your calendar app adds one reminder per day.

---

## Files

```
index.html               app page and the travel scene (sky, Mount Fuji, clouds)
css/style.css            look and feel, transitions
js/app.js                welcome page, new-trip flow, router
js/views-trip.js         Plan, Place, Hotels, Flights, Settings screens
js/ui.js                 back stack, page shell, sheets, plane transition
js/parser.js             reads the itinerary, hotel and flight PDFs
js/pdfloader.js          loads the bundled PDF reader
js/store.js              saves trips on the phone
js/places.js             Wikipedia / Wikivoyage lookups and travel-site links
js/maps.js               Google Maps links, embeds and optional pin map
js/notify.js             ntfy alerts, GitHub sync, calendar file
js/util.js               small helpers, time zones
lib/                     PDF.js (Apache-2.0) so the app works offline
sw.js, manifest.webmanifest, icons/    install on the home screen, offline use
scripts/send-alerts.mjs  the script the GitHub Action runs
.github/workflows/daily-alerts.yml   the daily schedule
data/alerts, data/state  where alert files and "already sent" records live
```

## Limits worth knowing
- **TripAdvisor** (and most travel sites) do not let a web page read their content, and their official data API needs a paid key and a server. The place page therefore pulls summaries from Wikipedia and Wikivoyage and gives one-tap links to TripAdvisor, Google reviews and others.
- Trips live in one browser on one phone. Clearing the browser's data deletes them. They do not sync between devices.
- The map preview without a key uses Google's public embed address, which Google can change; the "Open in Google Maps" buttons always work.
- Hotel and flight details read from PDFs depend on how each PDF is laid out. Always check them and tap Edit.
