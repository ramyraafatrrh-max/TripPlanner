# Trip Pilot

A phone-friendly web app that turns your travel PDFs into a living trip.

- **Welcome page**: upload your itinerary PDF (required) plus optional hotel and flight PDFs. The app reads them **on your phone** (nothing is uploaded), builds the trip, and asks you to name it. Every trip appears under **Confirmed trips**.
- **Three tabs inside a trip**: Plan, Hotels, Flights, with a flight-path transition between screens.
- **Back always goes where you expect**: the Back button on a trip tab takes you straight to the main page. On a place page or settings it returns to the plan, and a Home button takes you to the main page.
- **Add documents any time**: the file-plus button (top right of every trip screen), the banner on the Plan tab, and the Upload PDF buttons on the Hotels and Flights tabs let you add hotel or flight PDFs you forgot, or replace the itinerary. When you replace the itinerary your Visited ticks and notes are kept where a place has the same name.
- **Plan tab**: pick a day, tick **Visited** (progress rings and bars update), open the **day route in Google Maps**, open a **place page** with your PDF's notes, Wikipedia/Wikivoyage summaries and one-tap links to TripAdvisor and other travel sites.
- **Rearrange**: select stops from any day, move them to another day or position, bring stops in from earlier or later days, move up/down, add or delete stops.
- **Photos of your cities** on every trip banner, found automatically (Wikipedia / Wikimedia Commons), with credits.
- **Share a trip with a link** and optionally **live progress**: everyone with the link sees each other's ticks. No account, no GitHub for your users.
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

### Banner pictures
- **Automatic city photos (default).** The app reads the cities from your itinerary (for example the section headings *Tokyo*, *Hong Kong*), finds a photo of each on Wikipedia or Wikimedia Commons, and shows them as a slideshow in the trip banner with a chip per city. The photo of the city you are in that day comes first, and the same photo is used as the background. If Wikipedia's lead image is a flag or a map, the app skips it and looks for a skyline photo on Commons.
- **Fix the cities.** In **Trip settings > Banner pictures** you can remove a city, add one (type *Lisbon* and press Enter) or tap *Detect from my itinerary*. A green tick means a photo was found; an amber chip means none was (the banner then uses a general picture).
- **Pick a fixed picture instead** from six general travel scenes in the same card.
- **Credits.** Each photo shows its author and licence in a small line on the banner; tap it for the full file page. Photos are free-licence images from Wikimedia (mostly CC BY-SA or CC BY), loaded straight from Wikimedia and remembered on the phone.
- Your own picture files live in `img/` (the six general scenes). Replace them (about 1000 px wide, same names) to change the fallback pictures.

### Google Maps
- Works with **no key**: route links, an embedded preview and place maps.
- For **numbered pins** on every stop, create a Google Maps API key (enable *Maps JavaScript API*, *Geocoding API* and *Maps Embed API*, restrict it to your site address) and paste it in **Trip settings > Google Maps**. This may cost money after Google's free monthly credit.

---

## 3. See a trip on another phone

### The simple way: a link with the plan inside (no GitHub, no token)
1. Open the trip, tap the **link button** at the top (or **Share this trip** in Trip settings).
2. Choose how much detail to include, then **Copy link** or **Share...** and send it to your other phone (message, email, notes).
3. Open the link on the other phone and tap **Add to this phone**. The trip works offline once added.

The whole plan is packed into the link itself (the part after the `#`, which browsers never send to a server), so nothing is stored anywhere.

- **Link length:** a big itinerary makes a long link. The sheet shows the real length of each option: *Full details*, *Shorter descriptions* and *Names and map places only* (dates, places, map searches, hotels and flights). It picks the richest option under about 6,000 characters. Some chat apps cut very long links, so if the other phone says the link is incomplete, choose a shorter option, send the link by email or notes, or use **Save as file** and **Import a trip file** (that keeps every detail).
- **Private things are left out:** your Visited ticks, notes, and the alert topic never go into the link. Hotel confirmation numbers and flight booking references are left out unless you tick the box.
- **A link is a copy from that moment.** If you change the plan, copy a new link and open it on the other phone: it updates the same trip there and keeps that phone's ticks and notes.
- Anyone who has the link can read the plan, so send it only to people you trust.

### Live progress: everyone sees each other's ticks (no GitHub, no token for your users)
1. Open the trip, tap the link button, and tick **Share progress live**. The app creates a private room for that trip by itself (a random ID, no sign-up) and stores your ticks there, encrypted.
2. Send the link. Everyone who opens it and taps *Add to this phone* joins the same room.
3. From then on, a tick or un-tick on any phone appears on the others within seconds (while the app is open), and ticks made offline are shared when the phone is back online. Each place keeps its newest change.

Notes:
- **Only ticks are shared.** Notes, alert settings and the plan itself are not. If someone changes the plan, send a fresh link.
- **Anyone with the link can tick places**, and can read the progress. Send it only to people you trust.
- **Privacy:** the progress is encrypted (AES-256) before it leaves the phone; the key exists only inside the link, so the storage service sees an unreadable blob.
- Use **Test connection** in the share sheet to check, step by step, that the sync service works from your phone.

**Where the rooms live.** By default the app uses the free public service **jsonstorage.net**, which needs no account. It is a third-party service: it can change its limits or disappear, and I could not test it from where I built this, so run *Test connection* on a real phone first. If it ever stops working, ticks stay safe on each phone; only the live sharing stops.

**Recommended for a real app: your own tiny sync server (free, 5 minutes, once).** Your users still need no account; only you, the app owner, set it up:
1. In your Cloudflare account (free): **Workers & Pages > KV > Create a namespace** called `trip-rooms`.
2. **Workers & Pages > Create > Worker**, paste the contents of `worker/worker.js`, deploy.
3. In the Worker: **Settings > Bindings > Add > KV namespace**, variable name `ROOMS`, namespace `trip-rooms`.
4. Copy the Worker address (`https://something.workers.dev`) into `js/config.js` as `endpoint`, re-upload `config.js`.
New trips then use your server automatically. Cloudflare's free KV plan has daily limits (about 1,000 writes a day at the time of writing; check their current limits). That is plenty for a few people ticking places, but a large user base needs a paid plan or a different store. KV can also take up to about a minute to show a change to a phone in a very different location.

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

The old GitHub-based live sync is gone (live progress replaces it). Replace everything **except** the four dot-files (`.github/workflows/daily-alerts.yml`, `.nojekyll`, `data/alerts/.gitkeep`, `data/state/.gitkeep`), which did not change. Add the new files `js/live.js`, `js/backend.js`, `js/config.js`, `js/secure.js`, `js/photos.js`, `js/banner.js`, `js/link.js`, `js/shareui.js` and the `worker/` folder (optional), and delete the old `img/fuji.jpg`, `img/tokyo.jpg`, `img/kyoto.jpg`, `img/hk.jpg`. Trips already on a phone are kept.

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
js/link.js               trip-in-a-link sharing (no server, no token)
js/live.js               live progress: merge ticks between phones
js/backend.js            where the encrypted progress is stored (free public store or your Worker)
js/config.js             the one file you edit to point at your own sync server
js/secure.js             encryption helpers
js/photos.js             city photos from Wikipedia / Wikimedia Commons
js/banner.js             the photo slideshow banner
js/share.js              save / import a trip as a file
worker/worker.js         optional sync server for Cloudflare Workers
js/shareui.js            share card, setup sheet and the join page
js/util.js               small helpers, time zones
lib/                     PDF.js (Apache-2.0) so the app works offline
img/                     six general travel pictures (fallback covers)
sw.js, manifest.webmanifest, icons/    install on the home screen, offline use
scripts/send-alerts.mjs  the script the GitHub Action runs
.github/workflows/daily-alerts.yml   the daily schedule
data/alerts, data/state  where alert files and "already sent" records live
```

## Limits worth knowing
- **TripAdvisor** (and most travel sites) do not let a web page read their content, and their official data needs a paid key and a server. The place page therefore pulls summaries from Wikipedia and Wikivoyage and gives one-tap links to TripAdvisor, Google reviews and others.
- Without a share link, trips live in one browser on one phone. Clearing the browser's data deletes them.
- **Not tested against the real services.** I built and tested live progress and the city photos against local stand-ins that follow the services' documented behaviour (jsonstorage.net, Wikipedia, Wikimedia Commons, Cloudflare Workers). Photo caching by the service worker and the real services themselves still need a check on a real phone: use *Test connection*, and open a trip to see whether the city photos appear.
- City photos need an internet connection the first time; after that the images are remembered on the phone.
- The map preview without a key uses Google's public embed address, which Google can change; the "Open in Google Maps" buttons always work.
- Hotel and flight details read from PDFs depend on how each PDF is laid out. Always check them and tap Edit.
