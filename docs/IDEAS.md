# Ideas for what next — researched Oct 2026

Collected from games, transit agencies, historical-GIS projects and Minecraft tools. Each idea says why it fits New A OS. Items marked *(unverified)* come from general knowledge, not a page that was read; two sites (unmined.net, transitcosts.com) were blocked from this environment.

## Transit simulation & dashboards
1. **Per-line strip diagram with load** — Cities: Skylines' line panel shows every stop, waiting riders and vehicle load; CS2 players complain you must hover to see waits. New A already stores stops per line, so a strip diagram with transfer dots in each line's colour is cheap. <https://admin-forum.paradoxplaza.com/forum/developer-diary/cities-skylines-mass-transit-dev-diary-1-more-than-just-new-public-transport-types.1005446>
2. **Time-band schedules** — store first/last train and a headway per band (peak, midday, night) the way GTFS `stop_times` feed a board; the board already simulates from one headway and the hours. <https://developers.google.com/transit/gtfs-realtime>
3. **TfL-style status scale** — "Good service · Part closure · Planned closure · Closed" as one enum driving the board, the map styling and valuations. <https://tfl.gov.uk/status-updates/status-definitions>
4. **Lateness counter / even spacing** — OpenTTD timetables autofill and count lateness; a "+2 min" flavour already exists on the board. <https://wiki.openttd.org/en/Manual/Timetable>
5. **Schedules as their own object** — NIMBY Rails (2024) separated schedules from lines; a "24/7" or "rush-only" schedule could be shared and swapped on a date. <https://carloscarrasco.com/page/12/>
6. **Budget, bonds, pricing modes** — Subway Builder (2025–26) starts with a budget and uses non-US pricing; the cost model could offer "NYC" vs "European" presets. <https://en.wikipedia.org/wiki/Subway_Builder>
7. **Cost per daily rider next to cost per km** — the MTA defends Second Avenue Phase 1 at ~$31k per daily rider despite extreme per-mile cost. <https://www.vitalcitynyc.org/why-it-costs-4-billion-per-mile-of-subway-track.md>
8. **Transparent cost breakdown** — tunnel length × depth + stations + rolling stock, editable, the way the Transit Costs Project normalises figures. <https://marroninstitute.nyu.edu/initiatives/transit-costs-project>

## Historical maps
9. **Item maps place themselves** — done this round: `map_#.dat` carries centre and scale. Rust reference decoder: <https://docs.rs/crate/mc_map2png/latest>
10. **Control-point warping** for screenshots and hand-drawn plans: 2–3 points → affine fit, as NYPL Map Warper / Allmaps do. <https://editor.allmaps.org/>
11. **Key out a colour** — remove JourneyMap's black unexplored areas the way Allmaps removes backgrounds. <https://www.leventhalmap.org/projects/digital-projects/allmaps/>
12. **Swipe and spyglass** comparison between an old map and the recorded data. <https://www.gis.huri.harvard.edu/swipe-widget.md>
13. **Start/end dates on every geometry** — OpenHistoricalMap's model; New A's shape periods now match it. <https://wiki.openstreetmap.org/wiki/OpenHistoricalMap/News>
14. **"Map from Late 2016 (±1)" badge** per area in playback.

## Minecraft tools that can feed it
15. **BlueMap CLI** — renders a world folder (including a backup) offline to web tiles. <https://bluemap.bluecolored.de/wiki/getting-started/Installation.html>
16. **uNmINeD** — CLI/GUI that makes one top-down PNG per world folder; the easiest "one image per backup year" *(unverified — site blocked)*.
17. **squaremap / Dynmap** — server plugins; for a backup you would run a throwaway Paper server on a copy.
18. **Chunky (renderer)** — path-traced stills per era, for the chronicle. <https://github.com/orangechannel/chunky>
19. **JourneyMap / Xaero's World Map** — explored-only tiles; JourneyMap import already works.
20. **MCA Selector** — chunk *InhabitedTime* and last-modified heatmaps suggest when districts were built. <https://flathub.org/apps/io.github.Querz.mcaselector>
21. **Amulet (Python)** — read blocks from any version; a script could find rails in each backup and propose dated track shapes. <https://amulet-core.readthedocs.io/en/stable/getting_started/index.html>

## Property & urban analytics
22. **Uplift by phase** — Sydney light rail: about +3 % within 400 m at announcement and during construction; St Paul: +$9.20/sq ft at funding, +$13.70 by opening; a cancellation can erase it. The new construction/planned shares follow this. <https://arro.anglia.ac.uk/id/eprint/706973> · <https://www.cts.umn.edu/news-pubs/news/2017/june/light-rail>
23. **Service quality moves the uplift** −7.4 to +9.6 points (frequency, reliability) — the reason for the 24/7 bonus and the part-time share. <https://researchonline.lse.ac.uk/id/eprint/115511>
24. **Distance rings** ≤400 m / 400–800 m with a gradient (Debrezion et al.). <https://link.springer.com/article/10.1007/s11146-007-9032-z>
25. **Walk Score-style decay** — full credit within a 5-minute walk, zero at 30. <https://walkscore.com/methodology>
26. **15-minute-city score** — distinct amenity categories reachable in 15 minutes; the civic records can feed it per lot. <https://zenodo.org/doi/10.5281/zenodo.14231533>

## Map-editor usability
27. **Snap to share a node; hold a key to stop snapping** (JOSM Ctrl, iD Alt). <https://josm.openstreetmap.de/wiki/Shortcuts?version=84>
28. **Topology keys**: split (P), combine (C), join to way (J), disconnect, merge — splitting a road at a date is how one shape becomes the next. <https://wiki.openstreetmap.org/wiki/Kaart:_Keyboard_Shortcuts>
29. **iD-style 1/2/3 for point/line/area and A to continue a line**. <https://wiki.openstreetmap.org/wiki/ID/Shortcuts>
30. **"From this date onward" edits** — done this round as the map's viewing date.

## Numbers worth knowing
* Subway construction: US projects >80 % underground average **$354M/km** vs **$215M/km** abroad (Eno); Second Avenue Phase 1 ≈ **$1.5B/km**; Madrid Line 2 ≈ **$60M/km**. <https://enotrans.org/article/eno-releases-first-iteration-of-transit-construction-cost-database/>
* Headways: MTA guideline caps gaps at **10–12 min** daytime and **20 min** overnight; peak headways ~**2.5–9 min**. <https://www.mta.info/document/179601>
* Station uplift: ~**+3 %** within 400 m while announced/under construction; long-run gains can exceed **+30 %** within 800 m (commentary, not a paper).
* Walk radius: **400 m** full credit, zero at **30 min**.
* Item map: **128×128 blocks** at scale 0, **2048×2048** at scale 4.
