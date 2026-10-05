# NEW A — handoff for Claude Code

Written Oct 4 2026 after the Registry 2.5 build. This is the single document to hand to Claude Code before it touches anything: what exists, how it is built, what is verified, what is known to be wrong, what Isaiah ("Zay") wants next, and the rules that are not negotiable. Everything here was either built in this conversation or confirmed by reading the delivered code; the bug diagnoses below point at exact functions.

---

## 1. What exists right now

| Thing | Where | Notes |
|---|---|---|
| **Registry 2.5 app** | `NewA-Land-Registry-v2.5.html` (single file, ~845 KB, schema 3) | Delivered Oct 4 2026. Open from disk in Chrome / Edge / Brave. |
| **Registry 2.0 app** | `NewA-Land-Registry-v2.html` (schema 2) | Previous version, Sep 12 2026. Keep as archive. Do not run it against the upgraded store (same browser store, see §3). |
| **Source tree + tests** | `NewA-Registry-2.5-source.zip` | `parts/` (21 JS parts, body, two CSS files), `build.py`, `test.js` (96 checks), `smoke.js`, `shots-resp.js`, `v2-state.json` fixture. The HTML is a build output — work in the parts. |
| **Migration guide** | `Registry-2.5-Migration-Guide.md` | Upgrade steps, JSON changes, verified list, limitations. |
| **Registry data** | Isaiah's vault folder (wherever he linked it): `Registry.json` (master), `NewA.json` (2.0-shaped compat copy), `images/<id>.jpg`, `backups/` | 153 buildings (119 active, 34 historical H-numbered), 7 districts, 18 chronicle images, ~170 photos as of Oct 2026. Also the browser store (IndexedDB `newa-registry`). |
| **Public site** | https://newa-site.vercel.app · repo `IsaiahTGothan/newa-site` · local `C:\Users\Admin\Documents\newa-site` | Next.js on Vercel, Upstash Redis. Has a markets section, news feed at `/feed.xml`, Mayor's Desk. Isaiah says it is "mostly broken" (counts demolished as current, stale stats) — out of scope unless he asks. |
| **The New A Chronicle** | `C:\Users\Admin\Downloads\New-A-Chronicle_1.html` (also saved in the world folder) | Standalone dark-first HTML built Sep 14 2026 from the archaeology of the old saves: present-day city rendered block-by-block, 184 in-game maps dated by evidence, map wall, stratigraphy chart, Time Machine 2013→2026. Uses the blocky pixel font **Silkscreen** plus **Bricolage Grotesque** display, count-up number animations and sliders. Isaiah loves this look — V3 must study it. |
| **Live Minecraft world** | `C:\New A - 1.20.1 FORGE TEST 02\saves\The World - Full` | Forge 1.20.1, seed 8571177872742014628, one continuous lineage from the 2013 superflat "Mii A" world; 132k chunks; mods include MTR (transit), Galacticraft, devices-mod, a camera mod. **Read-only. Never write to it.** |
| **Old Mac saves** | `E:\Documents\Old Mac Minecraft Directory\saves\` | 2013–2016 era. Playable copies "New A 2013 Edition" / "New A 2016 Edition" were placed in `C:\Users\Admin\AppData\Roaming\.minecraft\saves`. |

---

## 2. Completed in this conversation

### 2.1 Registry 2.0 (Sep 12 2026) — "the historical record system"
Demolished buildings became first-class records (`H-MA-0001…`, immutable `id`, never renumbered); relationships by registration number (replaced_by / same_site_as / split / merged); parcels; a Historical tab (stats · records · parcels · chronicle); a 2013→present timeline with play; site history on every record; source / confidence / verified fields; statistics; safe migration with backups; the **Chronicle** of dated screenshots with descriptions stored in the JSON so an AI can read it. Saved to `NewA.json` / `OtherDistricts.json`.

### 2.2 Registry 2.5 (Oct 4 2026) — "one world record system"
Built from the ChatGPT-written brief plus Isaiah's notes. Everything below is in the delivered file and covered by the 96-check harness unless marked otherwise.

- **One master file.** `Registry.json` holds every jurisdiction and every era. `NewA.json` is now only a compatibility export of the New A City slice (toggle in Vault settings). Filtered exports (current / historical) are marked and can only merge, never replace. Legacy two-file imports are upgraded exactly like an in-place upgrade.
- **Safe upgrade 2→3.** Pre-upgrade copy kept as a labelled snapshot (`pre-upgrade · schema 2`) and downloadable (`NewA-Registry-PRE-2.5-backup-<date>.json`); first vault write copies old files to `backups/<name>.schema2.<date>.json`; upgrade report modal; every id, number, photo, relation preserved (verified on the real 153 records). `status` kept in sync as a derived summary (`summaryStatus`) so 2.0 readers keep working.
- **Jurisdictions.** `regions[]` above districts (union › state / federal district › city › region, `parentId`). Seeded: United States, New A (state), New A City (verified); New J and North C as **conflict** (district records kept under same-named regions, for Isaiah to resolve); Penn A **source-supported** (effective Late 2026, from the Oct 2 article); South C, V Beach, Chicago, Washington D.C. **unverified** placeholders. Add / edit through the UI. "NOT DRAWN YET" wherever polygons are empty.
- **Exact borders.** Polygons (multi-part, irregular, diagonal) drawn on the map; numeric vertex editing; self-intersection refused; containment report ("by the drawn borders this point lies in Man A"). Old rectangles converted to 4-vertex polygons.
- **Map workspace** (whole page): modes Select / Pan / Border / Road / Transit / Station / Place (S P B D L X A), snap grid, undo/redo, inspector dock (Inspector · Layers · Streets · Assistant), map search with X,Z jump, HUD.
- **Roads.** Drawn with the cursor (diagonals, `snap45`, staircase block counts), junctions derived with grade awareness (bridge = separated crossing), extend / split / join, rename keeps former names, deterministic **serving-road suggestion** labelled as a proximity suggestion, reviewable and overridable; checks say what was and was not examined.
- **Transit.** Tracks + lines (colour, style, width, status) + stations (station / complex / stop / entrance, `parentId`, `buildingId`), overlay show/hide, separate Transit dashboard, stop ordering, service state in playback.
- **Lifecycle.** `physical` (planned · construction · standing · closed · vacant-lot · demolished) separated from `market` and `landmark`; `yearStarted` / `yearExpected` / `yearBuilt` / `yearAltered` / `yearDemolished` each with an Early/Late half (`E` / `L` / ''); strict counting — a project is never "standing" early, undated records never appear as new, final step equals the strict completed count.
- **Animated history viewer** (popup): tweened half-year playback 2013→present, Early/Late + typable year, era ticks, speed, Follow, projection mode (labelled), layers (Borders · Neighborhoods · Roads · Transit · Ghosts · Labels · Grid), "What changed" list, chronicle card. Parcels feature removed from the UI (archived in `legacy.parcels`).
- **Businesses.** BZ- records: aliases, category, org type, parent/branches, status, ticker/listed flag, locations via `tenancies` (owner / tenant / developer / operator / anchor / hq, with periods), revenue per period with basis **recorded > estimated > simulated**, listings; revenue never double-counted across parent/branch; opt-in owner-name import.
- **Global search** (fuzzy, grouped, former numbers, aliases, roads, stations, businesses, events) and hover cards; opens on the map when on the map page.
- **News inbox.** RSS/Atom parse, dedupe by guid/link, revisions by hash, deterministic candidate extraction, conflict detection (verified / edited-after / demolished-vs-completion), apply with log + undo, opt-in auto-apply rules; honest failure when CORS blocks the live feed; file import and vault `feed.xml` paths. Never posts to the site.
- **Map assistant.** Deterministic intents (facts vs suggestions, Apply/Cancel previews). Optional OpenAI-compatible provider, off by default, key stored only in IndexedDB `handles.aiKey` — never in state, exports or the HTML.
- **Reliability.** Failed saves are visible (`SAVE FAILED` + backup action) and recover; autosave flushes on tab hide; labelled snapshots are never pruned.
- **Verification.** `node test.js` → 96/96 on the real data fixture; `node smoke.js` → 0 console/page errors across every view; visual pass at 1440 / 1024 / 390 px.

---

## 3. Architecture and conventions (read before editing)

**Single classic script.** Top-level `const`/`let`, no modules, no framework. The built file: CSS lines ~13–1336, body ~1338–1467, script ~1468–7066. Sections are marked with `§` banners (`§0 CONFIG … §20 BOOT`) that correspond one-to-one with `parts/p00…p20`. Rebuild with `python3 build.py` (runs `node --check` first).

**Key globals.** `S` (state), `UI` (nav, scope, filters, layers), `MAPW` (map workspace), `HV` (history viewer), `DR` (drawer), `SAVE` / `VAULT` / `MIGRATION` / `NEWS` / `ASST`, `APP = { version:'2.5.0', schema:3, feedUrl }`, `DB_NAME='newa-registry'`.

**Storage.** IndexedDB stores: `state` (key `main`), `images` (by owner id: building / archive / business), `handles` (vault dir handle, `aiKey`), `snapshots` (autoIncrement; labelled ones never pruned). **Chrome shares one IndexedDB origin across every `file://` page**, so every local HTML file sees the same store — never open 2.0 against the upgraded store, and expect test pages to share state unless they use their own browser context.

**Schema 3 shape.** `regions[]`, `districts[]` (`parentId`, `type` borough/district, `polygons`, derived `core`), `neighborhoods[]`, `buildings[]` (see lifecycle fields above plus `roadId`, `entrance`, `footprint`, `floorArea`, `listings[]`, `transactions[]`, `migrationNotes[]`, `legacyStatus`), `roads[]` RD-, `tracks[]` TR-, `lines[]` TL-, `stations[]` ST-, `businesses[]` BZ-, `tenancies[]`, `archive[]` (chronicle), `news { items, decisions, log, lastSync, lastError, rules }`, `legacy { parcels, parcelLinks, notes }`, `meta { seq, hseq, gseq, migrations }`, `settings`. Derived fields written on export (`*Name`, `*Reg`, `district`, `region`, `lengthBlocks`…) are ignored on import. The master file carries a `readme` string describing all of this for AI readers.

**Invariants to protect.**
- `id` and `reg` are immutable; new numbers come from `meta.seq/hseq/gseq`; former numbers go to `formerRegs`.
- After changing `physical` / `market` / `landmark`, `status` must be re-derived via `summaryStatus(b)`.
- Half-year math lives in `hyIndex / hyFromIndex / stateAtHY / completedAt / constructionAt / vacantAt`; counting is strict and undated records are reported separately — never count them as new.
- `drawScene(R)` is the one renderer shared by the map workspace and the viewer (`R.hy` set = historical mode, `R.anim` = tween). Change it once, check both.
- After any road geometry change set `JUNCTION_CACHE.key = ''`.
- `mergePayload` forces merge mode for filtered payloads and temp-migrates schema <3 payloads.
- `SAVE.write` is the persistence hook (tests monkeypatch it to simulate failures).
- Secrets: nothing but `handles.aiKey` in IndexedDB; nothing in exports or source.

**Styling.** CSS tokens in `:root` (`--bg`, `--ink-*`, `--cyan`, `--hist`, `--road`, `--transit`, `--biz`, `--region`, `--dock-w`…). Fonts: Chakra Petch (display) + JetBrains Mono (data) from Google Fonts with system fallbacks. Breakpoints: 1280 / 1200 / 1100 / 980 / 760 / 640. The shell is `#app` grid `minmax(0,1fr)` so the top bar can never widen the page.

**Testing approach.** Playwright headless Chromium, `--allow-file-access-from-files`, seed IndexedDB with a real backup, visit every view, fail on any console/page error, screenshot everything, run on **real data** (export a full backup first). Keep this bar: no feature ships without a check, and nothing is reported as done that the harness has not exercised.

---

## 4. Known errors, limitations and gotchas

### 4.1 Honest limitations of 2.5 (tell Claude Code; see the migration guide for detail)
- Live `feed.xml` cannot be read from a `file://` page until the site sends `Access-Control-Allow-Origin: *` for `/feed.xml` (one line in `vercel.json` of newa-site). File import and vault `feed.xml` work.
- No background sync; news refreshes only while the app is open.
- The optional AI provider was never run against a live service.
- Folder linking (File System Access API) is untestable headless; same code path as 2.0, checked by reading.
- Google Fonts need internet; offline falls back to system fonts.
- The Businesses page ships empty: there is no importer from the site's markets section yet (bug 5 below).

### 4.2 Bugs reported by Isaiah on Oct 4 2026 — with diagnosis

1. **No hover card in the playback viewer.** In `hvWire()` (§14) the canvas `pointermove` handler only changes the cursor (`c.style.cursor = hit ? 'pointer' : ''`). Fix: on a `hvHit()` result call the existing `showHover(hit.id, e.clientX, e.clientY)` (§5) and `hideHover()` when nothing is hit or on leave. `#hover` is `z-index:110`, above the viewer (`.hv-root` is 100), so it will render on top. Intended: same card as the main map (name, number, status at that half-year would be a bonus).

2. **Demolished buildings stay as ghosts forever in playback.** In `drawScene` (§13) the `state === 'gone'` branch draws the dashed ⊗ ghost whenever `hy != null`; the `L.historical` ("Ghosts") layer is only consulted when `hy == null`, so in the viewer the toggle has no effect and ghosts never go away. Intended: show the ghost for about a year after demolition (demolition index to index + 2 half-years), fading out over that period, then nothing; let the Ghosts toggle control it in the viewer too (and consider a "show all ghosts" variant). `demolishedIndex(b)` already exists for the math.

3. **Clicking the chronicle thumbnail in the viewer opens the image behind the viewer.** Stacking: `.hv-root` is `z-index:100`, `#modal-root` is 90 and `#drawer` is 80, so the archive viewer modal (and the record drawer opened by clicking a building dot in `hvWire` → `openBuilding`) appear underneath the playback overlay. Fix: raise `#modal-root` and `#drawer` above the viewer while it is open (e.g. a class on `body` when `HV.open`), or open the chronicle image inside the viewer panel. Keep `#toasts` (120) and `#hover` (110) on top.

4. **Giant play triangle in the chronicle viewer.** The "Open playback in YYYY" control in the archive viewer (§14, `<button class="rowlink" data-act="hv-open-year">${icon('play')}…`) uses `icon()`, which emits an unsized `<svg>`; `.rowlink svg` has no size rule, so the browser's default 300×150 SVG box renders. Fix: `.rowlink svg{width:12px;height:12px;vertical-align:-2px}` (or give the button the `.btn` class).

5. **Businesses page is empty — should auto-fill from the New A site.** The site has a markets section (companies, tickers, simulated prices). Build an importer that reads the site's market data (check the newa-site repo for the data model and API routes; add a CORS header or a JSON export the way `feed.xml` works) and proposes businesses into the confirmation inbox: name, ticker, sector/category, status, exchange-listed flag; prices and any derived figures are `basis: 'simulated'`, never `recorded`. The site reads the registry too, so its restatements of registry data must never be treated as confirmation (same rule the news pipeline already follows).

6. **Auto-connect buildings to roads by street name.** A building whose `street` field (or address text, e.g. "1493 Mill Street") matches a road's `name` / `aliases` / `formerNames` (normalised, case-insensitive) should get that `roadId` automatically, with a visible bulk action ("Link 23 buildings on Mill Street") and an undo; name match should outrank the proximity suggestion (`roadSuggest`, §7). Also when a road is created or renamed, offer to link the matching unlinked buildings. Never overwrite a `roadId` the user set by hand without asking.

### 4.3 Gotchas met during the 2.5 build (avoid regressions)
- A duplicate top-level identifier anywhere in the concatenated script kills the whole app at parse time (it happened with `stripHTML`; the news helper is now `htmlToText`). Always `node --check` the built script.
- Debounced autosave: tests that reload must wait for the flush (there is a `visibilitychange` flush; the harness waits ~900 ms).
- `saveOtherDrawer` replaces the object in its collection (`coll[i] = d`), so stale references go dead — re-fetch by id.
- `String.replace` vs `replaceAll` on feed fixtures changed a link but not the guid and produced a false "revision".
- Road extend-from-start must `slice(1).reverse()` or the start vertex duplicates; double-click finishing used to toast "vertex already there".
- A filtered extract (`kind:'scope'`, scope all) could replace the whole world before `mergePayload` was fixed.
- Legacy `yearBuilt` in the future on a construction project must become `yearExpected` (with a migration note).
- Toasts stack when actions are fired faster than a human can (only in tests).

---

## 5. What Isaiah wants next

### 5.1 Fixes first
The six bugs in §4.2, plus the `vercel.json` CORS header for `/feed.xml` on the site so live news works from the file.

### 5.2 V3 — the map and the look
- A **Google-Maps-like system** inside the registry: a map you pan and search like Google Maps, with layers, place cards, directions along the drawn roads, street labels that follow the road, satellite-style basemap (the rendered city) and the registry's data on top.
- **Branding, in his words:** keep the name "GOOGLE" but do not copy the Google logo — the wordmark should be in a blocky, Minecraft-like pixel font, like the one used in the Chronicle (Silkscreen). Treat it as New A parody branding, consistent with how the city already parodies real institutions.
- **Review `New-A-Chronicle_1.html`** (full HTML read, not a skim) and carry its best ideas into V3: the dark-first display, Silkscreen + Bricolage typography, count-up statistics, sliders, evidence-visible dating. Combine with current UI research so V3 is sleek *and* usable — uncluttered is still the rule.

### 5.3 "New A OS" — view and back up the world, do not edit it (YET)
Discussed Oct 4 2026; nothing built yet. The design intent, in order of value:

1. **Desktop wrapper** around the existing HTML (Tauri preferred for size; Electron acceptable) with a tiny bridge: read/write the vault without permission prompts, fetch without CORS, read the Minecraft save folder. The registry stays plain JSON.
2. **World reader (read-only).** Watch `region/*.mca`; use each region file's per-chunk timestamp table to re-parse only changed chunks; build a surface model (top block + height per column); classify by a palette Isaiah teaches once (asphalt, sidewalk, lane markings…); trace roads (mask → centreline → polylines + junctions, snapped to registry roads); cluster buildings (footprint polygon, height, floor estimate, materials); match to registry records by x,z (118 of 119 have coordinates). Labels from sign text in chunks, JourneyMap waypoints (`.minecraft/journeymap/data/sp/<world>/…`), MTR station data for the transit layer; otherwise a suggested address from the nearest road.
3. **Confirmation inbox.** Everything the reader finds is a *proposal* (before/after, apply, undo) exactly like the news inbox — the app never writes to the registry on its own, and never to the save.
4. **Backups.** One-click "Backup New A": wait for a quiet save, copy, verify every region file parses, keep a manifest (date, play time, changed chunks, registry state, JourneyMap data); incremental (unchanged region files shared between snapshots); "open this snapshot as a new save" (restore test); scheduled after every session + monthly full + mirrored to a second drive when it is attached. Alerts: Windows notification on failure *and* when the world was played but not backed up in a week; an always-visible health tile ("last verified backup 2 days ago · 41 snapshots · restore test passed Oct 1"); periodic automatic restore test.
5. **Historic snapshots.** Run the detector across his existing world backups to bracket first/last appearance of every building → proposed `yearBuilt` / `yearDemolished` with "from backups" confidence and evidence; keep taking dated surface snapshots going forward ("git for the city") so the half-year viewer gets real frames.
6. **New settlements.** A cluster of buildings/roads outside every drawn border → "new settlement at (x,z): N buildings, M roads — create a borough?" with a suggested border.
7. **Phase 2 (later, only when he says so):** a small Forge 1.20.1 mod streaming block events / player position to the app, JourneyMap overlay API to draw the registry's borders inside the game, screenshots into the chronicle, RCON once New A runs as a server at newacity.net. Still no editing of the world.

First step for the OS, before building any app: run a prototype detector on `The World - Full` (read-only) and show what streets it traces and what buildings it finds, measured against the 153 existing records.

---

## 6. Rules (from Isaiah and the 2.5 brief — not negotiable)

- **NO MISTAKES.** Verify on his real data before claiming anything works. Zero console errors is the bar.
- Preserve every existing record, id, registration number, photo, relationship and chronicle entry. Never renumber. Migrations keep an untouched copy first.
- Take care of the JSON files: backup before any write that could lose data; never let a filtered or partial file replace the world.
- The world save is read-only. Never modify, move or "optimise" `The World - Full` or any save folder.
- Do not present inactive buttons, simulated AI responses or untested integrations as completed features. Report what was tested and what still needs configuration.
- Never embed secret provider keys in the HTML, exports or shared data; do not hard-code credentials.
- Nothing posts to or modifies the website unless Isaiah explicitly asks.
- Keep the UI uncluttered and top-notch; he must be able to *see* the change when he opens the file.
- Make reasonable design decisions without stopping for minor preferences; stop and ask only when a path is irreversible.

---

## 7. Prompt for Claude Code

```
You are taking over the New A Land Registry — a private, local-first, single-file HTML app (vanilla JS,
canvas map, IndexedDB + File System Access vault) that records every building, road, transit line,
business and historical change in Isaiah's Minecraft city, New A, from 2013 to today.

Read, in this order, before changing anything:
1. NEW-A-HANDOFF-for-Claude-Code.md — the whole file. It has the architecture, invariants, verified
   features, known bugs with diagnoses, the roadmap and the rules.
2. Registry-2.5-Migration-Guide.md
3. The source tree in NewA-Registry-2.5-source.zip (parts/, build.py, test.js, smoke.js). The HTML is a
   build output; work in parts/ and rebuild with `python3 build.py`.
4. NewA-Land-Registry-v2.5.html — the delivered 2.5 app, to confirm the build reproduces it.
5. C:\Users\Admin\Downloads\New-A-Chronicle_1.html — read the full HTML. Its dark display, Silkscreen +
   Bricolage typography, count-up statistics and evidence-first dating are the style reference for V3.

Then work in this order, finishing and verifying each step before the next:

STEP 0 — Safety and baseline. Export a full backup of my current registry (Vault → full backup) and keep
it untouched. Get the Playwright harness running on my machine (`node test.js` → 96/96, `node smoke.js`
→ 0 errors) against the unchanged 2.5 build so you know the baseline is green before you edit.

STEP 1 — Fix the six bugs in §4.2 of the handoff (viewer hover card; ghosts fading out ~1 year after
demolition and obeying the Ghosts toggle; modal/drawer stacking above the playback viewer; the giant
play icon; a businesses importer from the New A site's markets section, proposals only, simulated basis;
auto-linking buildings to roads by street name with a bulk action and undo). Add a harness check for
each fix. Also add the Access-Control-Allow-Origin header for /feed.xml in the newa-site repo
(C:\Users\Admin\Documents\newa-site) so live news works — do not change anything else on the site.

STEP 2 — V3 map. Design and build the Google-Maps-like map system described in §5.2: pan/search/layers,
place cards, street labels along roads, the rendered city as basemap when available, registry data on
top; parody branding that keeps the name GOOGLE in a blocky Minecraft-style pixel font (Silkscreen),
never the Google logo. Study the Chronicle file and current UI best practice first; propose the layout
with a short written plan and mockup screenshots before building; keep it uncluttered.

STEP 3 — New A OS (view and back up the world, do NOT edit it yet), per §5.3. Start with a read-only
prototype detector against C:\New A - 1.20.1 FORGE TEST 02\saves\The World - Full that shows which
streets it traces and which buildings it finds versus the 153 records; then the desktop wrapper (Tauri
preferred), the confirmation inbox, and the verified incremental backup system with scheduling, health
tile and failure/missed-backup alerts. The world save is read-only at every stage.

Rules at all times: NO MISTAKES — verify on my real data, zero console errors; preserve every record,
id, number, photo, relationship and chronicle entry; back up before any write that could lose data; the
registry stays plain JSON an AI can read; never embed keys or credentials; never post to or modify the
website beyond the one header; do not present inactive buttons, simulated results or untested
integrations as done — report exactly what was tested and what still needs configuration; make
reasonable design decisions without stopping for minor preferences, and stop only before anything
irreversible. Deliver the rebuilt single HTML file, the updated source tree, and a factual list of what
was verified and what was not.
```
