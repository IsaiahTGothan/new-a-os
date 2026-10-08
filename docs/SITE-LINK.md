# New A OS ⇄ New A Site — the Site link (handoff)

> **Paste this whole file into a new conversation.** It explains how my local app (New A OS) and my website (New A Site) are paired, so you can help me set it up, use it, fix problems or extend it. Answer simply and step by step — I'm not a developer by trade. Every label and number below was checked against the code.

---

## 1. The big picture

| | New A OS | New A Site |
|---|---|---|
| What it is | One HTML file I open in Chrome or Edge on my computer — the Land Registry app (version **3.2.0**, schema 4 — round 3 plus the Site link) | A Next.js 15 website on Vercel: **https://newa-site.vercel.app** (repo `IsaiahTGothan/newa-site`, deploys from `main`) |
| Role | **The master.** Every building, road, border, business, official and chronicle entry is edited here | **The public copy** — New A's cloud, news and data relay to the internet |
| Where data lives | Inside the browser (IndexedDB `newa-registry`; the Site address and key in localStorage) — separate for each browser and browser profile — plus an optional "vault" folder on disk | **Upstash Redis** connected to the Vercel project (the stored registry, photos, the sync log, desk edits) plus the registry file bundled with each deploy (`data/Registry.json`) |

**Direction matters.** The website cannot reach into my computer — New A OS is a file in my browser, so nothing on the internet can pull from it. **New A OS pushes to the site** and reads the site's feed back. "Constantly" = New A OS's **Auto-publish while open** switch.

---

## 2. One-time setup

1. **The site side (Vercel).**
   - `DESK_PASSCODE` must be set (Settings → Environment Variables) — it is. Optional: `AGENT_TOKEN`, a separate key just for New A OS; if set, *it* is the access key instead of the passcode. A changed variable needs a redeploy.
   - **Upstash Redis must be connected** (Vercel → Storage), which sets `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_*`). Without it, publishes *look* successful but live only in temporary server memory and vanish.
2. **Get the current New A OS.** Older copies have no Site screen.
   - Open `https://newa-site.vercel.app/downloads/new-a-os.html` (or Mayor's Desk → Registry link → **Download New A OS**). It **downloads a file named `New-A-OS.html`** to the Downloads folder — it does not open in the tab.
   - Move it to where the old New A OS file is and replace the old file (rename it to the old name if you like).
   - Open it in the **same browser and the same profile** as always. Each browser/profile keeps its own data, so the same one sees everything as before. (Inside New A OS, Ctrl+S just saves the registry.)
3. **Link.** In New A OS click **Site** in the left bar, or press **S** from any screen except the Map (on the Map, S is the Select tool). The screen is headed **Site link**. Then:
   - **Site address:** `https://newa-site.vercel.app`
   - **Access key:** my desk passcode (or `AGENT_TOKEN` if set) — exact capitals
   - **Save & test** → the badge should read **CONNECTED** and a message says "Connected to newa-site.vercel.app — publishing and the manager are ready".
   - Other badges: **WRONG KEY** (retype it — but see the lockout in §8), **LINK OFF ON THE SITE** (no passcode/token set in Vercel), **NO KEY · READ ONLY** (key box left empty), **CAN'T REACH THE SITE**.
4. **First publish by hand.** **Publish to site**. If the site holds a copy this browser didn't publish, it asks "Replace the site's registry?" → **Publish this copy**.
5. **Photos and basemap.** **Push photos…** and **Push basemap…** (greyed out until a basemap exists in New A OS — add one on the map via Satellite, or Vault & settings → Basemap).
6. **Turn on Auto-publish while open.**

**Check:** newa-site.vercel.app/map shows every border, road and rotated lot; Mayor's Desk → Registry link shows **Live from New A OS**.

---

## 3. How "constant" sync works

- **Auto-publish while open:** about **45 seconds after edits stop**, New A OS publishes again (more edits push the timer back). It waits while offline and backs off on errors. It runs only while New A OS is open, and only after the first manual publish to that site.
- **Auto-publish pauses itself (badge PAUSED) when:**
  - the site's registry **changed outside this browser** — a revert, a desk upload, another computer, *or a new deploy that ships a `data/Registry.json` exported after my last publish* (see §4) → publish by hand once (**Publish this copy**);
  - an auto push would remove **more than half of all building records** (standing + historical, and more than 10) → the site holds it (409); confirm with a manual publish;
  - the **access key is refused** → fix it under Site link (Save & test until CONNECTED), then publish by hand;
  - the site **refused the file** (422 invalid / 413 too large) → fix what it lists; auto-publish tries again after the next edit (a manual publish would be refused the same way).
- **Photos and the basemap are never automatic** — push them by hand when they change. Push photos sends what the site lacks plus any photo replaced since the site got it. **Removing** a photo in New A OS does not remove it from the site — use the Mayor's Desk (the record's photo → **Remove photo**).
- **Reading back:** while the Site screen is open and the window is in front, New A OS re-reads `/api/feed` every **60 seconds** (stories, the city alert, the NASE market, politics, the Square, and the *number* of pending market moves). The market review queue itself loads through the agent API when connecting, opening the Site screen or opening Market — reopen Market to refresh it. The news inbox can also read `/feed.xml`.
- **Unchanged pushes** don't rewrite anything; a manual one is still logged.

---

## 4. Which copy the site reads — "the newest export wins"

- The site reads its **stored copy** (from a push or a desk upload) **only if it was exported at or after** the `data/Registry.json` bundled with the current deploy. Otherwise the bundled file wins and the stored copy is **ignored**.
- Every New A OS publish is stamped with the moment it's sent, so **Publish to site always takes over**.
- If a deploy ships a newer `data/Registry.json` than my last publish, the site switches to it, my pushed copy becomes "ignored" and Auto-publish pauses as "changed outside this browser" → **Publish to site** once by hand.
- Sending a file exported **before the bundled `data/Registry.json`** is refused (**409 stale**). The site does *not* compare against the copy it already stores — so uploading an older (but post-deploy) file at the desk still replaces a newer New A OS publish; publish from New A OS afterwards to take over again.
- An ignored old copy shows on the Mayor's Desk → Registry link as a yellow notice, **"An outdated registry is stored here and ignored."**, with **Clear the outdated copy…** → **Clear now**. (An old September `NewA.json` upload once made the live site show three rectangle districts and no roads; fixed in PR #2.)
- **Revert the site to its bundled registry…** (New A OS) or **Revert to bundled registry…** (desk) forgets the stored copy.
- **Desk edits** stay on top of whichever registry is read — removals and district/neighborhood edits always; a desk edit to a **building** wins only until New A OS changes that building again (then New A OS wins, keeping only the desk's tagline, blurb, tip and photo URL).

---

## 5. What gets sent — and what never leaves my computer

**Sent with Publish:** regions, districts (boroughs) and neighborhoods with polygon borders, buildings (lifecycle, lots incl. `lotRotated` and, from 3.2.0, drawn lot outlines `lot`), roads and tracks (from 3.2.0 with their dated shapes, `versions[].toYear/toHalf`), lines and stations (from 3.2.0 with hours, construction dates, costs, `partial` status and `transferIds`), businesses, tenancies, officials, projects, the chronicle archive, `settings.valuation` and `settings.fabricYear`.

**The public site does not draw the 3.2.0 additions yet** (drawn lot outlines, dated shapes, transfers, hours): its validator keeps them, and they show once the site's map learns them.

**Never sent:** app settings and keys (e.g. the AI key), the news inbox, world scans, the sandbox, embedded photos.

**Photos:** resized in the browser to at most 1400 px, JPEG under ~900 KB, sent 4 at a time; keyed by record id (`b_…`, `a_…`, …) and served at `/api/photo/<key>`.

**Basemap:** resized in the browser to at most 2400 px (WebP, under ~900 KB) and sent with its placement in blocks (`x z w h opacity`). The site holds **one** basemap; each push replaces it. With several, the dialog asks which (default: the one the map shows today).

---

## 6. The Site screen

Sections: **Dashboard · Publish · Newsroom · City Hall · Market**
- **Dashboard** — connection badge, what the site is reading (and whether its fingerprint matches my last publish), the live feed.
- **Publish** — Publish to site, Auto-publish while open, Push photos…, Push basemap…, Revert the site to its bundled registry…, the sync log.
- **Newsroom / City Hall / Market** — manager actions through the site's agent API: stories, city alerts, approval ratings, the market-move review queue (approve / edit / reject), official posts.

---

## 7. Endpoints (for debugging or building on it)

All answer cross-origin (CORS `*`), so the app works straight from a file. 🔑 = needs `Authorization: Bearer <access key>`.

| Method | Path | What |
|---|---|---|
| GET | `/api/registry` | Link status: `source` (`bundled` / `uploaded` / `registry-app`), `uploaded`, `exported`, `counts`, `hash`, `authorized`, `limits`, `ignored` (a stale stored copy, or null). `?full=1` adds the master |
| POST 🔑 | `/api/registry` | Publish `{ master, app, version, reason: "manual" \| "auto" }`, or `{ reset: true }`. Answers `changes` + `summary`. Limits: 8 MB of JSON by the site's check, but Vercel refuses bodies over 4.5 MB, and the gzipped copy must fit the store (~950 KB base64). New A OS gzips automatically (today ~372 KB → ~55 KB stored) |
| GET | `/api/registry/photos` | Photos the site has `{ have: { key: ts } }` + basemap placement |
| POST 🔑 | `/api/registry/photos` | `{ items: [{ key, dataUrl }] }` — at most 8 per request, 900 KB each, ~4 MB per request; key `basemap` also takes `x z w h opacity` |
| GET | `/api/feed` | Stories, market, politics, Square, alert, pending-move count, registry hash. `If-None-Match: <etag>` → 304 when unchanged. With the key, pending moves come in full |
| GET | `/feed.xml` | Newsroom as RSS (`?outlet=cnn` for one outlet) |
| GET | `/api/markets`, `/api/politics` | NASE prices; officials, approval, races |
| GET/POST 🔑 | `/api/agent` | Manager snapshot / actions: `story`, `alert`, `nudge`, `outlook`, `officialPost`, `content`, `photo`, `politics.*`, `market.*` (incl. `market.review`), `sync.*` |

**Rate limits:** 6 registry pushes and 40 photo requests per minute per address.

**Wrong-key lockout (per internet connection):** 10 failures in 15 min, or 50 in a day. While locked out, **even the correct key is refused** (New A OS shows WRONG KEY). One Save & test with a wrong key counts twice; wrong Mayor's Desk passcodes from the same connection count too.

**Errors New A OS shows:** 401 = key refused (wrong key, no key set on the site, or locked out) · 409 = held (big removal on auto) or stale · 413 = too large · 422 = registry failed validation (it lists why), or every photo in a batch was refused · 429 = too many requests, wait.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| No Site screen | Press S from any screen except the Map, or click **Site** in the left bar. No Site item at all → old copy, redo setup step 2 |
| **WRONG KEY** / "The site refused the access key" | Retype once, exactly (capitals). If `AGENT_TOKEN` is set in Vercel, use it instead of the passcode. If a key you know is right keeps failing, you're locked out — **stop retrying** and wait up to 15 min (up to 24 h after 50 failures); the desk sign-in says how long. A redeploy also clears it |
| **LINK OFF ON THE SITE** | No `DESK_PASSCODE` or `AGENT_TOKEN` on the site — set one in Vercel and redeploy |
| Auto-publish **PAUSED** | Read its message and follow §3 (most often: Publish to site once → **Publish this copy**) |
| Publish says done, but the site keeps going back to the bundled registry / sync log or photos vanish | Upstash Redis isn't connected — connect it in Vercel → Storage, redeploy, then Publish to site and Push photos… again |
| Site still shows old or missing data | Desk → Registry link: check the pill (Live from New A OS / Uploaded at the desk / Bundled registry); publish from New A OS. Yellow **"An outdated registry is stored here and ignored."** → publish, or **Clear the outdated copy…** → **Clear now**. One record/area still wrong → a desk removal or edit is overriding it (§4); undo it at the desk |
| New A OS opened but empty (and no saved Site address) | Opened in a different place — another browser, another profile, or a website tab. Open the saved file in the usual browser and profile, or import the vault's `Registry.json` |
| Photos / basemap missing on the site | Push photos… / Push basemap… (never automatic). Push basemap greyed out → add a basemap in New A OS first |
| Publish refused as **stale** | The file was exported before the site's bundled registry — publish from New A OS (fresh stamp) instead of uploading an old file |

---

## 9. Where things live (code)

**New A OS** is developed in `IsaiahTGothan/new-a-os` and built from parts:
- `app/parts/p30_site.js` — the Site link (`sl…` functions; constants `SL_AUTO_DELAY` 45 s, `SL_POLL_MS` 60 s, `SL_PHOTO_BATCH` 4), `app/parts/site_css.css` its styles; hooks in `p04_persist.js` (commit → `slOnCommit`), `p05_shell.js` (Site view), `p17_news.js` (feed / markets read back), `p19_interactions.js` (`S` key), `p24_clawson.js` (draft → newsroom), `p20_boot.js`.
- `python3 app/build.py` → `app/NewA-Land-Registry.html`; tests `node app/test.js` (section U runs the Site link against a stand-in site — the real one is never contacted).

**Publishing a new New A OS to the site's download:** copy `app/NewA-Land-Registry.html` from new-a-os over `registry-app/NewA-Land-Registry.html` in newa-site and deploy; `scripts/package-registry-app.js` serves it at `/downloads/new-a-os.html` with its version in `new-a-os.json`.

**The site** (`IsaiahTGothan/newa-site`):
- `lib/sync.js` — push, diff, reset, status, photos, push/photo rate limits, which key mode applies.
- `lib/desk.js` — desk passcode, the access-key check (`AGENT_TOKEN`, else `DESK_PASSCODE`) and the wrong-key lockout.
- `lib/registry.js` — reading the registry; `effectiveOverride` (newest export wins); desk-edit precedence.
- `lib/store.js` — Upstash Redis, or in-memory storage when Redis isn't connected.
- `lib/actions/sync.js` — the `sync.*` actions. Routes: `app/api/registry/route.js`, `app/api/registry/photos/route.js`, `app/api/feed/route.js`, `app/api/agent/route.js`.
- `components/desk/RegistryLinkPanel.js` — Mayor's Desk → Registry link. `README.md` → "Keeping the city current" has the full contract.

**Never paste the passcode or `AGENT_TOKEN` into chats or files.**
