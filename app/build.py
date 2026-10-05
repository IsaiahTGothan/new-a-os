#!/usr/bin/env python3
"""Assemble NewA-Land-Registry.html (New A OS · V3) from parts/."""
import os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
P = lambda *a: os.path.join(HERE, 'parts', *a)
JS_PARTS = ['p00_config.js', 'p01_refdata.js', 'p02_utils.js', 'p03_state.js', 'p04_persist.js', 'p05_shell.js', 'p06_charts.js', 'p07_engine.js',
            'p08_overview.js', 'p09_registry.js', 'p10_drawer.js', 'p11_records.js', 'p12_modals.js', 'p13_map.js', 'p14_history.js', 'p15_transit.js',
            'p16_business.js', 'p17_news.js', 'p18_assistant.js', 'p19_interactions.js', 'p19a_explore.js', 'p20_boot.js']
head = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NEW A OS</title>
<meta name="color-scheme" content="dark">
<meta name="description" content="New A OS — the operating system for the city of New A: registry, Google-Maps-style map, history playback, transit, civic database, businesses, chronicle, news and the world itself, 2013 to present.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%2305090D'/%3E%3Cpath d='M7 25V9l6 8V9M19 25l4-16 4 16M20.5 20h5' fill='none' stroke='%234FE3FF' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
'''
css = open(P('v2_css.css')).read() + '\n' + open(P('css_25.css')).read() + '\n' + open(P('v3_css.css')).read()
body = open(P('body.html')).read()
js = '\n\n'.join(open(P(f)).read().rstrip() + '\n' for f in JS_PARTS)
open(os.path.join(HERE, 'script.js'), 'w').write(js)
r = subprocess.run(['node', '--check', os.path.join(HERE, 'script.js')], capture_output=True, text=True)
if r.returncode:
    print(r.stderr); sys.exit(1)
html = head + css + '\n</style>\n</head>\n<body>\n' + body + '\n<script>\n' + js + '\n</script>\n</body>\n</html>\n'
out = os.path.join(HERE, 'NewA-Land-Registry.html')
open(out, 'w').write(html)
print(f'built {out} · {len(html)/1024:.0f} KB · js {len(js)/1024:.0f} KB · css {len(css)/1024:.0f} KB')
