# New A OS

The private, local-first record of New A — Isaiah's Minecraft city. One HTML file that runs from a double-click, a plain-JSON registry an AI can read, and a small optional bridge that reads the world save and keeps verified backups.

```
app/        the single-file app (built from parts/) + the test harness
os/         the New A OS bridge (Node, no dependencies) + its tests + a Tauri scaffold
docs/       original brief, handoff for the next session (HANDOFF-V3.md), verification report, roadmap
newa-site-patch/  the one CORS header for the site's feed
```

## Build and test

```
cd app
python3 build.py            # parts/p00…p31 + css → NewA-Land-Registry.html (node --check on the bundle)
node test.js                # 326 checks in headless Chromium on the real schema-2 data (sections A–X)
node smoke.js               # every page, tab and modal with zero console errors
cd ../os && node test/run.js   # 70 bridge checks (NBT, region formats, scans, backups, routes, item maps)
```

Playwright's Chromium is expected at `/opt/pw-browsers/chromium` (edit the path at the top of the harness files otherwise).

## Run

Open `app/NewA-Land-Registry.html`. Link a vault folder under **Vault** so `Registry.json` (and `NewA.json` for the site) are written to disk.

Optional bridge, for backups, world scans and live feeds:

```
cd os
node server.js --vault "<vault folder>" --world "<.minecraft/saves/New A>"
```

The world folder is only ever read. See `os/README.md`.

## What is in V3

* **Shell** — Silkscreen + Bricolage Grotesque, left rail, count-ups, boot readout. Keys: `O` Home · `M` Map · `R` Registry · `T` Transit · `C` Civic · `B` Business · `H` History · `K` Clawson · `G` scope · `/` search · `?` all shortcuts.
* **Map** — Google-Maps-like explore mode (search, place cards, street labels, turn-by-turn walking directions over the road graph, dated basemaps) with the full 2.5 edit workspace behind **Edit map** (`E`).
* **History** — playback with six speeds, previous/next change, kind and place filters, A/B compare, inferred-vs-recorded marking, chronicle evidence on the timeline, dated renders (never a newer one behind an older one).
* **Civic** — hospitals, police, fire, city halls, the White House, schools, parks… with status, capacity, jurisdiction; officials with office **and home**; essential-service coverage by place.
* **Transit** — service scores (who is best served), estimated or measured travel times per line, journeys, a planning sandbox, service colour on the map.
* **Home** — city health, a profile written from the records, project tracker with chronicle evidence, data-quality assistant with snapshot-backed fixes, explainable estimated values.
* **Clawson** — answers from the records; every change becomes an Inbox proposal (apply/undo there); newsletter drafts from the change digest, published by you. Optional Anthropic or OpenAI-compatible provider, key kept in this browser only.
* **Inbox** — proposals from the site's news, the markets, world scans and Clawson, with conflicts shown and every applied change undoable; a Drafts tab.
* **OS bridge** — status tile, after-session and monthly backups verified by hash, restore tests, read-only world scans that propose buildings with middle coordinates, roads, updates, and a 1 block/pixel render as a dated basemap. With the bridge online and no folder linked, autosave writes the vault through it (no reconnect click).
* **Basemaps** — JourneyMap tile folders or export ZIPs are stitched and placed from their tile names, so 0,0 is derived, never calibrated; single images still work with a typed top-left corner.
* **Records** — dated road and track shapes for playback, an Unnamed switch for buildings, roads and lines, lot orientation with Rotate lot, Centre on footprint and Snap to street, an auto-estimate in the editor from nearby comparables and transit, and a Location map that opens the building in Maps.

## Round 3 (Oct 2026)

* **Transit, rebuilt** — draw a line and its stops in one go: click an existing station to stop there (that makes it a transfer), `Alt`-click or **Stop at every click** (`T`) to drop new stops. Station mode (`X`) puts a station on every line whose track it touches and slots it into each line in order. Line inspector: inline stop names, *Order along track*, hours, width; station inspector: lines here, transfers to stations within 80 blk, status (now incl. **Partly open**), hours (**24/7**, daytime, rush hours, custom), grade, construction dates, cost. Lines are drawn thicker with a dark casing; the Transit chip still hides them on the live map.
* **Train dashboard** — Transit opens on **Board**: simulated departures (headway, hours, stop times; labelled simulated), line status, a trip planner that changes lines, and what is coming. **Projects**: stations and lines under construction or planned with progress and cost (recorded, else an editable cost model), plus a new-project calculator.
* **Values** — a station under construction lifts nearby values by 35 % of an open one, planned 10 %, part-time 60 %; 24/7 service adds +6 % on top (all editable in the valuation settings).
* **Dated shapes** — every road and track has a shape history: 2013 E – 2018 E one shape, 2018 E – 2020 L the next, gaps for “removed, rebuilt later”. Edit the dates inline, *New shape from…*, *Removed in…*, *Rebuilt in…*. The map has a **viewing date** (bottom bar, `[` `]`): the city as it was, the old maps for that date under it, and anything you draw gets that date; dragging a road edits the shape in force then.
* **Lots** — *Draw lot* traces any shape; area, frontage (edges facing the street, corner lots flagged) and mean depth fill in. The Lots layer (Layers panel and the Lots chip) now really hides them.
* **Playback** — the slider glides (six speeds, a year per 20 s to two years per second), shows the month, and roads grow, lines extend, stations appear and buildings rise or fall the moment the playhead crosses the date. Ghosts fade within a year.
* **Old maps** — Minecraft's own `map_#.dat` files (from the world's or a backup's `data` folder) are read in the browser, placed from their centres and scale, dated early/late (or by file date) and stacked oldest → newest under playback, with an opacity slider. `node os/tools/mcmaps.js <world> --out maps.png` does the same from the command line.
* **Usability** — 20 audited fixes (Pick on the map fills the editor, shortcut keys never discard work, pickers return to their form, inbox keeps its place, validation focuses the field, phone layout without sideways scroll…). Ideas for what next: `docs/IDEAS.md`.

## 3.5 — Google-Maps-style roads, trains on the map, a calmer editor

* **One-way streets** — each road's Access can be One-way, and a one-way road knows which way it runs (first point → last, or reversed; the inspector has a flip button, the record a "One-way runs" field). The map draws very faint chevrons along one-way roads; hover or select the road and they brighten with a ONE WAY label. The hover card and the record say it in words ("one way eastbound →").
* **Directions obey them** — the directions panel now has **Drive** (default, 11 blocks/s): it follows the arrows, keeps off pedestrian-only and restricted roads, and goes round the block when it must; Walk and Sprint ignore arrows. Turn-by-turn says left, right, continue or sharp; one-way streets are marked; if no legal driving route exists it says so and suggests Walk.
* **Trains** — every open line runs trains on the live map, each headway from each end, within the line's hours, dwelling at every stop — on the same timetable the departure board shows, so the board and the map agree to the second. A **Trains** chip / layer hides them; the Board's line strips show where each train is.
* **A calmer building editor** — the long form is now eleven collapsible sections (Location, Lifecycle and Building & lot open by default), each closed one carrying a one-line summary of what it holds; a sticky Jump-to bar, Expand all / Collapse all, remembered per browser; a validation error opens the section it belongs to. Nothing was removed; the empty photo box is a slim row.
* **Valuation v2** — besides the nearest station: +1.5% per extra line within 150 blocks (cap +4.5%), a +25% cap on all transit factors, +3% for a corner lot (drawn outline facing two streets), +4% completed in the last five years, −3% completed ten or more years ago unless a landmark. All editable under Vault & settings; recorded valuations keep the version they were made with.
* **Round-4 audit — 25 fixes** — a read-only audit of rounds 1–3 on the real data (desktop and phone) found 25 reproducible faults, all fixed and each re-checked by section X: Add a listing / Record a transaction kept neither status nor price (the editor re-read the stale form); saving a station whose expected date had slipped turned it into an open station; the Board re-rendered the whole page every 15 s (focus and dropdowns lost) — it now swaps the clock, departures and strips in place; Enter/Backspace were dead while tracing a lot from the editor; playback showed no old maps until the Map page had been visited; Undo did not undo New shape from… / Rebuilt in…; Projection stretched the slider but not the ticks; the playback speed was never saved; Add → Chronicle image ignored the map date; Esc in an inspector field threw the typing away; a click 200 blocks from a selected line still became its stop; L after drawing a line added a second track to it; cost-model edits dropped the keyboard; empty Board/Times states hid that transit lies outside the current scope; the pencil on a dated shape left the drawer over the map; [ ] did nothing on the just-opened clock and still worked mid-drawing; maps added from playback missed the evidence track; the old-maps dialog ignored the typed year; Removed in… offered a date it then refused; on a phone the OLD MAPS bar covered the layer chips, the time panel was clipped, the status strip hid the time chip and the HUD ran off-screen; in compare mode the bar covered pane A's counters.

## Time button and a vault that stays linked (3.2.1)

* **Go back in time on the map** — the clock button on the map (explore and edit) opens a slider from Early 2013 to today. Slide back and the map is the city as it was: buildings standing then, roads and lines in the shape they had, the old maps for that date. Everything stays editable, and every new record — building, road, line, station, business, chronicle entry — takes the date you are in. An amber chip in the status bar shows the date anywhere in the app and goes back to today; `[` `]` step half a year on the map. A reload starts at today.
* **The vault folder stays linked** — when Chrome remembers the permission it reconnects silently; otherwise your first click anywhere reconnects it (choose “Allow on every visit” once and it never asks again). If the folder or its drive is not there, the status bar says so, edits keep saving in the browser, and the folder is written again as soon as it is back. It is only forgotten when you unlink it.

## Site link (3.2.0)

The **Site** screen (left bar, or `S` from any screen but the Map) links New A OS to newa-site.vercel.app: publish the registry by hand or automatically while open, push photos and the basemap, read the site back, and run the newsroom, City Hall and the market queue. It was built in the site repo on top of round 2 and is merged here onto round 3. Setup, auto-publish, errors and troubleshooting: `docs/SITE-LINK.md`.

## Rules the code keeps

Every record, number, photo, relationship and chronicle entry from 2.5 is preserved (schema 3 → 4 adds fields, changes none); nothing is renumbered; the registry stays plain JSON; the world save is read-only; no keys or credentials are ever written to files or exports; nothing posts to the website; every automated change goes through the Inbox and can be undone; the UI reports what was measured and what was estimated.
