# Registry 2.5 — source tree, build script and test harness

This is the exact source that produced `NewA-Land-Registry-v2.5.html` (Oct 4 2026).
The single HTML file is a BUILD OUTPUT. Work here, then rebuild.

    python3 build.py            # concatenates parts/ -> NewA-Land-Registry.html (runs `node --check` on the JS first)
    node test.js                # 96 acceptance checks (headless Chromium via Playwright), writes shots/*.png
    node smoke.js               # boots fresh + on the real data fixture, visits every view, reports console errors
    node shots-resp.js          # responsive screenshots at 1024 and 390 px

## Layout
- parts/body.html      — markup (top bar, rail, main, drawer, modal root, hover card, toasts, SVG icon sprite, hidden file inputs)
- parts/v2_css.css     — styles inherited from 2.0;  parts/css_25.css — everything new in 2.5 (tokens, map workspace, viewer, dock, responsive)
- parts/p00…p20_*.js   — one file per § section, concatenated in this order by build.py (classic script, top-level const/let, no modules)
- v2-state.json        — a schema-2 browser store rebuilt from Isaiah's real NewA.json + OtherDistricts.json (153 buildings); the tests seed IndexedDB with it

## Harness notes
- test.js/smoke.js launch Chromium with `executablePath: '/opt/pw-browsers/chromium'` and `--allow-file-access-from-files`; on another machine drop
  executablePath (after `npx playwright install chromium`) and keep the flag.
- The page is opened from file://; the harness waits for `typeof S !== 'undefined' && !document.getElementById('boot')`.
- Console errors fail a section, except network errors matching /ERR_TUNNEL_CONNECTION_FAILED|Failed to load resource/ and the deliberate
  `console.error('save failed')` produced by the failed-save test.
- Each section seeds its own browser context; nothing touches a real vault folder (the File System Access API is unavailable headless).
