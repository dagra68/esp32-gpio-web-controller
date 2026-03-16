---
phase: 03-frontend-write-path
plan: "01"
subsystem: frontend
tags: [toggle, write-path, SSE, ESPHome, vanilla-js]
dependency_graph:
  requires: [02-frontend-read-path]
  provides: [WRITE-01]
  affects: [gpio-ui.js, index.html]
tech_stack:
  added: []
  patterns: [event-delegation, inFlight-Set, fetch-POST, CSS.escape, encodeURIComponent]
key_files:
  modified:
    - D:/_vibecoding/_claude/esp32-gpio-controller/gpio-ui.js
    - D:/_vibecoding/_claude/esp32-gpio-controller/index.html
decisions:
  - "Event delegation on #pin-grid (not per-button listeners) because upsertPin() replaces card DOM on every SSE state event, destroying any direct button listeners"
  - "inFlight Set at module level prevents concurrent POSTs per pin without a per-pin timer"
  - "CSS.escape(nameId) used in showToggleError querySelector to handle slash and space characters in name_id strings like 'switch/GPIO 3'"
  - "No template literals anywhere in new code — ESPHome js_include embed context requires ES5-compatible strings"
metrics:
  duration: "~2 minutes"
  completed_date: "2026-03-16"
  tasks_completed: 2
  files_modified: 2
requirements:
  - WRITE-01
---

# Phase 3 Plan 01: Frontend Write Path — Toggle Button Summary

**One-liner:** Toggle button on OUTPUT pin cards sends POST /switch/GPIO%20N/toggle via fetch, guarded by an inFlight Set, with inline error display on failure.

## What Was Built

Extended the vanilla JS frontend (no framework, no build step) with the WRITE-01 write path:

- `inFlight` Set at module level — prevents concurrent POSTs to the same pin
- `buildCard()` extended — emits `<button class="toggle-btn">` only for `pin.domain === 'switch'` cards
- `sendToggle(nameId)` — constructs `POST /switch/GPIO%20N/toggle` using `encodeURIComponent`, guards with `inFlight`, calls `showToggleError()` on non-ok or network failure
- `showToggleError(nameId, msg)` — locates card via `CSS.escape(nameId)`, appends `.toggle-error` div, re-enables button, clears message after 3s
- Delegated click handler on `#pin-grid` — fires `sendToggle` on `.toggle-btn` clicks; disables button immediately to prevent double-fire
- `.toggle-btn`, `.toggle-btn:hover`, `.toggle-btn:disabled`, `.toggle-error` CSS rules added to index.html

## Deviations from Plan

None — plan executed exactly as written.

The plan's verify comment for `sendToggle` count said "3 or more (definition + call in handler + call in catch path)" but the catch path calls `showToggleError`, not `sendToggle`. The actual count of 2 is correct for the specified implementation. All other verification checks passed at expected counts.

## Self-Check

Files exist:
- D:/_vibecoding/_claude/esp32-gpio-controller/gpio-ui.js — FOUND
- D:/_vibecoding/_claude/esp32-gpio-controller/index.html — FOUND

Commits:
- 4159935: feat(03-01): add toggle logic to gpio-ui.js
- c2586e9: feat(03-01): add toggle button CSS to index.html

## Self-Check: PASSED
