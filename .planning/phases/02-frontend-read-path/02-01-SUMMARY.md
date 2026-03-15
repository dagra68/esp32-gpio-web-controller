---
phase: 02-frontend-read-path
plan: 01
subsystem: frontend
tags: [vanilla-js, eventsource, sse, css-grid, gpio, html, connection-status]

# Dependency graph
requires:
  - phase: 01-02
    provides: "Live ESPHome device at 10.1.1.162 with confirmed SSE/REST API"
provides:
  - "esp32-gpio-controller/index.html — development HTML shell"
  - "esp32-gpio-controller/gpio-ui.js — complete frontend: SSE hydration, pin grid, connection banner"
  - "esp32-gpio-controller/gpio-controller.yaml — updated with js_include: gpio-ui.js (local: true removed)"
affects: [02-02]

# Tech tracking
tech-stack:
  added: [native EventSource API, CSS Grid, vanilla JS]
  patterns:
    - "SSE ping event as initial burst complete signal — one renderGrid() call after all 11 states buffered"
    - "EventSource.CLOSED check in onerror — manual setTimeout reconnect only when browser gives up"
    - "Map keyed by name_id — upsertPin replaces single card on live updates; renderGrid on initial burst"
    - "500ms fallback timer — renders even if ping event ordering differs from observed behavior"
    - "DEVICE_HOST resolved from location.hostname — works cross-origin (localhost dev) and same-origin (device)"

key-files:
  created:
    - esp32-gpio-controller/index.html
    - esp32-gpio-controller/gpio-ui.js
  modified:
    - esp32-gpio-controller/gpio-controller.yaml

key-decisions:
  - "Single gpio-ui.js file with no ES modules — compatible with js_include embed and local dev server"
  - "Removed local: true from YAML — incompatible with js_include (ESPHome issue #5704)"
  - "ping event as burst-complete signal with 500ms setTimeout fallback — handles uncertain SSE event ordering"
  - "innerHTML string concatenation over template literals — avoids accidental backtick escaping in embedded context"

patterns-established:
  - "Pattern 7 - SSE hydration: connect() -> buffer state events -> ping fires -> renderGrid() once"
  - "Pattern 8 - Reconnect: onerror checks readyState; CLOSED -> setTimeout(connect,3000); CONNECTING -> banner only"
  - "Pattern 9 - Dev workflow: python -m http.server 8080 in esp32-gpio-controller/ -> http://localhost:8080/index.html"

requirements-completed: [READ-01, READ-02, READ-03, READ-04, READ-05]

# Metrics
duration: ~15 min (autonomous agent)
completed: 2026-03-16
---

# Phase 2 Plan 01: Frontend Files Summary

**Two files created, YAML updated — frontend complete pending user reflash in Plan 02-02**

## Performance

- **Duration:** ~15 minutes (fully autonomous)
- **Tasks:** 3 of 3 (Task 1 index.html, Task 2 gpio-ui.js, Task 3 self-check; Task 4 smoke test is user-executed)
- **Files created:** 2 (index.html, gpio-ui.js)
- **Files modified:** 1 (gpio-controller.yaml)

## Accomplishments

- `index.html`: dark-themed development shell with CSS Grid layout, status banner, pin grid container
- `gpio-ui.js`: complete 114-line frontend covering all five READ requirements
  - SSE hydration via EventSource with ping-based burst detection and 500ms fallback
  - Incremental pin updates (single card replace) on live SSE state events
  - Three-state connection banner: connected (hidden), reconnecting (yellow), disconnected (red)
  - Manual reconnect via `setTimeout(connect, 3000)` when `readyState === CLOSED`
  - Device host resolution: `10.1.1.162` when served from localhost, `location.host` when device-served
- `gpio-controller.yaml`: `js_include: gpio-ui.js` added, `local: true` removed (ESPHome issue #5704)

## Self-Check Results

```
[x] index.html contains: id="status-banner", id="pin-grid", script src="gpio-ui.js"
[x] gpio-ui.js contains: EventSource, name_id, initialBurstDone, setStatus, buildCard, renderGrid, upsertPin, connect
[x] gpio-ui.js contains: readyState === EventSource.CLOSED check in onerror
[x] gpio-ui.js contains: ping event listener that triggers renderGrid
[x] gpio-ui.js contains: 10.1.1.162 as dev device IP
[x] gpio-ui.js does NOT use import/export
[x] gpio-controller.yaml contains: js_include: gpio-ui.js
[x] gpio-controller.yaml does NOT contain: local: true (active)
[x] All GPIO entity definitions unchanged
[x] All commits present
```

## Task Commits

1. `feat(02-01): add index.html development shell`
2. `feat(02-01): add gpio-ui.js — SSE hydration, pin grid, connection status`
3. `feat(02-02): embed gpio-ui.js in device flash via js_include`

## Next: Plan 02-02

User must reflash the device to activate `js_include`. From the `esp32-gpio-controller/` directory:

```
esphome run gpio-controller.yaml
```

Then verify at `http://10.1.1.162` — should show the custom pin grid, not the default ESPHome v3 UI.

Dev server still works in parallel: `python -m http.server 8080` -> `http://localhost:8080/index.html`

---
*Phase: 02-frontend-read-path*
*Completed: 2026-03-16*
