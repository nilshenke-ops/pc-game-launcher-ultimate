#!/usr/bin/env bash
# Companion process cost (Core logic, headless build on Linux – not the Windows build): CPU time and memory over 60 s,
# 1) idle without clients, 2) with one dashboard open (live values every 2 s). Usage: perf-companion.sh <pid> <admin-token> <dir>
pid=$1; token=$2; dir=$3
cpu() { awk '{print $14+$15}' /proc/$pid/stat; }
rss() { awk '/VmRSS/{print $2}' /proc/$pid/status; }
hz=$(getconf CLK_TCK)
a=$(cpu); sleep 60; b=$(cpu)
echo "{\"case\":\"idle, no client\",\"cpuPercent\":$(echo "scale=2; ($b-$a)*100/$hz/60" | bc),\"rssMB\":$(( $(rss)/1024 ))}"
(cd "$dir" && node -e '
const { chromium } = require("@playwright/test");
(async () => { const b = await chromium.launch(); const c = await b.newContext(); await c.addInitScript((t) => { window.__PGL_ADMIN__ = t; }, process.argv[1]);
const p = await c.newPage(); await p.goto("http://127.0.0.1:8791/#/"); await p.waitForTimeout(75000); await b.close(); })();' "$token") &
sleep 10; a=$(cpu); sleep 60; b=$(cpu)
echo "{\"case\":\"dashboard open (live values)\",\"cpuPercent\":$(echo "scale=2; ($b-$a)*100/$hz/60" | bc),\"rssMB\":$(( $(rss)/1024 ))}"
wait
