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
python3 build.py            # parts/p00…p25 + css → NewA-Land-Registry.html (node --check on the bundle)
node test.js                # 240 checks in headless Chromium on the real schema-2 data (sections A–S)
node smoke.js               # every page, tab and modal with zero console errors
cd ../os && node test/run.js   # 61 bridge checks (NBT, region formats, scans, backups, routes)
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

## Rules the code keeps

Every record, number, photo, relationship and chronicle entry from 2.5 is preserved (schema 3 → 4 adds fields, changes none); nothing is renumbered; the registry stays plain JSON; the world save is read-only; no keys or credentials are ever written to files or exports; nothing posts to the website; every automated change goes through the Inbox and can be undone; the UI reports what was measured and what was estimated.
