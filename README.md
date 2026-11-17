# Trip Pilot

A phone-friendly web app that turns your travel PDFs into a living trip.

- **Welcome page**: upload your itinerary PDF (required) plus optional hotel and flight PDFs. The app reads them **on your phone** (nothing is uploaded), builds the trip, and asks you to name it. Every trip appears under **Confirmed trips**.
- **Three tabs inside a trip**: Plan, Hotels, Flights, with a flight-path transition between screens.
- **Back always goes where you expect**: the Back button on a trip tab takes you straight to the main page. On a place page or settings it returns to the plan, and a Home button takes you to the main page.
- **Add documents any time**: the file-plus button (top right of every trip screen), the banner on the Plan tab, and the Upload PDF buttons on the Hotels and Flights tabs let you add hotel or flight PDFs you forgot, or replace the itinerary. When you replace the itinerary your Visited ticks and notes are kept where a place has the same name.
- **Plan tab**: pick a day, tick **Visited** (progress rings and bars update), open the **day route in Google Maps**, open a **place page** with your PDF's notes, Wikipedia/Wikivoyage summaries and one-tap links to TripAdvisor and other travel sites.
- **Rearrange**: select stops from any day, move them to another day or position, bring stops in from earlier or later days, move up/down, add or delete stops.
- **Morning alerts** on your phone with a link to that day's plan.

Everything is stored in your phone's browser (localStorage). There is no server and no account.

---

## 1. Put it online (GitHub Pages), about 5 minutes

1. On github.com click **New repository**. Name it, for example, `trip-pilot`. Choose **Public** (GitHub Pages is free for public repositories). Create it.
2. Unzip this project on your computer, open the new repository, click **Add file > Upload files** and **drag the contents of the unzipped folder** into the page (keep the folders `css`, `js`, `lib`, `img`, `icons`, `scripts`, `data`). Click **Commit changes**.
   - Hidden items (names starting with a dot) are skipped by some computers. After uploading check that `.github/workflows/daily-alerts.yml` and `.nojekyll` are in the repository. If one is missing, use **Add file > Create new file**, type its path as the name, paste the contents from this project (`.nojekyll` can be empty), and commit.
3. Go to **Settings > Pages**. Under **Build and deployment** choose **Deploy from a branch**, branch **main**, folder **/(root)**, then **Save**.
4. Wait a minute. Your app is at `https://YOUR-USERNAME.github.io/trip-pilot/`.
5. Open that address **on your phone**. To install it: iPhone Safari **Share > Add to Home Screen**; Android Chrome **menu > Install app**.

> The app must be opened over `https://` (GitHub Pages does this). Opening `index.html` straight from a folder will not work because browsers block the PDF reader there.

## 2. Use it

1. Welcome page: choose your itinerary PDF, optionally hotel and flight PDFs, tap **Process my documents**.
2. Check the summary, edit the trip name or start year, tap **Create trip**.
3. **Plan** tab: choose a day tile. Tick the circle on a stop when you have visited it. **Route map** previews the route, **Open route** opens it in Google Maps (long days are split in parts because Google allows 9 stops per link). **Next** opens directions to the next unvisited stop.
4. **Details** on a stop shows your PDF's notes, a map, web information and links. If the web summary is about the wrong place, edit the search term and tap Search.
5. **Hotels** and **Flights** tabs are read from your PDFs (best effort) and always **editable**. The Plan tab shows which hotel and flights belong to each day.

### About the PDF you upload
- The reader is tuned for the table itinerary format produced in this project (Date / Location / Maps link / Transit / Activity / Baby notes / Eats). It also reads the **Google Maps links inside the PDF**, so each stop lands on the exact place.
- Other PDFs are split by date headings as a fallback. Check the days after creating the trip.
- Scanned images or photos cannot be read (there is no OCR). Use text PDFs, or add hotels and flights by hand.

### Pictures
The app uses general travel scenes (a flight above the clouds, a lagoon, an alpine lake, an old harbour, desert dunes, a starry camp). Each trip gets one automatically and you can change it in **Trip settings > Cover picture**. To use your own photos, replace the files in `img/` (keep the same names, about 1000 px wide).

### Google Maps
- Works with **no key**: route links, an embedded preview and place maps.
- For **numbered pins** on every stop, create a Google Maps API key (enable *Maps JavaScript API*, *Geocoding API* and *Maps Embed API*, restrict it to your site address) and paste it in **Trip settings > Google Maps**. This may cost money after Google's free monthly credit.

---

## 3. See your trips on another phone (share link)

A trip you create lives in the browser of the phone that made it. To see it on a second phone, create a **share link** once:

1. On the phone that holds the trips, open the welcome page, scroll to **Share and sync**, tap **Create share link**.
2. Paste a GitHub token (**Settings > Developer settings > Fine-grained tokens**, only this repository, **Contents: Read and write**), your GitHub username and the repository name. Tap **Create link**.
3. Send the link to your other phone (Copy or Share) and open it there. Tap **Add to this phone**.

From then on:
- The second phone shows **all** your trips, marked *Shared*, and refreshes them every time you open the app (or tap *Refresh now*).
- Whenever you change something on the first phone (a trip, a rearranged day, a new hotel, the cover) it syncs by itself a few seconds later.
- **Each phone keeps its own Visited ticks and notes.** If the owner changes the plan, those changes replace edits made to the shared trips on the other phone.
- Only the phone that created the link can change what is shared. The other phones are viewers.

**Privacy:** your trips are encrypted on the phone (AES-256) before they are stored in your repository as an unreadable file, and the key is only inside the link. Someone browsing your repository cannot read your plans. Anyone who has the link can, so send it only to people you trust. **Stop sharing** deletes the stored file and the link stops working; phones that already joined keep their copies.

No GitHub? Use **Export file** on one phone, send the file (AirDrop, email, chat) and tap **Import a trip file** on the other. That copies the trips once and does not stay in sync.

---

## 4. Morning alerts on your phone

Phones will not let a plain web page wake up and notify you with the app closed, so this app uses the free **ntfy** service plus an optional GitHub schedule.

1. Install the free **ntfy** app (App Store / Google Play).
2. In the app open **Trip settings**, copy the **topic** (a long random name). In ntfy tap **+** and subscribe to it. Treat the topic like a password.
3. Tap **Send test**. Your phone should buzz. Tapping the notification opens that day's plan.

Then pick one way to send the daily alerts:

### Option A: GitHub schedule (recommended, works with the app closed)
1. On github.com open **Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token**. Choose **only this repository** and give **Contents: Read and write**. Copy the token.
2. In the app, **Trip settings > GitHub**: paste the token (username and repository are detected automatically; fill them in if not). The token stays on your phone.
3. Tap **Sync alerts to GitHub**. This saves `data/alerts/<trip>.json` in your repository.
4. In the repository open the **Actions** tab and enable workflows if asked. **Daily trip alerts** runs every 15 minutes and sends each day's alert once, after your chosen time (default 07:30, in the time zone of the place you are that day; you can pick a fixed zone in Trip settings).
5. Re-sync after you rearrange days or change the alert time.
6. If the "Remember what was sent" step fails, go to **Settings > Actions > General > Workflow permissions** and choose *Read and write permissions*.

**Privacy:** if your repository is public, anyone can read the alerts file. By default it contains **no place names**, only "Day 3: Sat 19 Dec, tap to open today's plan". The ntfy topic is in the file, so someone who finds it could send you spam messages. For real privacy use a private repository (GitHub Pages on private repositories needs a paid plan) or use Option B.

### Option B: queue from your phone (next 3 days)
ntfy can hold a message for up to 3 days. Open the app every few days and tap **Queue next 3 days**. Do not combine A and B or you will get two alerts.

### Option C: calendar reminders
**Download calendar (.ics)**, open it on your phone and your calendar app adds one reminder per day.

---

## 5. Updating an app you already uploaded

Replace everything **except** the four dot-files (`.github/workflows/daily-alerts.yml`, `.nojekyll`, `data/alerts/.gitkeep`, `data/state/.gitkeep`), which did not change. Add the new files `js/share.js`, `js/shareui.js` and the new `img/` pictures, and delete the old `img/fuji.jpg`, `img/tokyo.jpg`, `img/kyoto.jpg`, `img/hk.jpg`. Trips already on a phone are kept.

---

## Files

```
index.html               app page and the photographic backdrop
css/style.css            look and feel, transitions
js/app.js                welcome page, new-trip flow, router
js/views-trip.js         Plan, Place, Hotels, Flights, Settings screens
js/docs.js               add or replace documents after the trip exists
js/ui.js                 navigation, page shell, sheets, plane transition
js/icons.js              line icons and progress ring
js/parser.js             reads the itinerary, hotel and flight PDFs
js/pdfloader.js          loads the bundled PDF reader
js/store.js              saves trips on the phone
js/places.js             Wikipedia / Wikivoyage lookups and travel-site links
js/maps.js               Google Maps links, embeds and optional pin map
js/notify.js             ntfy alerts, GitHub sync, calendar file
js/share.js              encrypted share link: save, load and merge trips
js/shareui.js            share card, setup sheet and the join page
js/util.js               small helpers, time zones
lib/                     PDF.js (Apache-2.0) so the app works offline
img/                     six general travel pictures used as backdrops and covers
sw.js, manifest.webmanifest, icons/    install on the home screen, offline use
scripts/send-alerts.mjs  the script the GitHub Action runs
.github/workflows/daily-alerts.yml   the daily schedule
data/alerts, data/state  where alert files and "already sent" records live
```

## Limits worth knowing
- **TripAdvisor** (and most travel sites) do not let a web page read their content, and their official data needs a paid key and a server. The place page therefore pulls summaries from Wikipedia and Wikivoyage and gives one-tap links to TripAdvisor, Google reviews and others.
- Without a share link, trips live in one browser on one phone. Clearing the browser's data deletes them.
- The map preview without a key uses Google's public embed address, which Google can change; the "Open in Google Maps" buttons always work.
- Hotel and flight details read from PDFs depend on how each PDF is laid out. Always check them and tap Edit.
